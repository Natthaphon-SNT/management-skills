import {z} from 'zod';
import type {Actor} from './auth';
import {assertAdmin} from './auth';
import {prisma,withColdStartRetry,sqlTable} from './prisma';
import {AppError} from './security';
import {dateOnly,day,bangkokToday,fiscalBounds,FORMULAS,type KpiCode} from './calendar';
import {audit,lockYear,snapshot,touchYear} from './records';
const text=z.string().trim().min(1,'กรุณากรอกข้อมูลให้ครบ').max(255);
const optional=z.preprocess(v=>v===''||v===null?undefined:v,z.string().max(5000).optional());
const flag=z.preprocess(v=>v===true||v==='true'||v==='1'||v===1,z.boolean());
const date=z.iso.date();

export async function createYear(actor:Actor,data:Record<string,unknown>) {
  assertAdmin(actor); const {year}=z.object({year:z.coerce.number().int().min(2500).max(2700)}).parse(data); const bounds=fiscalBounds(year);
  return prisma.$transaction(async tx=> {
    const created=await tx.fiscalYear.create({data:{year,startsOn:dateOnly(bounds.start),endsOn:dateOnly(bounds.end),retention:{create:{}}}});
    await snapshot(tx,created.id); await audit(tx,actor,'create','fiscal_years',created.id,undefined,created.id,{year}); return created.id;
  },{timeout:8000});
}
export async function addScopes(actor:Actor,id:string) {
  assertAdmin(actor); await prisma.$transaction(async tx=> {await lockYear(tx,id);await snapshot(tx,id);await touchYear(tx,id);await audit(tx,actor,'add_missing_scopes','fiscal_years',id,undefined,id);},{timeout:8000});
}
export async function updateScope(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor); const input=z.object({departmentId:text,included:flag,basis:z.string().trim().min(1).max(1000)}).parse(data);
  await prisma.$transaction(async tx=> {const old=await tx.annualPersonnelScope.findUniqueOrThrow({where:{id}});await lockYear(tx,old.fiscalYearId);await tx.annualPersonnelScope.update({where:{id},data:input});await touchYear(tx,old.fiscalYearId);await audit(tx,actor,'revise_scope','annual_personnel_scopes',id,old.personId,old.fiscalYearId,{before:old,after:input});});
}
export async function savePerson(actor:Actor,data:Record<string,unknown>,id?:string) {
  assertAdmin(actor);
  const input=z.object({code:text,fullName:text,personnelType:optional,position:optional,hiredOn:date,leftOn:z.preprocess(v=>v===''?undefined:v,date.optional()),active:flag,departmentId:text,effectiveOn:z.preprocess(v=>v===''?undefined:v,date.optional())})
    .refine(v=>!v.leftOn||v.leftOn>=v.hiredOn,{message:'วันสิ้นสุดการใช้ระบบต้องไม่ก่อนวันเริ่มใช้ระบบ'}).refine(v=>!v.effectiveOn||v.effectiveOn>=v.hiredOn,{message:'วันที่ย้ายฝ่ายต้องไม่ก่อนวันเริ่มใช้ระบบ'}).parse(data);
  return prisma.$transaction(async tx=> {
    // เรียงล็อกทุกปีก่อนแก้ master ป้องกัน snapshot/backup เห็นข้อมูลไม่ครบชุด
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    const old=id?await tx.person.findUniqueOrThrow({where:{id}}):null;
    if(old?.deletedAt)throw new AppError(422,'กรุณากู้คืนทะเบียนก่อนแก้ไข');
    const values={code:input.code,fullName:input.fullName,personnelType:input.personnelType??null,position:input.position??null,hiredOn:dateOnly(input.hiredOn),leftOn:input.leftOn?dateOnly(input.leftOn):null,active:input.active};
    const person=old?await tx.person.update({where:{id},data:values}):await tx.person.create({data:values});
    const latest=await tx.personnelAssignment.findFirst({where:{personId:person.id},orderBy:{startsOn:'desc'}});
    if(!latest||latest.departmentId!==input.departmentId) {
      const effectiveOn=input.effectiveOn??(latest?bangkokToday():input.hiredOn);
      if(effectiveOn<input.hiredOn)throw new AppError(422,'วันที่ย้ายฝ่ายต้องไม่ก่อนวันเริ่มใช้ระบบ');
      if(latest&&effectiveOn<=day(latest.startsOn)) throw new AppError(422,'วันย้ายฝ่ายต้องหลังวันเริ่มประวัติฝ่ายล่าสุด');
      if(latest) await tx.personnelAssignment.update({where:{id:latest.id},data:{endsOn:new Date(+dateOnly(effectiveOn)-86400000)}});
      await tx.personnelAssignment.create({data:{personId:person.id,departmentId:input.departmentId,startsOn:dateOnly(effectiveOn)}});
    }
    const openYears=await tx.fiscalYear.findMany({where:{state:'open'},select:{id:true}});
    for(const year of openYears)await snapshot(tx,year.id,person.id);
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}}); await audit(tx,actor,old?'update':'create','personnel',person.id,person.id,undefined,{before:old,after:input});return person.id;
  });
}
export async function saveAccount(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor); const input=z.object({intent:z.enum(['approve','settings']).default('approve'),personId:z.preprocess(v=>v===''?undefined:v,text.optional()),role:z.enum(['USER','ADMIN']),active:flag,email:z.preprocess(v=>v===''?undefined:v,z.string().trim().pipe(z.email().max(255)).optional())})
    .refine(v=>v.intent==='settings'||!!v.personId,{message:'กรุณาเชื่อมทะเบียนบุคลากรก่อนอนุมัติบัญชี',path:['personId']}).parse(data);
  await prisma.$transaction(async tx=> {
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ${sqlTable('users')} WHERE role='ADMIN' ORDER BY id FOR UPDATE`;
    const old=await tx.user.findUniqueOrThrow({where:{id}});
    if(old.deletedAt)throw new AppError(422,'กรุณากู้คืนบัญชีก่อนแก้ไข');
    if(input.active&&old.personId&&await tx.person.count({where:{id:old.personId,deletedAt:{not:null}}}))throw new AppError(422,'กรุณากู้คืนทะเบียนบุคลากรก่อนเปิดใช้งานบัญชี');
    if(input.personId&&old.personId&&old.personId!==input.personId) throw new AppError(422,'บัญชีที่เชื่อมแล้วไม่สามารถย้ายเจ้าของได้');
    if(old.role==='ADMIN'&&old.active&&old.approvedAt&&old.personId&&(input.role!=='ADMIN'||!input.active)&&await tx.user.count({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null}}})<=1) throw new AppError(422,'ต้องเหลือ ADMIN ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี');
    if(input.intent==='approve'){
      if(!await tx.person.count({where:{id:input.personId!,deletedAt:null}}))throw new AppError(422,'ทะเบียนบุคลากรนี้ถูกลบหรือไม่พบในระบบ');
      const linked=await tx.user.findFirst({where:{personId:input.personId!,id:{not:id}},select:{id:true}});
      if(linked)throw new AppError(422,'ทะเบียนบุคลากรนี้เชื่อมกับบัญชีอื่นแล้ว กรุณาเลือกทะเบียนที่ยังไม่มีบัญชี');
    }
    await tx.user.update({where:{id},data:{role:input.role,active:input.active,email:input.email??null,...(input.intent==='approve'?{personId:input.personId!,approvedAt:old.approvedAt??new Date()}: {})}});
    if(input.intent==='approve'){
      const openYears=await tx.fiscalYear.findMany({where:{state:'open'},select:{id:true}});
      for(const year of openYears)await snapshot(tx,year.id,input.personId!);
    }
    if(!input.active||input.role!==old.role) await tx.authSession.deleteMany({where:{userId:id}});
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}}); await audit(tx,actor,'approve_or_update_account','users',id,input.intent==='approve'?input.personId:old.personId??undefined,undefined,{role:input.role,active:input.active,intent:input.intent});
  });
}
export async function saveMaster(actor:Actor,table:'department'|'strategy',data:Record<string,unknown>,id?:string) {
  if(['strategy'].includes(table)) {assertAdmin(actor);throw new AppError(404,'ไม่รองรับรายการนี้');}
  assertAdmin(actor); const input=z.object({name:text,active:flag,level:z.enum(['institution','department']).optional()}).parse(data);
  await prisma.$transaction(async tx=> {
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    const row=id?await tx.department.update({where:{id},data:{name:input.name,active:input.active}}):await tx.department.create({data:{name:input.name,active:input.active}});
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}}); await audit(tx,actor,'save',table,row.id,undefined,undefined,input);
  });
}
export async function saveKpi(actor:Actor,data:Record<string,unknown>) {
  assertAdmin(actor); const input=z.object({fiscalYearId:text,departmentId:optional,personId:optional,code:z.enum(['B','D','E','F']),name:text,description:z.string().trim().min(1).max(5000),
    target:z.preprocess(v=>v===''||v===undefined?null:v,z.coerce.number().min(0).max(100000).nullable()),direction:z.enum(['at_least','at_most']),evidenceRequired:flag,verifiedRequired:flag,idpStatus:z.enum(['draft','submitted','approved']).default('approved'),effectiveOn:date}).parse(data);
  if(input.code!=='F'&&input.personId) throw new AppError(422,'เป้าหมายรายบุคคลใช้เฉพาะ KPI F');
  if(input.code!=='F'&&input.target!==null&&input.target>100) throw new AppError(422,'เป้าหมายร้อยละต้องไม่เกิน 100');
  await prisma.$transaction(async tx=> {
    const year=await lockYear(tx,input.fiscalYearId); if(input.effectiveOn<day(year.startsOn)||input.effectiveOn>day(year.endsOn)) throw new AppError(422,'วันที่มีผลต้องอยู่ในปีงบประมาณ');
    const latest=await tx.kPIDefinition.findFirst({where:{fiscalYearId:input.fiscalYearId,departmentId:input.departmentId??null,personId:input.personId??null,code:input.code},orderBy:{version:'desc'},select:{version:true}});
    const {target,...values}=input;
    const def=await tx.kPIDefinition.create({data:{...values,departmentId:input.departmentId??null,personId:input.personId??null,effectiveOn:dateOnly(input.effectiveOn),version:(latest?.version??0)+1,formula:FORMULAS[input.code as KpiCode],unit:input.code==='F'?'ชั่วโมง/คน':'%',definedBy:actor.id,target:{create:{value:target}}}});
    await touchYear(tx,year.id); await audit(tx,actor,'version_kpi','kpi_definitions',def.id,undefined,year.id,input);
  });
}

export async function adminData(actor:Actor) {
  assertAdmin(actor); return withColdStartRetry(()=>prisma.$transaction(async tx=> {
    const [people,departments,years,strategies,accounts,scopes,kpis,deletedPeople,deletedAccounts]=await Promise.all([
      tx.person.findMany({where:{deletedAt:null},include:{user:{select:{id:true}},assignments:{include:{department:true},orderBy:{startsOn:'desc'}}},orderBy:{fullName:'asc'}}),tx.department.findMany(),tx.fiscalYear.findMany({orderBy:{year:'desc'}}),tx.strategy.findMany(),
      tx.user.findMany({where:{deletedAt:null},select:{id:true,username:true,name:true,email:true,role:true,active:true,approvedAt:true,personId:true,registrationDepartment:{select:{name:true}},notices:{where:{channel:'email'},orderBy:{createdAt:'desc'},take:1,select:{status:true,error:true,sentAt:true,createdAt:true}}},orderBy:{createdAt:'desc'}}),
      tx.annualPersonnelScope.findMany({include:{person:{select:{fullName:true}},department:{select:{name:true}},fiscalYear:{select:{year:true}}},orderBy:{fiscalYear:{year:'desc'}}}),
      tx.kPIDefinition.findMany({include:{target:true,fiscalYear:{select:{year:true}},department:{select:{name:true}},person:{select:{fullName:true}}},orderBy:{createdAt:'desc'}}),
      tx.person.findMany({where:{deletedAt:{not:null}},select:{id:true,code:true,fullName:true},orderBy:{deletedAt:'desc'}}),
      tx.user.findMany({where:{deletedAt:{not:null}},select:{id:true,username:true,name:true},orderBy:{deletedAt:'desc'}}),
    ]); return {people,departments,years,strategies,accounts,scopes,kpis,deletedPeople,deletedAccounts};
  },{timeout:8000}));
}
