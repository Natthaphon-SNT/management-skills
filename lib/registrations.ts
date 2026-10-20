import {prisma,sqlTable} from './prisma';
import {assertAdmin,type Actor} from './auth';
import {AppError} from './security';
import {audit} from './records';
import {z} from 'zod';

export async function removeRegistration(actor:Actor,kind:'personnel'|'accounts',id:string,data:Record<string,unknown>,restore=false){
  assertAdmin(actor);
  const input=restore?null:z.object({confirmation:z.literal('DELETE',{error:'กรุณาพิมพ์ DELETE เพื่อยืนยัน'}),reason:z.string().trim().min(1,'กรุณาระบุเหตุผลการลบ').max(3000)}).parse(data);
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ${sqlTable('users')} WHERE role='ADMIN' ORDER BY id FOR UPDATE`;
    const person=kind==='personnel'?await tx.person.findUniqueOrThrow({where:{id},select:{id:true,deletedAt:true,user:{select:{id:true}}}}):null;
    const accountId=kind==='accounts'?id:person?.user?.id;
    const account=accountId?await tx.user.findUniqueOrThrow({where:{id:accountId},select:{id:true,role:true,active:true,approvedAt:true,personId:true,deletedAt:true,person:{select:{deletedAt:true}}}}):null;
    const removed=kind==='personnel'?person?.deletedAt:account?.deletedAt;
    if(restore&&!removed)throw new AppError(422,'รายการนี้ไม่ได้ถูกลบ');
    if(!restore&&removed)throw new AppError(422,'รายการนี้ถูกลบแล้ว');
    if(!restore&&(accountId===actor.id||person?.id===actor.personId))throw new AppError(422,'ไม่สามารถลบบัญชีหรือทะเบียนของผู้ดูแลที่กำลังใช้งานอยู่');
    if(!restore&&account?.role==='ADMIN'&&account.active&&account.approvedAt&&account.personId&&await tx.user.count({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null},deletedAt:null}})<=1)throw new AppError(422,'ต้องเหลือ ADMIN ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี');
    if(restore&&kind==='accounts'&&account?.person?.deletedAt)throw new AppError(422,'กรุณากู้คืนทะเบียนบุคลากรที่เชื่อมกันก่อนกู้คืนบัญชี');
    const deletedAt=restore?null:new Date();
    if(kind==='personnel')await tx.person.update({where:{id},data:{deletedAt,active:false}});
    if(accountId&&(!restore||kind==='accounts')){
      await tx.user.update({where:{id:accountId},data:{deletedAt,active:false}});
      await tx.authSession.deleteMany({where:{userId:accountId}});
      await tx.notification.updateMany({where:{userId:accountId,status:{in:['pending','failed','sending']}},data:{status:'cancelled',leaseUntil:null}});
    }
    await tx.fiscalYear.updateMany({data:{dataVersion:{increment:1}}});
    await audit(tx,actor,restore?'restore_registration':'delete_registration',kind,id,person?.id??account?.personId??undefined,undefined,{reason:input?.reason??null,preserveReports:true});
  });
}
