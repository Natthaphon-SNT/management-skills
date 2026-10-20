import {z} from 'zod';
import type {Actor} from './auth';
import {assertAdmin} from './auth';
import {prisma,withColdStartRetry,sqlTable} from './prisma';
import {AppError} from './security';
import {dateOnly,day,fiscalBounds,FORMULAS,type KpiCode} from './calendar';
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
  const input=z.object({code:text,fullName:text,personnelType:optional,position:optional,hiredOn:date,leftOn:z.preprocess(v=>v===''?undefined:v,date.optional()),active:flag,departmentId:text,effectiveOn:date})
    .refine(v=>!v.leftOn||v.leftOn>=v.hiredOn,{message:'วันสิ้นสุดงานต้องไม่ก่อนวันเริ่มงาน'}).refine(v=>v.effectiveOn>=v.hiredOn,{message:'วันเริ่มฝ่ายต้องไม่ก่อนวันเริ่มงาน'}).parse(data);
  return prisma.$transaction(async tx=> {
    // เรียงล็อกทุกปีก่อนแก้ master ป้องกัน snapshot/backup เห็นข้อมูลไม่ครบชุด
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    const old=id?await tx.person.findUniqueOrThrow({where:{id}}):null;
    const values={code:input.code,fullName:input.fullName,personnelType:input.personnelType??null,position:input.position??null,hiredOn:dateOnly(input.hiredOn),leftOn:input.leftOn?dateOnly(input.leftOn):null,active:input.active};
    const person=old?await tx.person.update({where:{id},data:values}):await tx.person.create({data:values});
    const latest=await tx.personnelAssignment.findFirst({where:{personId:person.id},orderBy:{startsOn:'desc'}});
    if(!latest||latest.departmentId!==input.departmentId) {
      if(latest&&input.effectiveOn<=day(latest.startsOn)) throw new AppError(422,'วันย้ายฝ่ายต้องหลังวันเริ่มประวัติฝ่ายล่าสุด');
      if(latest) await tx.personnelAssignment.update({where:{id:latest.id},data:{endsOn:new Date(+dateOnly(input.effectiveOn)-86400000)}});
      await tx.personnelAssignment.create({data:{personId:person.id,departmentId:input.departmentId,startsOn:dateOnly(input.effectiveOn)}});
    }
    const openYears=await tx.fiscalYear.findMany({where:{state:'open'},select:{id:true}});
    for(const year of openYears)await snapshot(tx,year.id,person.id);
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}}); await audit(tx,actor,old?'update':'create','personnel',person.id,person.id,undefined,{before:old,after:input});return person.id;
  });
}
export async function saveAccount(actor:Actor,id:string,data:Record<string,unknown>) {
  assertAdmin(actor); const input=z.object({personId:text,role:z.enum(['USER','ADMIN']),active:flag,email:z.preprocess(v=>v===''?undefined:v,z.email().max(255).optional())}).parse(data);
  await prisma.$transaction(async tx=> {
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ${sqlTable('users')} WHERE role='ADMIN' ORDER BY id FOR UPDATE`;
    const old=await tx.user.findUniqueOrThrow({where:{id}});
    if(old.personId&&old.personId!==input.personId) throw new AppError(422,'บัญชีที่เชื่อมแล้วไม่สามารถย้ายเจ้าของได้');
    if(old.role==='ADMIN'&&(input.role!=='ADMIN'||!input.active)&&await tx.user.count({where:{role:'ADMIN',active:true,approvedAt:{not:null}}})<=1) throw new AppError(422,'ต้องเหลือ ADMIN ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี');
    await tx.user.update({where:{id},data:{...input,email:input.email??null,approvedAt:old.approvedAt??new Date()}});
    const openYears=await tx.fiscalYear.findMany({where:{state:'open'},select:{id:true}});
    for(const year of openYears)await snapshot(tx,year.id,input.personId);
    if(!input.active||input.role!==old.role) await tx.authSession.deleteMany({where:{userId:id}});
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}}); await audit(tx,actor,'approve_or_update_account','users',id,input.personId,undefined,{role:input.role,active:input.active});
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
    const [people,departments,years,strategies,accounts,scopes,kpis]=await Promise.all([
      tx.person.findMany({include:{assignments:{include:{department:true},orderBy:{startsOn:'desc'}}},orderBy:{fullName:'asc'}}),tx.department.findMany(),tx.fiscalYear.findMany({orderBy:{year:'desc'}}),tx.strategy.findMany(),
      tx.user.findMany({select:{id:true,username:true,name:true,email:true,role:true,active:true,approvedAt:true,personId:true},orderBy:{createdAt:'desc'}}),
      tx.annualPersonnelScope.findMany({include:{person:{select:{fullName:true}},department:{select:{name:true}},fiscalYear:{select:{year:true}}},orderBy:{fiscalYear:{year:'desc'}}}),
      tx.kPIDefinition.findMany({include:{target:true,fiscalYear:{select:{year:true}},department:{select:{name:true}},person:{select:{fullName:true}}},orderBy:{createdAt:'desc'}}),
    ]); return {people,departments,years,strategies,accounts,scopes,kpis};
  },{timeout:8000}));
}
