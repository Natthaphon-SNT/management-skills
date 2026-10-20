import {fileTypeFromBuffer} from 'file-type';
import type {Actor} from './auth';
import {prisma,withColdStartRetry} from './prisma';
import {AppError,sha256} from './security';
import {audit,getParticipation,lockYear,touchYear} from './records';
import {z} from 'zod';

const MAX_SIZE=10*1024*1024;
export async function beginUpload(actor:Actor,participationId:string,data:Record<string,unknown>) {
  await getParticipation(participationId,actor);
  const input=z.object({name:z.string().min(1).max(255),size:z.coerce.number().int().positive().max(MAX_SIZE,'ไฟล์ต้องไม่เกิน 10 MB'),chunks:z.coerce.number().int().min(1).max(5)}).parse(data);
  if(Math.ceil(input.size/(2*1024*1024))!==input.chunks) throw new AppError(422,'จำนวนส่วนของไฟล์ไม่ถูกต้อง');
  if(await prisma.pendingUpload.count({where:{ownerId:actor.personId!,expiresAt:{gt:new Date()}}})>=5) throw new AppError(429,'มีงานอัปโหลดค้างอยู่หลายรายการ กรุณารอหรือดำเนินการให้เสร็จ');
  return prisma.pendingUpload.create({data:{ownerId:actor.personId!,participationId,originalName:input.name.split(/[\\/]/).at(-1)!,totalSize:input.size,chunkCount:input.chunks,expiresAt:new Date(Date.now()+30*60000)},select:{id:true}});
}
export async function uploadChunk(actor:Actor,id:string,index:number,bytes:Uint8Array) {
  const upload=await withColdStartRetry(()=>prisma.pendingUpload.findUnique({where:{id}}));
  if(!upload||upload.ownerId!==actor.personId||upload.expiresAt<new Date()) throw new AppError(403,'ไม่มีสิทธิ์อัปโหลดหรือหมดเวลา');
  if(!Number.isInteger(index)||index<0||index>=upload.chunkCount||bytes.length>2*1024*1024) throw new AppError(422,'ส่วนของไฟล์ไม่ถูกต้อง');
  await prisma.uploadChunk.upsert({where:{uploadId_index:{uploadId:id,index}},create:{uploadId:id,index,data:Buffer.from(bytes)},update:{data:Buffer.from(bytes)}});
}
export async function finishUpload(actor:Actor,id:string) {
  const upload=await withColdStartRetry(()=>prisma.pendingUpload.findUnique({where:{id},include:{chunks:{orderBy:{index:'asc'}}}}));
  if(!upload||upload.ownerId!==actor.personId||upload.expiresAt<new Date()) throw new AppError(403,'ไม่มีสิทธิ์อัปโหลดหรือหมดเวลา');
  const record=await getParticipation(upload.participationId,actor);
  const bytes=Buffer.concat(upload.chunks.map(c=>Buffer.from(c.data)));
  if(bytes.length!==upload.totalSize||upload.chunks.length!==upload.chunkCount||bytes.length>MAX_SIZE) throw new AppError(422,'ไฟล์ยังไม่ครบ กรุณาอัปโหลดใหม่');
  const mime=await fileTypeFromBuffer(bytes); if(!mime||!['application/pdf','image/jpeg','image/png'].includes(mime.mime)) throw new AppError(422,'รองรับเฉพาะ PDF, JPG และ PNG ที่มีเนื้อหาไฟล์ถูกต้อง');
  await prisma.$transaction(async tx=> {
    await lockYear(tx,record.activity.fiscalYearId);
    await tx.attachment.create({data:{participationId:record.id,originalName:upload.originalName,mime:mime.mime,size:bytes.length,sha256:sha256(bytes),data:bytes,uploadedBy:actor.id}});
    await tx.applicationResult.updateMany({where:{participationId:record.id},data:{reviewStatus:'pending',version:{increment:1}}});
    await tx.pendingUpload.delete({where:{id}}); await touchYear(tx,record.activity.fiscalYearId); await audit(tx,actor,'upload','training_participations',record.id,record.personId,record.activity.fiscalYearId);
  },{timeout:8000}); return record.id;
}
export function fileResponse(bytes:Uint8Array,name:string,mime:string) {
  let offset=0;
  const stream=new ReadableStream<Uint8Array>({pull(controller) { if(offset>=bytes.length) {controller.close();return;} const end=Math.min(offset+64*1024,bytes.length);controller.enqueue(new Uint8Array(bytes.subarray(offset,end)));offset=end; }});
  return new Response(stream,{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="download.${name.split('.').at(-1)?.replace(/[^a-z0-9]/gi,'')||'bin'}"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
