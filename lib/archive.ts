import {Prisma,PrismaClient} from '@prisma/client';
import JSZip from 'jszip';
import type {Actor} from './auth';
import {assertAdmin} from './auth';
import {prisma,sqlTable} from './prisma';
import {sha256,AppError,asJson} from './security';
import {audit} from './records';
import {reportData} from './reports';
import {makeExport} from './exports';

export const BACKUP_MODELS=['department','person','personnelAssignment','user','fiscalYear','annualPersonnelScope','strategy','developmentPlan','planItem','planSchedule','trainingActivity','trainingParticipation','applicationResult','review','attachment','kPIDefinition','kPITarget','exportJob','notification','retentionPolicy','archiveManifest','deletionApproval','auditLog'] as const;
export type BackupModel=typeof BACKUP_MODELS[number];
type Row=Record<string,unknown>;
type Delegate={findMany:(args?:Record<string,unknown>)=>Promise<Row[]>,createMany:(args:{data:Row[]})=>Promise<unknown>,count:()=>Promise<number>};
export const delegate=(client:Prisma.TransactionClient|PrismaClient,model:BackupModel)=>client[model] as unknown as Delegate;
const dmmf=(model:BackupModel)=>Prisma.dmmf.datamodel.models.find(m=>m.name.toLowerCase()===model.toLowerCase())!;
export const schemaVersion=()=>sha256(JSON.stringify(Prisma.dmmf.datamodel.models));
export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export function encodeRow(model:BackupModel,row:Row,zip?:JSZip,files?:Record<string,string>):Row {
  const encoded:Row={};
  for(const field of dmmf(model).fields.filter(f=>f.kind!=='object')) {
    if(field.name==='data'&&model==='archiveManifest') continue; // สำเนา archive รุ่นเก่าอยู่ในคลังสำรองแยก
    const value=row[field.name];
    if(value===null||value===undefined) {encoded[field.name]=null;continue;}
    if(field.type==='Bytes') {
      const path=`files/${model}/${row.id}`;const bytes=Buffer.from(value as Uint8Array);zip?.file(path,bytes);if(files)files[path]=sha256(bytes);encoded[field.name]={$file:path,sha256:sha256(bytes)};
    } else if(field.type==='DateTime')encoded[field.name]=(value as Date).toISOString();
    else if(field.type==='Decimal')encoded[field.name]=String(value);
    else encoded[field.name]=value;
  }return encoded;
}
export async function decodeRow(model:BackupModel,row:Row,zip:JSZip):Promise<Row> {
  const decoded:Row={};
  for(const [key,value] of Object.entries(row)) {
    const field=dmmf(model).fields.find(f=>f.name===key);if(!field||field.kind==='object')throw new Error('Invalid backup column');
    if(value===null) {decoded[key]=field.type==='Json'?Prisma.DbNull:null;continue;}
    if(field.type==='DateTime')decoded[key]=new Date(String(value));
    else if(field.type==='Bytes') {const ref=value as {$file:string,sha256:string};if(!/^files\/[A-Za-z]+\/[A-Za-z0-9_-]+$/.test(ref.$file))throw new Error('Invalid file reference');const file=zip.file(ref.$file);if(!file)throw new Error('Missing backup file');const bytes=await file.async('nodebuffer');if(sha256(bytes)!==ref.sha256)throw new Error('Backup file checksum mismatch');decoded[key]=bytes;}
    else decoded[key]=value;
  }return decoded;
}
export async function createArchive(actor:Actor,yearId:string) {
  assertAdmin(actor);
  const report=await reportData(actor,{fiscalYearId:yearId},false);
  const zip=new JSZip(),reports:Record<string,{path:string,sha256:string}>={};
  for(const kind of ['normal','dashboard'] as const) {const file=await makeExport(report,kind,'xlsx');const path=`reports/${kind}.xlsx`;zip.file(path,file.bytes);reports[kind]={path,sha256:sha256(file.bytes)};}
  return prisma.$transaction(async tx=> {
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    const year=await tx.fiscalYear.findUniqueOrThrow({where:{id:yearId}});
    if(year.dataVersion!==report.year.dataVersion||year.state==='purged')throw new AppError(409,'ข้อมูลเปลี่ยนระหว่างเตรียม backup หรือปีถูกลบแล้ว กรุณาสร้างใหม่');
    const tables:Record<string,Row[]>={},counts:Record<string,number>={},files:Record<string,string>={};
    for(const model of BACKUP_MODELS) {
      let rows:Row[];
      if(model==='archiveManifest') rows=await tx.archiveManifest.findMany({select:{id:true,fiscalYearId:true,dataVersion:true,schemaVersion:true,sha256:true,counts:true,reports:true,state:true,restoreTestedAt:true,restoreEvidence:true,receivedBy:true,receivedAt:true,createdBy:true,createdAt:true}});
      else rows=await delegate(tx,model).findMany({orderBy:{id:'asc'}});
      tables[model]=rows.map(row=>encodeRow(model,row,zip,files));counts[model]=rows.length;
    }
    const raw=canonical(tables),manifest={schemaVersion:schemaVersion(),yearId,dataVersion:year.dataVersion,createdAt:new Date().toISOString(),counts,files,reports,dataSha256:sha256(raw),scope:'full domain database + attachments + reports; prior archive binaries and secrets are backed up separately; sessions/cache/uploads are invalidated'};
    zip.file('database.json',raw);zip.file('manifest.json',JSON.stringify(manifest));
    const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:1}});
    if(bytes.length>20*1024*1024)throw new AppError(422,'ชุดสำรองเกิน 20 MB สำหรับฐานข้อมูลฟรี โปรดใช้คลัง backup ภายนอกและกระบวนการที่หน่วยงานอนุมัติก่อนลบ');
    const archive=await tx.archiveManifest.create({data:{fiscalYearId:yearId,dataVersion:year.dataVersion,schemaVersion:manifest.schemaVersion,sha256:sha256(bytes),counts,reports,data:new Uint8Array(bytes),createdBy:actor.id},select:{id:true}});
    await audit(tx,actor,'archive_created','archive_manifests',archive.id,undefined,yearId);return archive.id;
  },{timeout:8000,isolationLevel:'RepeatableRead'});
}
export type BackupManifest={schemaVersion:string,yearId:string,dataVersion:number,counts:Record<string,number>,files:Record<string,string>,reports:Record<string,{path:string,sha256:string}>,dataSha256:string};
