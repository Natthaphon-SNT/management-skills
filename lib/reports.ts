import {Prisma} from '@prisma/client';
import {z} from 'zod';
import type {Actor} from './auth';
import {assertOwner} from './auth';
import {prisma,withColdStartRetry} from './prisma';
import {AppError} from './security';
import {bangkokToday,dateOnly,day,fiscalBounds,FORMULAS,KPI_NAMES,round,type KpiCode} from './calendar';
import type {Tx} from './records';

export const filterSchema=z.object({
  q:z.string().trim().max(255).optional(),
  fiscalYearId:z.string().optional(),quarter:z.coerce.number().int().min(1).max(4).optional(),
  from:z.iso.date().optional(),to:z.iso.date().optional(),departmentId:z.string().optional(),personId:z.string().optional(),
  category:z.enum(['professional','teaching','other']).optional(),
  status:z.enum(['planned','completed','cancelled']).optional(),reviewStatus:z.enum(['missing','pending','verified','changes_requested']).optional(),
}).refine(f=>!f.from||!f.to||f.to>=f.from,{message:'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม',path:['to']});
export type Filters=z.infer<typeof filterSchema>;
export const rowSelect=Prisma.validator<Prisma.TrainingParticipationSelect>()({
  id:true,personId:true,departmentId:true,planItemId:true,status:true,reportDueOn:true,recordedBy:true,
  person:{select:{id:true,code:true,fullName:true}},department:{select:{id:true,name:true}},
  activity:{select:{id:true,fiscalYearId:true,quarter:true,startsOn:true,endsOn:true,organizer:true,category:true,otherCategory:true,title:true,location:true,hours:true,exceptionReason:true,exceptionReviewedBy:true}},
  result:{select:{explanation:true,outcome:true,reportedOn:true,reviewStatus:true,version:true}},_count:{select:{attachments:true}},
});
export type ReportRow=Prisma.TrainingParticipationGetPayload<{select:typeof rowSelect}>;
export type Kpi={code:KpiCode,name:string,formula:string,definitionId:string|null,version:number|null,numerator:number,denominator:number,actual:number|null,target:number|null,unit:string,gap:number|null,attainment:number|null,status:string,evidenceRequired:boolean,verifiedRequired:boolean};
const distinct=<T>(items:T[])=>new Set(items).size;
const totalHours=(rows:ReportRow[])=>round(rows.reduce((sum,r)=>sum+Number(r.activity.hours??0),0));

export async function reportData(actor:Actor,input:Record<string,unknown>,lookups=true) {
  const clean=Object.fromEntries(Object.entries(input).filter(([,v])=>v!==''&&v!==undefined&&v!==null));
  const filters=filterSchema.parse(clean);
  if(actor.role!=='ADMIN') { if(filters.personId) assertOwner(actor,filters.personId); filters.personId=actor.personId!; }
  return withColdStartRetry(()=>prisma.$transaction(tx=>buildReport(tx,actor,filters,lookups),{isolationLevel:'RepeatableRead',maxWait:2000,timeout:8000}));
}

async function buildReport(tx:Tx,actor:Actor,filters:Filters,lookups:boolean) {
  const year=await tx.fiscalYear.findFirst({where:filters.fiscalYearId?{id:filters.fiscalYearId}:{},orderBy:{year:'desc'}});
  if(!year) throw new AppError(422,'กรุณาให้ ADMIN สร้างปีงบประมาณก่อน'); filters.fiscalYearId=year.id;
  const bounds=fiscalBounds(year.year,filters.quarter);
  const periodStart=[bounds.start,filters.from??bounds.start].sort().at(-1)!;
  const periodEnd=[bounds.end,filters.to??bounds.end].sort()[0];
  const scopes=await tx.annualPersonnelScope.findMany({where:{fiscalYearId:year.id,included:true,...(filters.q?{person:{fullName:{contains:filters.q,mode:'insensitive' as const}}}:{}),...(filters.departmentId?{departmentId:filters.departmentId}:{}),...(filters.personId?{personId:filters.personId}:{})},
    select:{id:true,personId:true,departmentId:true,basis:true,person:{select:{id:true,code:true,fullName:true,personnelType:true,position:true}},department:{select:{id:true,name:true}}},orderBy:{person:{fullName:'asc'}}});
  const people=scopes.map(s=>s.personId);
  // A personnel snapshot determines KPI population, never whether a saved record is visible.
  const where:Prisma.TrainingParticipationWhereInput={...(filters.personId?{personId:filters.personId}:{}),
    AND:[...(filters.q?[{person:{fullName:{contains:filters.q,mode:'insensitive' as const}}}]:[]),
      ...(filters.departmentId?[{OR:[{person:{scopes:{some:{fiscalYearId:year.id,departmentId:filters.departmentId}}}},
        {departmentId:filters.departmentId,person:{scopes:{none:{fiscalYearId:year.id}}}}]}]:[])],
    ...(filters.status?{status:filters.status}:{}),
    ...(filters.reviewStatus?{result:filters.reviewStatus==='missing'?null:{reviewStatus:filters.reviewStatus}}:{}),
    activity:{fiscalYearId:year.id,startsOn:{gte:dateOnly(periodStart),lte:dateOnly(periodEnd)},...(filters.category?{category:filters.category}:{})}};
  const [rows,definitions]=await Promise.all([
    tx.trainingParticipation.findMany({where,select:rowSelect,orderBy:[{activity:{startsOn:'desc'}},{id:'desc'}],take:10001}),
    tx.kPIDefinition.findMany({where:{fiscalYearId:year.id,effectiveOn:{lte:dateOnly([bangkokToday(),periodEnd].sort()[0])}},include:{target:true},orderBy:{version:'desc'}}),
  ]);
  if(rows.length>10000) throw new AppError(422,'ข้อมูลเกิน 10,000 รายการต่อคำขอ กรุณาจำกัดปี/ฝ่าย/ช่วงวันที่ก่อนดูหรือส่งออก เพื่อให้ทำงานได้ภายในเวลา serverless');
  const complete=rows.filter(r=>r.status==='completed'&&(!r.activity.exceptionReason||r.activity.exceptionReviewedBy));
  const population=new Set(people),scopedComplete=complete.filter(r=>population.has(r.personId));
  const department=filters.departmentId??(filters.personId?scopes[0]?.departmentId:undefined);
  const chooseDefinition=(code:KpiCode,personId=filters.personId,departmentId=department)=>definitions.filter(d=>d.code===code&&(!d.personId||d.personId===personId)&&(!d.departmentId||d.departmentId===departmentId))
    .sort((a,b)=>Number(!!b.personId)-Number(!!a.personId)||Number(!!b.departmentId)-Number(!!a.departmentId)||b.version-a.version)[0];
  const kpis:Kpi[]=(['B','D','E','F'] as KpiCode[]).map(code=> {
    const def=chooseDefinition(code), eligible=scopedComplete.filter(r=>(!def?.evidenceRequired||r._count.attachments>0)&&(!def?.verifiedRequired||r.result?.reviewStatus==='verified'));
    const due=scopedComplete.filter(r=>day(r.reportDueOn)<=bangkokToday());
    let numerator=0,denominator=scopes.length;
    if(code==='B') numerator=distinct(eligible.map(r=>r.personId));
    if(code==='D') { numerator=due.filter(r=>r.result?.explanation.trim()&&r.result?.outcome.trim()).length; denominator=due.length; }
    if(code==='E') { numerator=eligible.filter(r=>r.result?.reviewStatus==='verified').length; denominator=scopedComplete.length; }
    if(code==='F') numerator=totalHours(eligible);
    const actual=denominator?round(numerator/denominator*(code==='F'?1:100)):null;
    const target=def?.target?.value!==undefined&&def.target.value!==null?Number(def.target.value):null;
    const gap=actual!==null&&target!==null?round(def?.direction==='at_most'?target-actual:actual-target):null;
    return {code,name:def?.name??KPI_NAMES[code],formula:def?.formula??FORMULAS[code],definitionId:def?.id??null,version:def?.version??null,numerator,denominator,actual,target,gap,
      unit:code==='F'?'ชั่วโมง/คน':'%',attainment:actual!==null&&target!==null&&target>0?round(actual/target*100):null,
      status:actual===null?'ไม่มีข้อมูลสำหรับประเมิน':target===null?'ยังไม่ได้กำหนดเป้าหมาย':gap!==null&&gap>=0?'ผ่านเป้าหมาย':'ยังไม่ผ่านเป้าหมาย',
      evidenceRequired:def?.evidenceRequired??false,verifiedRequired:def?.verifiedRequired??false};
  });
  const personHours=scopes.map(scope=> {
    const def=chooseDefinition('F',scope.personId,scope.departmentId);
    const eligible=complete.filter(r=>r.personId===scope.personId&&(!def?.evidenceRequired||r._count.attachments>0)&&(!def?.verifiedRequired||r.result?.reviewStatus==='verified'));
    const hours=totalHours(eligible),target=def?.target?.value!==undefined&&def.target.value!==null?Number(def.target.value):null;
    return {personId:scope.personId,fullName:scope.person.fullName,department:scope.department.name,hours,missingHours:eligible.filter(r=>r.activity.hours===null).length,target,gap:target===null?null:round(def?.direction==='at_most'?target-hours:hours-target)};
  });
  function group(label:(r:ReportRow)=>string) { const result:Record<string,number>={}; for(const row of complete) {const key=label(row);result[key]=(result[key]??0)+1;} return result; }
  const lookupData=lookups?await getLookups(tx,actor):null;
  return {year,filters,periodStart,periodEnd,scopes,rows,kpis,personHours,
    charts:{department:group(r=>r.department.name),quarter:group(r=>'ไตรมาส '+r.activity.quarter),category:group(r=>r.activity.category)},
    summary:{population:scopes.length,completed:complete.length,developedPeople:distinct(complete.map(r=>r.personId)),missingResult:rows.filter(r=>!r.result).length,pending:rows.filter(r=>r.result?.reviewStatus==='pending').length,verified:rows.filter(r=>r.result?.reviewStatus==='verified').length,hours:totalHours(complete),missingHours:complete.filter(r=>r.activity.hours===null).length},
    lookups:lookupData,scopeNote:'ฐานบุคลากรใช้ snapshot ประจำปีและฝ่ายใน snapshot; กิจกรรมจริงนับตามวันที่เริ่ม ไตรมาสหลักมาจากวันที่เริ่ม; รวมคนไม่มีบัญชี/ไม่มีอบรมในตัวหาร; ตัวกรองประเภท/สถานะกิจกรรมไม่ลดฐานบุคลากร; กิจกรรมข้ามไตรมาสต้องผ่าน ADMIN ก่อนนับผลสำเร็จ'};
}
export type ReportData=Awaited<ReturnType<typeof reportData>>;
export async function getLookups(tx:Tx,actor:Actor) {
  const [years,departments,people]=await Promise.all([
    tx.fiscalYear.findMany({orderBy:{year:'desc'}}),tx.department.findMany({orderBy:{name:'asc'}}),
    tx.person.findMany({where:actor.role==='ADMIN'?{}:{id:actor.personId!},select:{id:true,code:true,fullName:true},orderBy:{fullName:'asc'}}),
  ]); return {years,departments,people};
}
