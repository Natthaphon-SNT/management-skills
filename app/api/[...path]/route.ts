import {NextResponse,after} from 'next/server';
import {cookies} from 'next/headers';
import {Prisma} from '@prisma/client';
import {ZodError} from 'zod';
import {prisma,withColdStartRetry} from '@/lib/prisma';
import {assertAdmin,requireActor,validateCsrf,COOKIE,getSession,type Actor} from '@/lib/auth';
import {AppError,checkOrigin,requestOrigin,asJson} from '@/lib/security';
import {login,register,changePassword,saveTraining,deleteTraining,saveResult,reviewResult} from '@/lib/actions';
import {createYear,addScopes,updateScope,removeScope,savePerson,saveAccount,saveMaster,saveKpi} from '@/lib/admin-actions';
import {getParticipation,audit} from '@/lib/records';
import {reportData} from '@/lib/reports';
import {persistExport,type ExportKind,type ExportFormat} from '@/lib/exports';
import {beginUpload,uploadChunk,finishUpload,fileResponse} from '@/lib/uploads';
import {createArchive} from '@/lib/archive';
import {retentionPreview,changeYearState,savePolicy,receiveArchive,approveDeletion,purgeYear} from '@/lib/retention';
import {processNotices,queueAdminEmailTest,retryAdminEmail} from '@/lib/notifications';
import {safeCell} from '@/lib/calendar';
import {removeRegistration} from '@/lib/registrations';

export const runtime='nodejs';
export const maxDuration=10;
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function inputData(request:Request) {
  if(request.headers.get('content-type')?.includes('application/json'))return await request.json() as Record<string,unknown>;
  if(request.headers.get('content-type')?.includes('application/octet-stream'))return {};
  const form=await request.formData(),data:Record<string,unknown>={};
  for(const [key,value] of form.entries()) {if(key.endsWith('[]'))data[key.slice(0,-2)]=form.getAll(key);else data[key]=value;}
  return data;
}
function jsonRequest(request:Request){return request.headers.get('accept')?.includes('application/json')||request.headers.get('content-type')?.includes('application/json')||request.headers.get('content-type')?.includes('application/octet-stream');}
function returnPath(data:Record<string,unknown>,request:Request) {
  const explicit=String(data.returnTo??'');if(explicit.startsWith('/')&&!explicit.startsWith('//')&&!explicit.includes('\\'))return explicit.split('?')[0];
  const ref=request.headers.get('referer');if(ref){const url=new URL(ref);if(url.origin===requestOrigin(request))return url.pathname;}
  return '/dashboard';
}
function done(request:Request,path:string,data:unknown={ok:true},status=200) {return jsonRequest(request)?NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}}):NextResponse.redirect(new URL(path,requestOrigin(request)),303);}

export async function GET(request:Request,context:Context) {
  try {
    const path=(await context.params).path,actor=await requireActor(),query=Object.fromEntries(new URL(request.url).searchParams);
    if(path[0]==='dashboard'||(path[0]==='trainings'&&path.length===1))return NextResponse.json(await reportData(actor,query),{headers:{'Cache-Control':'private, no-store'}});
    if(path[0]==='trainings'&&path.length===2)return NextResponse.json(await getParticipation(path[1],actor),{headers:{'Cache-Control':'private, no-store'}});
    if(path[0]==='attachments'&&path.length===2) {
      const fileMeta=await withColdStartRetry(()=>prisma.attachment.findUnique({where:{id:path[1]},select:{participationId:true}}));if(!fileMeta)throw new AppError(404,'ไม่พบไฟล์');await getParticipation(fileMeta.participationId,actor);
      const file=await withColdStartRetry(()=>prisma.attachment.findUniqueOrThrow({where:{id:path[1]},select:{data:true,originalName:true,mime:true}}));return fileResponse(file.data,file.originalName,file.mime);
    }
    if(path[0]==='exports'&&path.length===2) {
      const file=await withColdStartRetry(()=>prisma.exportJob.findFirst({where:{id:path[1],userId:actor.id,status:'completed',kind:{in:['normal','dashboard']}},select:{data:true,kind:true,format:true}}));if(!file?.data)throw new AppError(404,'ไม่พบรายงาน');return fileResponse(file.data,`รายงาน-${file.kind}.${file.format}`,file.format==='csv'?'text/csv; charset=UTF-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    if(path[0]==='admin') {
      assertAdmin(actor);
      if(path[1]==='retention'&&path[2]) {const p=await retentionPreview(path[2]);return NextResponse.json({ready:p.ready,reasons:p.reasons,counts:p.counts,archive:p.archive},{headers:{'Cache-Control':'no-store'}});}
      if(path[1]==='archives'&&path.length===3) {
        const file=await withColdStartRetry(()=>prisma.archiveManifest.findUnique({where:{id:path[2]},select:{data:true,fiscalYearId:true}}));if(!file?.data)throw new AppError(404,'ไม่พบชุดสำรอง');await audit(prisma,actor,'download_archive','archive_manifests',path[2],undefined,file.fiscalYearId);return fileResponse(file.data,`backup-${path[2]}.zip`,'application/zip');
      }
      if(path[1]==='notices.csv') {
        if(!query.fiscalYearId)throw new AppError(422,'กรุณาเลือกปีงบประมาณ');
        const notices=await withColdStartRetry(()=>prisma.notification.findMany({where:{fiscalYearId:query.fiscalYearId},select:{channel:true,status:true,message:true,attempts:true,sentAt:true,error:true},orderBy:{createdAt:'asc'}}));
        const escape=(v:unknown)=>'"'+safeCell(v).replaceAll('"','""')+'"';
        const lines=[['ช่องทาง','สถานะ','ข้อความ','ครั้งที่ส่ง','เวลาส่ง','ปัญหา'],...notices.map(n=>[n.channel,n.status,n.message,n.attempts,n.sentAt?.toISOString(),n.error])];
        await audit(prisma,actor,'export_notifications','fiscal_years',query.fiscalYearId,undefined,query.fiscalYearId);
        return fileResponse(Buffer.from('\uFEFF'+lines.map(row=>row.map(escape).join(',')).join('\r\n')),'การแจ้งเตือน.csv','text/csv; charset=UTF-8');
      }
    }
    throw new AppError(404,'ไม่พบ API ที่ต้องการ');
  }catch(error){return handleError(error,request,{});}
}
export async function POST(request:Request,context:Context) {
  let data:Record<string,unknown>={};
  try {
    checkOrigin(request);const path=(await context.params).path;data=await inputData(request);
    if(path[0]==='auth'&&['login','register'].includes(path[1])) {
      await validateCsrf(request,data,true);const ip=(request.headers.get('x-forwarded-for')??'local').split(',')[0].trim();
      const next=path[1]==='login'?await login(data,ip):await register(data,ip);
      if(path[1]==='register')after(async()=>{try{await processNotices(performance.now()+6000,'registration:');}catch{console.error('Registration notification dispatch failed; queued for retry');}});
      return done(request,next);
    }
    const actor=await requireActor();await validateCsrf(request,data);
    if(path[0]==='auth') {
      if(path[1]==='logout') {const session=await getSession();if(session)await prisma.authSession.delete({where:{id:session.id}});(await cookies()).delete(COOKIE);return done(request,'/login');}
      if(path[1]==='password')return done(request,await changePassword(actor,data));
    }
    if(path[0]==='trainings') {
      if(path.length===3&&path[2]==='delete') {await deleteTraining(actor,path[1],data);return done(request,'/trainings?success='+encodeURIComponent('ลบรายงานแล้ว'));}
      if(path.length===1||path[2]==='save'||(request.method==='PUT'&&path.length===2)) {
        const id=await saveTraining(actor,data,path[1]);
        after(async()=>{try{await processNotices(performance.now()+6000,`training-saved:${id}:`);}catch{console.error('Training notification dispatch failed; queued for retry');}});
        return done(request,'/trainings/'+id,{id},path[1]?200:201);
      }
      if(path[2]==='result') {
        await saveResult(actor,path[1],data);
        after(async()=>{try{await processNotices(performance.now()+6000,`result-submitted:${path[1]}:`);}catch{console.error('Result notification dispatch failed; queued for retry');}});
        return done(request,'/trainings/'+path[1]);
      }
      if(path[2]==='review') {await reviewResult(actor,path[1],data);return done(request,'/trainings/'+path[1]);}
      if(path[2]==='uploads')return NextResponse.json(await beginUpload(actor,path[1],data),{status:201});
    }
    if(path[0]==='uploads') {
      if(path[2]==='chunks') {await uploadChunk(actor,path[1],Number(request.headers.get('x-chunk-index')),new Uint8Array(await request.arrayBuffer()));return NextResponse.json({ok:true});}
      if(path[2]==='finish') {const id=await finishUpload(actor,path[1]);return NextResponse.json({ok:true,redirect:'/trainings/'+id});}
    }

    if(path[0]==='exports') {
      if(!['normal','dashboard'].includes(String(data.kind))||!['xlsx','csv'].includes(String(data.format)))throw new AppError(422,'รูปแบบรายงานไม่ถูกต้อง');
      const report=await reportData(actor,data,false);const id=await persistExport(actor,report,data.kind as ExportKind,data.format as ExportFormat,Number(data.dataVersion));return done(request,'/exports',{id});
    }
    if(path[0]==='admin') {
      assertAdmin(actor);const [,_kind,id,action]=path;
      if((_kind==='personnel'||_kind==='accounts')&&id&&['delete','restore'].includes(action)){
        await removeRegistration(actor,_kind,id,data,action==='restore');
        return done(request,'/admin?success='+encodeURIComponent(action==='restore'?'กู้คืนรายการแล้ว กรุณาตรวจข้อมูลและเปิดใช้งานอีกครั้ง':'ลบรายการแล้ว โดยเก็บประวัติรายงานเดิมไว้'));
      }
      if(_kind==='years'&&!id)await createYear(actor,data);
      else if(_kind==='years'&&id&&action==='scopes')await addScopes(actor,id);
      else if(_kind==='scopes'&&id&&action==='delete'){
        await removeScope(actor,id,data);
        return done(request,'/admin?success='+encodeURIComponent('นำออกจากฐานปีนี้แล้ว รายงานการอบรมเดิมยังอยู่ครบ'));
      }
      else if(_kind==='scopes'&&id&&!action)await updateScope(actor,id,data);
      else if(_kind==='personnel')await savePerson(actor,data,id);
      else if(_kind==='accounts'&&id&&action==='test-email'){
        const key=await queueAdminEmailTest(actor,id);
        await processNotices(performance.now()+6500,key);
        return done(request,'/admin?success='+encodeURIComponent('ดำเนินการทดสอบอีเมลแล้ว ตรวจสถานะอีเมลล่าสุดของบัญชีนี้')+'#accounts');
      }
      else if(_kind==='accounts'&&id){await saveAccount(actor,id,data);try{await retryAdminEmail(id);}catch{console.error('Admin email retry failed; queued for retry');}}
      else if(_kind==='departments'||_kind==='strategies')await saveMaster(actor,_kind==='departments'?'department':'strategy',data,id);
      else if(_kind==='kpis')await saveKpi(actor,data);
      else if(_kind==='notices'&&id==='retry'){await prisma.notification.updateMany({where:{status:'failed',channel:'email',OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{attempts:0}});await processNotices();}
      else if(_kind==='retention'&&id) {
        if(action==='state')await changeYearState(actor,id,data);
        else if(action==='policy')await savePolicy(actor,id,data);
        else if(action==='archive')await createArchive(actor,id);
        else if(action==='execute') {const year=await prisma.fiscalYear.findUniqueOrThrow({where:{id}});if(data.confirmation!=='ลบปี '+year.year)throw new AppError(422,'ข้อความยืนยันไม่ตรงกับปี');await purgeYear(actor,id,new Date(),false);}
        else throw new AppError(404,'ไม่พบขั้นตอนที่ต้องการ');
        return done(request,'/admin/retention?fiscalYearId='+id);
      }
      else if(_kind==='archives'&&id) {
        if(action==='receive'||action==='approve') {if(!['1','true',true,1].includes(data.confirmation as string))throw new AppError(422,'กรุณายืนยันการตรวจไฟล์');if(action==='receive')await receiveArchive(actor,id);else await approveDeletion(actor,id,String(data.comment??''));}
        else if(action==='verify')throw new AppError(422,'ทดสอบกู้คืนผ่าน npm run db:restore-check -- '+id+' บนเครื่องผู้ดูแล โดยใช้ RESTORE_DIRECT_URL เป็นฐาน/branch ว่างแยก');
        else throw new AppError(404,'ไม่พบขั้นตอนที่ต้องการ');
        const archive=await prisma.archiveManifest.findUniqueOrThrow({where:{id},select:{fiscalYearId:true}});return done(request,'/admin/retention?fiscalYearId='+archive.fiscalYearId);
      }
      else throw new AppError(404,'ไม่พบขั้นตอนที่ต้องการ');
      return done(request,returnPath(data,request)+'?success='+encodeURIComponent('บันทึกข้อมูลแล้ว'));
    }
    throw new AppError(404,'ไม่พบ API ที่ต้องการ');
  }catch(error){return handleError(error,request,data);}
}
export async function PUT(request:Request,context:Context){return POST(request,context);}
function handleError(error:unknown,request:Request,data:Record<string,unknown>) {
  let status=500,message='ระบบขัดข้อง กรุณาลองใหม่หรือติดต่อผู้ดูแล';let fields:Record<string,string>|undefined;
  if(error instanceof AppError){status=error.status;message=error.message;fields=error.fields;}
  else if(error instanceof ZodError){status=422;fields={};for(const issue of error.issues)fields[String(issue.path[0]??'form')]=/[ก-๙]/.test(issue.message)?issue.message:'กรุณาตรวจรูปแบบและกรอกข้อมูลให้ครบ';message=Object.values(fields)[0];}
  else if(error instanceof Prisma.PrismaClientKnownRequestError) {
    if(error.code==='P2002'){status=409;message='ข้อมูลนี้มีอยู่แล้ว กรุณาตรวจชื่อผู้ใช้ รหัสบุคลากร หรือรายการซ้ำ';}
    else if(['P2003','P2025'].includes(error.code)){status=422;message='ข้อมูลอ้างอิงไม่ถูกต้องหรือถูกเปลี่ยน กรุณารีเฟรชหน้า';}
    else if(['P1001','P1002','P1017'].includes(error.code)){status=503;message='ฐานข้อมูลกำลังเริ่มทำงาน กรุณาลองอีกครั้ง';}
  }
  if(jsonRequest(request)||request.method==='GET')return NextResponse.json({error:message,...(fields?{fields}:{})},{status,headers:{'Cache-Control':'no-store'}});
  const path=returnPath(data,request);return NextResponse.redirect(new URL(path+'?error='+encodeURIComponent(message),requestOrigin(request)),303);
}
