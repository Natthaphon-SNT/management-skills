import {Prisma} from '@prisma/client';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {cookies} from 'next/headers';
import {prisma,withColdStartRetry,sqlTable} from './prisma';
import {type Actor,assertOwner,assertAdmin,COOKIE,cookieOptions} from './auth';
import {AppError,randomToken,sha256,sign} from './security';
import {dateOnly,day,bangkokToday,fiscalBounds,validateTrainingDates,FORMULAS,reportDeadline} from './calendar';
import {audit,assignment,getParticipation,lockYear,snapshot,touchYear,type Tx} from './records';

const text=z.string().trim().min(1,'กรุณากรอกข้อมูลให้ครบ').max(255,'ข้อความยาวเกิน 255 ตัวอักษร');
const optionalText=z.preprocess(v=>v===''||v===null?undefined:v,z.string().trim().max(15000).optional());
const optionalId=z.preprocess(v=>v===''||v===null?undefined:v,z.string().min(1).optional());
const flag=z.preprocess(v=>v===true||v==='true'||v==='1'||v===1,z.boolean());
const numberOptional=z.preprocess(v=>v===''||v===null?undefined:v,z.coerce.number().finite().min(0).max(100000).optional());
const date=z.iso.date({error:'กรุณาเลือกวันที่ที่ถูกต้อง'});

export async function consumeLimit(key:string,maximum=5,seconds=60) {
  const hash=sha256(key),reset=new Date(Date.now()+seconds*1000);
  const result=await prisma.$queryRaw<{attempts:number}[]>`INSERT INTO ${sqlTable('rate_limits')} ("keyHash",attempts,"resetAt") VALUES (${hash},1,${reset}) ON CONFLICT ("keyHash") DO UPDATE SET attempts=CASE WHEN ${sqlTable('rate_limits')}."resetAt"<=NOW() THEN 1 ELSE ${sqlTable('rate_limits')}.attempts+1 END,"resetAt"=CASE WHEN ${sqlTable('rate_limits')}."resetAt"<=NOW() THEN ${reset} ELSE ${sqlTable('rate_limits')}."resetAt" END RETURNING attempts`;
  if(result[0].attempts>maximum) throw new AppError(429,'ทำรายการไม่สำเร็จหลายครั้ง กรุณารอ 60 วินาที');
}

export async function login(data:Record<string,unknown>,ip:string) {
  const input=z.object({username:text,password:z.string().min(1).max(255)}).parse(data);
  const username=input.username.toLowerCase(); await consumeLimit('login:'+username+':'+ip);
  const user=await withColdStartRetry(()=>prisma.user.findUnique({where:{username},select:{id:true,role:true,personId:true,name:true,username:true,active:true,approvedAt:true,passwordHash:true}}));
  const fallback='$2b$12$KIXx7EoJ4nCqkSOb7xOAMePL4I3pmswBHBdKWm66fRkFfZG4D7CDu';
  const valid=await bcrypt.compare(input.password,user?.passwordHash??fallback);
  if(!user || !valid || !user.active) throw new AppError(422,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if(!user.approvedAt || !user.personId) throw new AppError(403,'บัญชีรอ ADMIN ตรวจสอบและเชื่อมทะเบียนบุคลากร');
  const token=randomToken(),csrfToken=randomToken();
  await prisma.$transaction(async tx=> {
    await tx.authSession.create({data:{userId:user.id,tokenHash:sha256(sign(token)),csrfToken,expiresAt:new Date(Date.now()+7200000)}});
    await audit(tx,user,'login','users',user.id);
  });
  (await cookies()).set(COOKIE,token,cookieOptions);
  return '/dashboard';
}

export async function register(data:Record<string,unknown>,ip:string) {
  await consumeLimit('register:'+ip,5,60);
  const input=z.object({name:text,departmentId:text,username:z.string().min(3).max(100).regex(/^[A-Za-z0-9_-]+$/,'ชื่อผู้ใช้ใช้อักษรอังกฤษ ตัวเลข ขีดกลางและขีดล่าง'),password:z.string().min(12,'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร').max(72),passwordConfirmation:z.string(),role:z.never().optional(),personId:z.never().optional()})
    .refine(v=>v.password===v.passwordConfirmation,{message:'ยืนยันรหัสผ่านไม่ตรงกัน',path:['passwordConfirmation']}).parse(data);
  const username=input.username.toLowerCase(); if(username==='admin') throw new AppError(422,'ชื่อผู้ใช้นี้สงวนสำหรับผู้ดูแลเริ่มต้น');
  const department=await withColdStartRetry(()=>prisma.department.findUnique({where:{id:input.departmentId},select:{active:true}}));
  if(!department?.active) throw new AppError(422,'ฝ่ายไม่พร้อมรับรายการใหม่');
  const passwordHash=await bcrypt.hash(input.password,12);
  await prisma.$transaction(async tx=> {
    // ไม่สร้างบุคลากรจากชื่อที่สมาชิกกรอกเอง รอผู้ดูแลเชื่อมทะเบียนเดิม
    const user=await tx.user.create({data:{username,name:input.name,passwordHash,registrationDepartmentId:input.departmentId,role:'USER'}});
    await audit(tx,{...user},'register','users',user.id);
  });
  return '/login?success='+encodeURIComponent('สมัครสมาชิกแล้ว รอ ADMIN ตรวจตัวตนและเชื่อมทะเบียนบุคลากร');
}

export async function changePassword(actor:Actor,data:Record<string,unknown>) {
  const input=z.object({currentPassword:z.string().min(1),password:z.string().min(12,'รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร').max(72),passwordConfirmation:z.string()}).refine(v=>v.password===v.passwordConfirmation,{message:'ยืนยันรหัสผ่านไม่ตรงกัน'}).parse(data);
  const old=await withColdStartRetry(()=>prisma.user.findUniqueOrThrow({where:{id:actor.id},select:{passwordHash:true}}));
  if(!await bcrypt.compare(input.currentPassword,old.passwordHash)) throw new AppError(422,'รหัสผ่านเดิมไม่ถูกต้อง');
  const passwordHash=await bcrypt.hash(input.password,12);
  await prisma.$transaction(async tx=> { await tx.user.update({where:{id:actor.id},data:{passwordHash}}); await tx.authSession.deleteMany({where:{userId:actor.id}}); await audit(tx,actor,'change_password','users',actor.id); });
  (await cookies()).delete(COOKIE); return '/login?success='+encodeURIComponent('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
}

const trainingSchema=z.object({personId:text,fiscalYearId:text,quarter:z.coerce.number().int().min(1).max(4),startsOn:date,endsOn:date,organizer:text,title:text,location:text,
  category:z.enum(['professional','teaching','other']),otherCategory:optionalText,hours:numberOptional,
  status:z.enum(['planned','completed','cancelled']),reportDueOn:date.optional(),exceptionReason:optionalText,
}).refine(d=>d.endsOn>=d.startsOn,{message:'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม',path:['endsOn']})
  .refine(d=>d.category!=='other'||!!d.otherCategory?.trim(),{message:'กรุณาระบุประเภทอื่น ๆ',path:['otherCategory']});

export async function saveTraining(actor:Actor,data:Record<string,unknown>,id?:string) {
  const input=trainingSchema.parse(data); assertOwner(actor,input.personId);
  const old=id?await getParticipation(id,actor):null;
  if(old&&old.personId!==input.personId) throw new AppError(422,'ไม่สามารถเปลี่ยนเจ้าของรายการเดิมได้');
  if(input.status==='completed' && input.endsOn>bangkokToday()) throw new AppError(422,'ยังไม่ถึงวันสิ้นสุด จึงบันทึกว่าสำเร็จไม่ได้');
  return prisma.$transaction(async tx=> {
    for(const yearId of [...new Set([input.fiscalYearId,...(old?[old.activity.fiscalYearId]:[])])].sort()) await lockYear(tx,yearId);
    const year=await tx.fiscalYear.findUniqueOrThrow({where:{id:input.fiscalYearId}});
    try {validateTrainingDates(year.year,input.quarter,input.startsOn,input.endsOn,!!input.exceptionReason);} catch(error) {throw new AppError(422,(error as Error).message);}
    const currentAssignment=await assignment(tx,input.personId,input.startsOn);
    const activityData={fiscalYearId:input.fiscalYearId,quarter:input.quarter,startsOn:dateOnly(input.startsOn),endsOn:dateOnly(input.endsOn),organizer:input.organizer,title:input.title,location:input.location,category:input.category,otherCategory:input.category==='other'?input.otherCategory:null,hours:input.hours??null,strategyId:null,exceptionReason:input.exceptionReason??null,exceptionReviewedBy:input.exceptionReason&&actor.role==='ADMIN'?actor.id:null};
    const activity=old?await tx.trainingActivity.update({where:{id:old.trainingActivityId},data:activityData}):await tx.trainingActivity.create({data:{...activityData,createdBy:actor.id}});
    const partData={departmentId:currentAssignment.departmentId,status:input.status,reportDueOn:dateOnly(reportDeadline(input.endsOn)),recordedBy:actor.id};
    const record=old?await tx.trainingParticipation.update({where:{id:old.id},data:partData}):await tx.trainingParticipation.create({data:{...partData,trainingActivityId:activity.id,personId:input.personId}});
    if(old) await tx.applicationResult.updateMany({where:{participationId:old.id},data:{reviewStatus:'pending',version:{increment:1}}});
    for(const yearId of new Set([input.fiscalYearId,...(old?[old.activity.fiscalYearId]:[])])) await touchYear(tx,yearId);
    await audit(tx,actor,old?'update':'create','training_participations',record.id,input.personId,input.fiscalYearId,{before:old,after:input}); return record.id;
  },{timeout:8000});
}

export async function deleteTraining(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor);
  const input=z.object({reason:z.string().trim().min(1,'กรุณาระบุเหตุผลการลบ').max(3000),confirmation:z.literal('DELETE')}).parse(data);
  await prisma.$transaction(async tx=> {
    const initial=await tx.trainingParticipation.findUnique({where:{id},select:{activity:{select:{fiscalYearId:true}}}});
    if(!initial) throw new AppError(404,'ไม่พบรายงาน');
    await lockYear(tx,initial.activity.fiscalYearId);
    const record=await tx.trainingParticipation.findUnique({where:{id},include:{activity:true,result:{include:{reviews:true}},attachments:{select:{id:true,originalName:true,sha256:true}}}});
    if(!record) throw new AppError(404,'ไม่พบรายงาน');
    if(record.activity.fiscalYearId!==initial.activity.fiscalYearId) throw new AppError(409,'รายงานเปลี่ยนแล้ว กรุณารีเฟรชก่อนลบ');
    await audit(tx,actor,'delete','training_participations',id,record.personId,record.activity.fiscalYearId,{reason:input.reason,before:record});
    await tx.pendingUpload.deleteMany({where:{participationId:id}});
    await tx.trainingParticipation.delete({where:{id}});
    // Keep an activity used by another participant; dependent results/files cascade.
    await tx.trainingActivity.deleteMany({where:{id:record.trainingActivityId,participations:{none:{}}}});
    await touchYear(tx,record.activity.fiscalYearId);
  },{timeout:8000});
}

export async function saveResult(actor:Actor,id:string,data:Record<string,unknown>) {
  const record=await getParticipation(id,actor);
  if(day(record.activity.endsOn)>bangkokToday())throw new AppError(422,'ยังไม่ถึงวันสิ้นสุดการอบรม กรุณารายงานผลตั้งแต่วันสิ้นสุดการอบรมเป็นต้นไป');
  const input=z.object({explanation:z.string().trim().min(1).max(15000),outcome:z.string().trim().min(1).max(15000),reportedOn:date,version:z.coerce.number().int().optional()}).parse(data);
  if(input.reportedOn<day(record.activity.endsOn)||input.reportedOn>bangkokToday()) throw new AppError(422,'วันที่รายงานต้องอยู่ระหว่างวันสิ้นสุดกิจกรรมถึงวันนี้');
  await prisma.$transaction(async tx=> {
    await lockYear(tx,record.activity.fiscalYearId);
    const old=await tx.applicationResult.findUnique({where:{participationId:id}});
    if(input.version!==undefined&&input.version!==(old?.version??0)) throw new AppError(409,'รายงานเปลี่ยนแล้ว กรุณารีเฟรชก่อนแก้ไข');
    const values={explanation:input.explanation,outcome:input.outcome,reportedOn:dateOnly(input.reportedOn),recordedBy:actor.id,reviewStatus:'pending'};
    await tx.applicationResult.upsert({where:{participationId:id},create:{...values,participationId:id},update:{...values,version:{increment:1}}});
    await touchYear(tx,record.activity.fiscalYearId); await audit(tx,actor,'report_result','training_participations',id,record.personId,record.activity.fiscalYearId,{before:old,after:input});
  });
}
export async function reviewResult(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor); const record=await getParticipation(id,actor);
  const input=z.object({decision:z.enum(['verified','changes_requested']),comment:z.string().trim().min(1).max(5000),resultVersion:z.coerce.number().int()}).parse(data);
  await prisma.$transaction(async tx=> {
    await lockYear(tx,record.activity.fiscalYearId);
    const result=await tx.applicationResult.findUnique({where:{participationId:id}}); if(!result) throw new AppError(404,'ยังไม่มีรายงานผล');
    if(result.version!==input.resultVersion) throw new AppError(409,'ผลรายงานเปลี่ยนแล้ว กรุณารีเฟรชก่อนตรวจ');
    if(input.decision==='verified'&&record.status!=='completed') throw new AppError(422,'ต้องอบรมสำเร็จก่อนตรวจยืนยันผล');
    await tx.review.create({data:{applicationResultId:result.id,resultVersion:result.version,reviewerId:actor.id,decision:input.decision,comment:input.comment}});
    await tx.applicationResult.update({where:{id:result.id},data:{reviewStatus:input.decision}}); await touchYear(tx,record.activity.fiscalYearId);
    await audit(tx,actor,'review','application_results',result.id,record.personId,record.activity.fiscalYearId,input);
  });
}
