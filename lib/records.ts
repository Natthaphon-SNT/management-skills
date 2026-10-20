import { Prisma } from '@prisma/client';
import type { Actor } from './auth';
import { assertOwner } from './auth';
import { prisma,withColdStartRetry,sqlTable } from './prisma';
import { AppError,asJson } from './security';
import { dateOnly } from './calendar';
import {scopeReadiness} from './annual-scopes';
export type Tx=Prisma.TransactionClient;
export async function lockYear(tx:Tx,id:string,open=true) {
  await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} WHERE id=${id} FOR UPDATE`;
  const year=await tx.fiscalYear.findUnique({where:{id}});
  if(!year) throw new AppError(404,'ไม่พบปีงบประมาณ');
  if(open && year.state!=='open') throw new AppError(422,'ปีนี้ปิดรับการแก้ไขแล้ว กรุณาให้ ADMIN เปิดปีก่อน');
  return year;
}
export const touchYear=(tx:Tx,id:string)=>tx.fiscalYear.update({where:{id},data:{dataVersion:{increment:1}}});
export async function audit(tx:Tx,actor:Actor|null,action:string,entity:string,entityId?:string,ownerId?:string,fiscalYearId?:string,changes?:unknown) {
  await tx.auditLog.create({data:{actorId:actor?.id,ownerId,fiscalYearId,action,entity,entityId,...(changes?{changes:asJson(changes) as Prisma.InputJsonValue}:{})}});
}
export async function assignment(tx:Tx,personId:string,date:string) {
  const record=await tx.personnelAssignment.findFirst({where:{personId,startsOn:{lte:dateOnly(date)},OR:[{endsOn:null},{endsOn:{gte:dateOnly(date)}}]},orderBy:{startsOn:'desc'}});
  if(!record) throw new AppError(422,'ไม่พบประวัติฝ่ายที่มีผล ณ วันเริ่มกิจกรรม'); return record;
}
export async function getParticipation(id:string,actor:Actor) {
  const record=await withColdStartRetry(()=>prisma.trainingParticipation.findUnique({where:{id},include:{activity:{include:{strategy:true,fiscalYear:true}},person:true,department:true,planItem:true,result:{include:{reviews:{orderBy:{reviewedAt:'desc'}}}},attachments:{select:{id:true,originalName:true,mime:true,size:true,sha256:true}}}}));
  if(!record) throw new AppError(404,'ไม่พบรายการอบรม'); assertOwner(actor,record.personId); return record;
}
export async function snapshot(tx:Tx,yearId:string,personId?:string) {
  const year=await tx.fiscalYear.findUniqueOrThrow({where:{id:yearId}});
  const people=await tx.person.findMany({where:{deletedAt:null,...(personId?{id:personId}:{}),hiredOn:{lte:year.endsOn},OR:[{leftOn:null},{leftOn:{gte:year.startsOn}}]},include:{assignments:{where:{startsOn:{lte:year.endsOn},OR:[{endsOn:null},{endsOn:{gte:year.startsOn}}]},orderBy:{startsOn:'asc'}}}});
  const existing=await tx.annualPersonnelScope.findMany({where:{fiscalYearId:yearId},select:{personId:true,included:true}});
  const readiness=scopeReadiness(year,people,existing);
  const created=readiness.ready.length?await tx.annualPersonnelScope.createMany({data:readiness.ready.map(p=>({fiscalYearId:yearId,personId:p.id,departmentId:p.departmentId,basis:'snapshot ฝ่ายแรกที่มีผลในปี รวมผู้เข้าระหว่างปี (ค่าเริ่มต้น ปรับได้)'})),skipDuplicates:true}):{count:0};
  return {added:created.count,existing:readiness.existing,excluded:readiness.excluded,missingDepartment:readiness.missingDepartment};
}
