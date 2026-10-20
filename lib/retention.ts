import {z} from 'zod';
import type {Actor} from './auth';
import {assertAdmin} from './auth';
import {prisma,withColdStartRetry,sqlTable} from './prisma';
import {AppError,sha256} from './security';
import {audit,lockYear,touchYear,type Tx} from './records';
import {dateOnly,day} from './calendar';
const flag=z.preprocess(v=>v===true||v==='true'||v==='1'||v===1,z.boolean());
export function externalStorage(evidence:unknown) {
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))return null;
  const value=(evidence as Record<string,unknown>).externalStorage;
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const receipt=value as Record<string,unknown>;
  return typeof receipt.location==='string'&&receipt.location.trim()&&typeof receipt.downloadAuditId==='string'?receipt:null;
}

export async function retentionPreview(yearId:string,at=new Date(),tx:Tx=prisma) {
  const year=await tx.fiscalYear.findUniqueOrThrow({where:{id:yearId},include:{retention:true}});
  const archive=await tx.archiveManifest.findFirst({where:{fiscalYearId:yearId},orderBy:{createdAt:'desc'},include:{approval:{include:{approver:{select:{active:true,approvedAt:true,role:true}}}}}});
  const policy=year.retention,reasons:string[]=[];
  if(!['closed','archived'].includes(year.state))reasons.push('ต้องปิดปีหรือย้ายเข้า archive ก่อนลบ');
  if(!policy?.dueOn||!policy.approvedAt||!policy.policyReference||!policy.typeDueDates)reasons.push('นโยบายเก็บรักษายังไม่ครบหรือยังไม่รับรอง');
  if(policy?.legalHold||!policy?.backupRetentionDays||!policy.archiveRetentionDays)reasons.push('มีการพักลบ หรือยังไม่กำหนดอายุ backup/archive');
  if(policy?.dueOn&&+at<=Date.parse(day(policy.dueOn)+'T23:59:59.999+07:00')+policy.graceDays*86400000)reasons.push('ยังไม่พ้นวันครบกำหนดและระยะผ่อนผัน');
  if(!archive?.restoreTestedAt||!archive.receivedAt||!archive.receivedBy)reasons.push('ต้องสำรอง ทดสอบกู้คืน และยืนยันรับไฟล์');
  if(!externalStorage(archive?.restoreEvidence))reasons.push('แอดมินต้องดาวน์โหลดและระบุที่เก็บรายงานและไฟล์สำรองภายนอกระบบก่อน');
  if(archive&&archive.dataVersion!==year.dataVersion)reasons.push('ข้อมูลเปลี่ยนหลังสำรอง ต้องสร้างและทดสอบชุดใหม่');
  if(!archive?.approval||archive.approval.dataVersion!==year.dataVersion)reasons.push('ไม่มีใบอนุมัติลบที่ตรงกับรุ่นข้อมูลล่าสุด');
  if(archive?.approval&&(!archive.approval.approver.active||!archive.approval.approver.approvedAt||archive.approval.approver.role!=='ADMIN'))reasons.push('ผู้อนุมัติไม่มีสิทธิ์ ADMIN ที่ใช้งานอยู่');
  if(!await tx.user.count({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null}}}))reasons.push('ไม่มี ADMIN รับผิดชอบ');
  if(await tx.notification.count({where:{fiscalYearId:yearId,status:'failed'}}))reasons.push('มีการแจ้งเตือนส่งล้มเหลว ต้องตรวจแก้ก่อน');
  if(archive&&(!archive.data||sha256(archive.data)!==archive.sha256))reasons.push('ไม่พบ backup หรือ checksum ไม่ตรง');
  const plans=await tx.developmentPlan.findMany({where:{fiscalYearId:yearId},select:{id:true,items:{select:{schedules:{select:{fiscalYearId:true}},participations:{select:{activity:{select:{fiscalYearId:true}}}}}}}});
  const shared=plans.filter(p=>p.items.some(i=>i.schedules.some(s=>s.fiscalYearId!==yearId)||i.participations.some(p=>p.activity.fiscalYearId!==yearId)));
  const [activities,participants,results,attachments,scopes]=await Promise.all([
    tx.trainingActivity.count({where:{fiscalYearId:yearId}}),tx.trainingParticipation.count({where:{activity:{fiscalYearId:yearId}}}),
    tx.applicationResult.count({where:{participation:{activity:{fiscalYearId:yearId}}}}),tx.attachment.count({where:{participation:{activity:{fiscalYearId:yearId}}}}),tx.annualPersonnelScope.count({where:{fiscalYearId:yearId}}),
  ]);
  const [space]=await tx.$queryRaw<{attachments:bigint,reports:bigint,backups:bigint}[]>`SELECT
    (SELECT COALESCE(SUM(octet_length(a.data)),0)::bigint FROM ${sqlTable('attachments')} a JOIN ${sqlTable('training_participations')} p ON p.id=a."participationId" JOIN ${sqlTable('training_activities')} t ON t.id=p."trainingActivityId" WHERE t."fiscalYearId"=${yearId}) AS attachments,
    (SELECT COALESCE(SUM(octet_length(data)),0)::bigint FROM ${sqlTable('export_jobs')} WHERE "fiscalYearId"=${yearId}) AS reports,
    (SELECT COALESCE(SUM(octet_length(data)),0)::bigint FROM ${sqlTable('archive_manifests')} WHERE "fiscalYearId"=${yearId}) AS backups`;
  const payloadBytes={attachments:Number(space.attachments),reports:Number(space.reports),backups:Number(space.backups)};
  return {year,policy,payloadBytes,archive:archive?{id:archive.id,dataVersion:archive.dataVersion,state:archive.state,sha256:archive.sha256,restoreTestedAt:archive.restoreTestedAt,receivedAt:archive.receivedAt,createdAt:archive.createdAt}:null,
    ready:reasons.length===0,reasons:[...new Set(reasons)],counts:{trainingActivities:activities,participations:participants,results,attachments,annualScopes:scopes,deletedPlans:plans.length-shared.length,preservedSharedPlans:shared.length},deletePlanIds:plans.filter(p=>!shared.some(s=>s.id===p.id)).map(p=>p.id)};
}
export async function changeYearState(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor);const {state}=z.object({state:z.enum(['open','closed','archived'])}).parse(data);
  await prisma.$transaction(async tx=>{const year=await lockYear(tx,id,false);if(year.state==='purged')throw new AppError(422,'เปิดปีที่ลบแล้วไม่ได้ ให้กู้จาก backup ในระบบแยก');await tx.fiscalYear.update({where:{id},data:{state,dataVersion:{increment:1}}});await audit(tx,actor,'change_year_state','fiscal_years',id,undefined,id,{state});});
}
export async function savePolicy(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor);const input=z.object({plans:z.iso.date(),training:z.iso.date(),results:z.iso.date(),attachments:z.iso.date(),graceDays:z.coerce.number().int().min(0).max(3650),noticeDays:z.string().regex(/^\d+(,\d+)*$/),legalHold:flag,backupRetentionDays:z.coerce.number().int().min(1).max(36500),archiveRetentionDays:z.coerce.number().int().min(1).max(36500),policyReference:z.string().trim().min(1).max(5000)}).parse(data);
  await prisma.$transaction(async tx=> {
    const year=await lockYear(tx,id,false),typeDueDates={plans:input.plans,training:input.training,results:input.results,attachments:input.attachments};
    if(Object.values(typeDueDates).some(d=>d<day(year.endsOn)))throw new AppError(422,'กำหนดเก็บรักษาต้องไม่ก่อนสิ้นปี');
    const {plans,training,results,attachments,...rest}=input;
    const values={...rest,autoDelete:false,noticeDays:[...new Set(input.noticeDays.split(',').map(Number))],typeDueDates,dueOn:dateOnly(Object.values(typeDueDates).sort().at(-1)!),approvedBy:actor.id,approvedAt:new Date()};
    await tx.retentionPolicy.upsert({where:{fiscalYearId:id},create:{...values,fiscalYearId:id},update:values});await touchYear(tx,id);await audit(tx,actor,'approve_policy','retention_policies',id,undefined,id,input);
  });
}
export async function receiveArchive(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor);const {storageLocation}=z.object({storageLocation:z.string().trim().min(3,'กรุณาระบุที่เก็บไฟล์สำรองภายนอกระบบ').max(1000)}).parse(data);
  await prisma.$transaction(async tx=> {
    const initial=await tx.archiveManifest.findUniqueOrThrow({where:{id},select:{fiscalYearId:true}});
    const year=await lockYear(tx,initial.fiscalYearId,false);
    const archive=await tx.archiveManifest.findUniqueOrThrow({where:{id}});
    if(!archive.data||!archive.restoreTestedAt||sha256(archive.data)!==archive.sha256)throw new AppError(422,'ต้องมีไฟล์สำรองที่ตรวจ checksum และทดสอบกู้คืนแล้วก่อน');
    const download=await tx.auditLog.findFirst({where:{actorId:actor.id,entity:'archive_manifests',entityId:id,action:'download_archive'},orderBy:{createdAt:'desc'},select:{id:true}});
    if(!download)throw new AppError(422,'แอดมินผู้ยืนยันต้องกดดาวน์โหลด ZIP ชุดนี้ก่อน');
    const at=new Date(),evidence=archive.restoreEvidence&&typeof archive.restoreEvidence==='object'&&!Array.isArray(archive.restoreEvidence)?archive.restoreEvidence:{};
    const receipt={location:storageLocation,downloadAuditId:download.id,storedBy:actor.id,storedAt:at.toISOString()};
    await tx.archiveManifest.update({where:{id},data:{receivedBy:actor.id,receivedAt:at,state:'received',restoreEvidence:{...evidence,externalStorage:receipt}}});
    await audit(tx,actor,'archive_received','archive_manifests',id,undefined,year.id,{storageLocation,sha256:archive.sha256,downloadAuditId:download.id});
  });
}
export async function approveDeletion(actor:Actor,id:string,comment:string) {
  assertAdmin(actor);if(!comment.trim()||comment.length>5000)throw new AppError(422,'กรุณาระบุเหตุผล/หนังสืออนุมัติ');
  await prisma.$transaction(async tx=> {
    const archive=await tx.archiveManifest.findUniqueOrThrow({where:{id}}),year=await lockYear(tx,archive.fiscalYearId,false);
    if(!archive.restoreTestedAt||!archive.receivedAt||!externalStorage(archive.restoreEvidence)||year.dataVersion!==archive.dataVersion)throw new AppError(422,'ชุดสำรองยังไม่ผ่านขั้นตอน เก็บภายนอกไม่ครบ หรือล้าสมัย');
    await tx.deletionApproval.upsert({where:{manifestId:id},create:{manifestId:id,dataVersion:year.dataVersion,approvedBy:actor.id,comment},update:{dataVersion:year.dataVersion,approvedBy:actor.id,approvedAt:new Date(),comment}});
    await audit(tx,actor,'approve_deletion','archive_manifests',id,undefined,year.id,{dataVersion:year.dataVersion});
  });
}
export async function purgeYear(actor:Actor|null,id:string,at=new Date(),dryRun=true) {
  if(actor)assertAdmin(actor);if(dryRun)return retentionPreview(id,at);
  if(!actor)throw new AppError(403,'แอดมินต้องยืนยันล้างข้อมูลปีด้วยตนเองเท่านั้น');
  return prisma.$transaction(async tx=> {
    await lockYear(tx,id,false);const preview=await retentionPreview(id,at,tx);if(!preview.ready)throw new AppError(422,preview.reasons.join(' / '));
    const ids=await tx.trainingParticipation.findMany({where:{activity:{fiscalYearId:id}},select:{id:true}});
    await tx.pendingUpload.deleteMany({where:{participationId:{in:ids.map(p=>p.id)}}});
    await tx.trainingActivity.deleteMany({where:{fiscalYearId:id}});await tx.planSchedule.deleteMany({where:{fiscalYearId:id}});
    await tx.developmentPlan.deleteMany({where:{id:{in:preview.deletePlanIds}}});await tx.annualPersonnelScope.deleteMany({where:{fiscalYearId:id}});
    await tx.kPIDefinition.deleteMany({where:{fiscalYearId:id}});await tx.exportJob.deleteMany({where:{fiscalYearId:id,kind:{not:'annual_zip'}}});await tx.notification.deleteMany({where:{fiscalYearId:id}});
    await tx.auditLog.updateMany({where:{fiscalYearId:id},data:{changes:Prisma.DbNull}});
    await tx.fiscalYear.update({where:{id},data:{state:'purged',dataVersion:{increment:1}}});await audit(tx,actor,'purged','fiscal_years',id,undefined,id,{counts:preview.counts,manifestId:preview.archive?.id});return preview;
  },{timeout:8000});
}
export async function releaseArchive(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor);z.object({confirmation:z.literal('REMOVE'),reason:z.string().trim().min(1).max(3000)}).parse(data);
  await prisma.$transaction(async tx=> {
    const initial=await tx.archiveManifest.findUniqueOrThrow({where:{id},select:{fiscalYearId:true}});
    const year=await lockYear(tx,initial.fiscalYearId,false);
    const archive=await tx.archiveManifest.findUniqueOrThrow({where:{id}});
    if(year.state!=='purged')throw new AppError(422,'ต้องล้างข้อมูลปีหลังผ่านทุกเงื่อนไขก่อนนำสำเนา ZIP ออกจากฐาน');
    if(!archive.receivedBy||!archive.receivedAt||!archive.restoreTestedAt||!externalStorage(archive.restoreEvidence))throw new AppError(422,'ต้องดาวน์โหลด ทดสอบกู้คืน และยืนยันที่เก็บภายนอกของชุดนี้ก่อน');
    if(await tx.retentionPolicy.count({where:{fiscalYearId:year.id,legalHold:true}}))throw new AppError(422,'มีการพักลบ ต้องตรวจนโยบายก่อน');
    if(!archive.data)throw new AppError(422,'นำสำเนาไฟล์ชุดนี้ออกจากฐานแล้ว');
    if(sha256(archive.data)!==archive.sha256)throw new AppError(422,'checksum ของชุดสำรองไม่ตรง');
    const bytes=archive.data.length;
    await tx.archiveManifest.update({where:{id},data:{data:null,state:'external_only'}});
    await audit(tx,actor,'release_archive_copy','archive_manifests',id,undefined,year.id,{reason:data.reason,bytes,sha256:archive.sha256,externalStorage:externalStorage(archive.restoreEvidence)});
  });
}
import {Prisma} from '@prisma/client';
