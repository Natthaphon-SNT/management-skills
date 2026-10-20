import JSZip from 'jszip';
import {z} from 'zod';
import {prisma,sqlTable} from './prisma';
import {assertAdmin,type Actor} from './auth';
import {audit,lockYear} from './records';
import {bangkokToday,dateOnly,day} from './calendar';
import {AppError,asJson,randomToken,sha256} from './security';
import {reportData} from './reports';
import {makeExport} from './exports';

export const ANNUAL_REPORT_KIND='annual_zip';
const metadata=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export async function storageUsage(){
  const configured=Number(process.env.DATABASE_STORAGE_LIMIT_MB??1000);
  const limitMb=Number.isFinite(configured)&&configured>0?configured:1000;
  const [row]=await prisma.$queryRaw<{used:bigint,attachments:bigint,reports:bigint,backups:bigint}[]>`SELECT pg_database_size(current_database())::bigint AS used,
    (SELECT COALESCE(SUM(octet_length(data)),0)::bigint FROM ${sqlTable('attachments')}) AS attachments,
    (SELECT COALESCE(SUM(octet_length(data)),0)::bigint FROM ${sqlTable('export_jobs')}) AS reports,
    (SELECT COALESCE(SUM(octet_length(data)),0)::bigint FROM ${sqlTable('archive_manifests')}) AS backups`;
  const usedBytes=Number(row.used),limitBytes=Math.floor(limitMb*1_000_000);
  return {usedBytes,limitBytes,percent:Math.round(usedBytes/limitBytes*10000)/100,attachments:Number(row.attachments),reports:Number(row.reports),backups:Number(row.backups),checkedAt:new Date().toISOString()};
}
export type StorageUsage=Awaited<ReturnType<typeof storageUsage>>;
async function notifyAdmins(yearId:string,key:string,message:string,at=new Date()){
  const admins=await prisma.user.findMany({where:{role:'ADMIN',active:true,deletedAt:null,approvedAt:{not:null},personId:{not:null},person:{deletedAt:null}},select:{id:true,email:true}});
  const data=admins.flatMap(admin=>(admin.email?['in_app','email']:['in_app']).map(channel=>({fiscalYearId:yearId,userId:admin.id,idempotencyKey:`${key}:${admin.id}:${channel}`,message,channel,status:channel==='in_app'?'sent':'pending',sentAt:channel==='in_app'?at:null})));
  if(data.length)await prisma.notification.createMany({data,skipDuplicates:true});
}
export async function enqueueStorageWarnings(usage:StorageUsage,at=new Date()){
  const level=usage.percent>=90?90:usage.percent>=80?80:0;
  if(!level)return {level:0};
  const year=await prisma.fiscalYear.findFirst({where:{state:{not:'purged'}},orderBy:{year:'desc'},select:{id:true}})
    ??await prisma.fiscalYear.findFirst({orderBy:{year:'desc'},select:{id:true}});
  if(!year)return {level};
  const week=Math.floor(+dateOnly(bangkokToday(at))/(7*86400000));
  const message=`${level===90?'เร่งด่วน: ':''}พื้นที่ฐานข้อมูลหลักใช้ประมาณ ${(usage.usedBytes/1_000_000).toFixed(1)} MB จากเกณฑ์ ${(usage.limitBytes/1_000_000).toFixed(0)} MB (${usage.percent.toFixed(1)}%) ถึงระดับเตือน ${level}% กรุณาดาวน์โหลดรายงานและชุดสำรอง ตรวจที่เก็บภายนอก แล้วจัดการข้อมูลปีเก่าตามขั้นตอนก่อนพื้นที่เต็ม ZIP ที่ค้างอยู่ก็ใช้พื้นที่ด้วย ระบบจะไม่ลบให้เอง ตัวเลขนี้วัดเฉพาะฐานหลัก ต้องตรวจโควตารวมโปรเจกต์ใน Neon เพิ่มเติม /admin/retention`;
  await notifyAdmins(year.id,`storage-warning:${level}:${week}`,message,at);
  return {level};
}

// One ended fiscal year per daily run. A year lock makes overlapping Cron calls idempotent.
export async function createAnnualReport(at=new Date(),usage?:StorageUsage){
  if(process.env.AUTO_ANNUAL_REPORTS_ENABLED==='false')return {status:'disabled'};
  if((usage??await storageUsage()).percent>=90)return {status:'paused_storage'};
  const owner=await prisma.user.findFirst({where:{role:'ADMIN',active:true,deletedAt:null,approvedAt:{not:null},personId:{not:null},person:{deletedAt:null}},orderBy:{id:'asc'},select:{id:true,role:true,personId:true,name:true,username:true,active:true,approvedAt:true}});
  if(!owner)return {status:'no_admin'};
  const today=bangkokToday(at),years=await prisma.fiscalYear.findMany({where:{endsOn:{lt:dateOnly(today)},state:{not:'purged'}},orderBy:{year:'asc'}});
  for(const year of years){
    const token=randomToken();
    const job=await prisma.$transaction(async tx=>{
      const locked=await lockYear(tx,year.id,false);
      if(locked.state==='purged'||day(locked.endsOn)>=today)return null;
      const existing=await tx.exportJob.findFirst({where:{fiscalYearId:year.id,kind:ANNUAL_REPORT_KIND,dataVersion:locked.dataVersion},orderBy:{createdAt:'desc'},select:{id:true,status:true,filters:true}});
      if(existing){
        const meta=metadata(existing.filters);
        // Released files stay released until the year's source data changes.
        if(['completed','released'].includes(existing.status)||Number(meta.leaseUntil)>Date.now()||meta.lastAttemptDay===today)return null;
        return tx.exportJob.update({where:{id:existing.id},data:{status:'pending',error:null,filters:asJson({automatic:true,token,leaseUntil:Date.now()+60000,lastAttemptDay:today})}});
      }
      return tx.exportJob.create({data:{userId:owner.id,fiscalYearId:year.id,kind:ANNUAL_REPORT_KIND,format:'zip',dataVersion:locked.dataVersion,filters:asJson({automatic:true,token,leaseUntil:Date.now()+60000,lastAttemptDay:today})}});
    });
    if(!job)continue;
    try{
      const report=await reportData(owner,{fiscalYearId:year.id},false);
      if(report.year.dataVersion!==job.dataVersion)throw new AppError(409,'ข้อมูลปีเปลี่ยนระหว่างเตรียมรายงาน ระบบจะตรวจใหม่รอบถัดไป');
      const zip=new JSZip(),checksums:Record<string,string>={};
      for(const kind of ['normal','dashboard'] as const){const file=await makeExport(report,kind,'xlsx');const path=`reports/${kind}.xlsx`;zip.file(path,file.bytes);checksums[path]=sha256(file.bytes);}
      zip.file('manifest.json',JSON.stringify({year:year.year,dataVersion:job.dataVersion,createdAt:at.toISOString(),rowCount:report.rows.length,checksums,scope:'Annual reports only; not a database backup and does not include attachment files'}));
      zip.file('README.txt','รายงาน Excel ประจำปี: normal.xlsx และ dashboard.xlsx\nZIP นี้มีเฉพาะรายงาน ไม่รวมไฟล์หลักฐานและไม่ใช่ชุดสำรองกู้คืนฐานข้อมูล\nก่อนล้างข้อมูลปี ต้องทำขั้นตอนสำรองและทดสอบกู้คืนแยกตามหน้าจัดเก็บและสำรองรายปี');
      const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:1}});
      if(bytes.length>20*1024*1024)throw new AppError(422,'ZIP รายงานเกิน 20 MB ต้องแบ่งรายงานผ่านผู้ดูแลก่อน');
      const space=usage??await storageUsage();
      if(space.usedBytes+bytes.length>space.limitBytes*.95)throw new AppError(422,'พื้นที่เผื่อไม่พอสำหรับ ZIP รายงาน กรุณาเก็บไฟล์ภายนอกและคืนพื้นที่ก่อน');
      await prisma.$transaction(async tx=>{
        const current=await lockYear(tx,year.id,false),latest=await tx.exportJob.findUniqueOrThrow({where:{id:job.id}});
        if(current.state==='purged'||current.dataVersion!==job.dataVersion||metadata(latest.filters).token!==token)throw new AppError(409,'ข้อมูลปีเปลี่ยนระหว่างสร้างรายงาน ระบบจะตรวจใหม่รอบถัดไป');
        await tx.exportJob.update({where:{id:job.id},data:{status:'completed',data:new Uint8Array(bytes),sha256:sha256(bytes),rowCount:report.rows.length,error:null,filters:asJson({automatic:true,lastAttemptDay:today,createdForYear:year.year})}});
        await audit(tx,null,'annual_report_created','export_jobs',job.id,undefined,year.id,{dataVersion:job.dataVersion,bytes:bytes.length});
      });
      await notifyAdmins(year.id,`annual-report-ready:${job.id}`,`สร้าง ZIP รายงานปีงบประมาณ ${year.year} รุ่นข้อมูล ${job.dataVersion} แล้ว มี ${report.rows.length} รายการ ระบบเก็บไฟล์ไว้จนแอดมินดาวน์โหลดและยืนยันลบเอง เปิดดาวน์โหลดที่ /admin/retention?fiscalYearId=${year.id} ZIP นี้มีเฉพาะรายงาน ไม่ใช่ชุดสำรองฐานข้อมูล`,at);
      return {status:'completed',id:job.id,year:year.year};
    }catch(error){
      const message=error instanceof AppError?error.message:'สร้าง ZIP รายงานไม่สำเร็จ ระบบจะลองอีกครั้งในรอบถัดไป';
      // A completed file is retained even if queuing its notification fails.
      const latest=await prisma.exportJob.findUnique({where:{id:job.id},select:{status:true}});
      if(latest?.status!=='completed')await prisma.exportJob.updateMany({where:{id:job.id,status:'pending',filters:{path:['token'],equals:token}},data:{status:'failed',error:message,filters:asJson({automatic:true,lastAttemptDay:today})}});
      await notifyAdmins(year.id,`annual-report-failed:${job.id}:${today}`,`ตรวจงาน ZIP รายงานปี ${year.year}: ${message} กรุณาตรวจหน้า /admin/retention?fiscalYearId=${year.id} ข้อมูลต้นฉบับยังอยู่ในระบบ`,at);
      return {status:latest?.status==='completed'?'completed':'failed',id:job.id};
    }
  }
  return {status:'up_to_date'};
}

export async function removeAnnualReport(actor:Actor,id:string,data:Record<string,unknown>){
  assertAdmin(actor);
  const {storageLocation}=z.object({confirmation:z.literal('DELETE'),storageLocation:z.string().trim().min(3).max(1000)}).parse(data);
  return prisma.$transaction(async tx=>{
    const initial=await tx.exportJob.findFirst({where:{id,kind:ANNUAL_REPORT_KIND},select:{fiscalYearId:true}});
    if(!initial)throw new AppError(404,'ไม่พบ ZIP รายงานประจำปี');
    await lockYear(tx,initial.fiscalYearId,false);
    const job=await tx.exportJob.findUniqueOrThrow({where:{id}});
    if(job.status!=='completed'||!job.data)throw new AppError(422,'ไฟล์ยังไม่พร้อมดาวน์โหลดหรือถูกนำออกแล้ว');
    if(!await tx.auditLog.count({where:{actorId:actor.id,action:'download_annual_report',entityId:id}}))throw new AppError(422,'แอดมินผู้ยืนยันต้องดาวน์โหลด ZIP นี้ก่อน');
    await tx.exportJob.update({where:{id},data:{data:null,status:'released',filters:asJson({...metadata(job.filters),storageLocation,releasedBy:actor.id,releasedAt:new Date().toISOString()})}});
    await audit(tx,actor,'remove_annual_report','export_jobs',id,undefined,job.fiscalYearId,{storageLocation,sha256:job.sha256,bytes:job.data.length});
    return job.fiscalYearId;
  });
}
