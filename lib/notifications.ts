import nodemailer from 'nodemailer';
import {prisma} from './prisma';
import {bangkokToday,day,dateOnly} from './calendar';
import {sha256} from './security';
import {purgeYear} from './retention';
import type {Tx} from './records';

export async function enqueueRegistrationNotices(tx:Tx,user:{id:string,name:string,username:string},departmentName:string,at=new Date()) {
  const today=dateOnly(bangkokToday(at));
  const year=await tx.fiscalYear.findFirst({where:{state:{not:'purged'},startsOn:{lte:today},endsOn:{gte:today}},orderBy:{year:'desc'},select:{id:true}})
    ??await tx.fiscalYear.findFirst({where:{state:{not:'purged'}},orderBy:{year:'desc'},select:{id:true}});
  if(!year)return;
  const admins=await tx.user.findMany({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null}},select:{id:true}});
  const message=`มีสมาชิกสมัครใหม่รออนุมัติ: ${user.name} (ชื่อผู้ใช้ ${user.username}) ฝ่าย ${departmentName} กรุณาตรวจสอบตัวตนและเชื่อมทะเบียนบุคลากรที่ /admin#accounts`;
  await tx.notification.createMany({data:admins.flatMap(admin=>['in_app','email'].map(channel=>({
    fiscalYearId:year.id,userId:admin.id,idempotencyKey:`registration:${user.id}:${admin.id}:${channel}`,
    channel,message,status:channel==='in_app'?'sent':'pending',sentAt:channel==='in_app'?at:null,
  }))),skipDuplicates:true});
}

export async function enqueueTrainingReminders(at=new Date(),dryRun=false) {
  const today=bangkokToday(at),tomorrow=day(new Date(+dateOnly(today)+86400000));
  const [records,admins]=await Promise.all([
    prisma.trainingParticipation.findMany({where:{status:{not:'cancelled'},result:null,reportDueOn:{lte:dateOnly(tomorrow)},activity:{endsOn:{lte:dateOnly(today)},fiscalYear:{state:{not:'purged'}}}},select:{id:true,reportDueOn:true,person:{select:{fullName:true}},activity:{select:{title:true,fiscalYearId:true}}}}),
    prisma.user.findMany({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null}},select:{id:true}}),
  ]);
  const actions=records.flatMap(record=>{
    const due=day(record.reportDueOn),timing=due<today?'เกินกำหนดแล้ว':due===today?'ครบกำหนดวันนี้':'เหลือ 1 วันก่อนครบกำหนด';
    const message=`${timing}: ${record.person.fullName} ยังไม่กรอกผลการนำไปใช้ — ${record.activity.title} กำหนดส่ง ${due} ภายใน 3 วันหลังสิ้นสุดการอบรม กรุณาติดตามให้กรอกผลก่อนเกินกำหนด /trainings/${record.id}`;
    return admins.flatMap(admin=>['in_app','email'].map(channel=>({fiscalYearId:record.activity.fiscalYearId,idempotencyKey:`training-result:${record.id}:${due}:${today}:${admin.id}:${channel}`,userId:admin.id,channel,message,status:channel==='in_app'?'sent':'pending',sentAt:channel==='in_app'?at:null})));
  });
  if(!dryRun&&actions.length)await prisma.notification.createMany({data:actions,skipDuplicates:true});
  return {count:records.length,actions};
}

export async function enqueueNotices(at=new Date(),dryRun=false) {
  const today=bangkokToday(at),actions:{yearId:string,key:string,channel:string,userId:string|null,message:string}[]=[];
  const [years,admins]=await Promise.all([prisma.fiscalYear.findMany({where:{state:{not:'purged'}},include:{retention:true,_count:{select:{activities:true}}}}),prisma.user.findMany({where:{role:'ADMIN',active:true,approvedAt:{not:null},personId:{not:null}},select:{id:true}})]);
  for(const year of years) {
    const days=Math.round((+year.endsOn-+dateOnly(today))/86400000),noticeDays=(year.retention?.noticeDays??[30,7,1]) as number[];
    if(!noticeDays.includes(days))continue;
    const message=`ปีงบประมาณ ${year.year} สิ้นสุด ${day(year.endsOn)} เวลา 23:59:59 Asia/Bangkok เหลือ ${days} วัน มี ${year._count.activities} กิจกรรม กรุณาตรวจรายงาน ปิดปี สำรอง และทดสอบกู้คืน การสิ้นปีไม่ใช่คำสั่งลบข้อมูล`;
    if(!admins.length)actions.push({yearId:year.id,key:`no-admin:${year.id}:${days}`,channel:'system',userId:null,message});
    for(const admin of admins)for(const channel of ['in_app','email'])actions.push({yearId:year.id,key:`${year.id}:${days}:${admin.id}:${channel}`,channel,userId:admin.id,message});
  }
  if(!dryRun)await prisma.notification.createMany({data:actions.map(a=>({fiscalYearId:a.yearId,idempotencyKey:a.key,channel:a.channel,userId:a.userId,message:a.message,status:a.channel==='system'?'failed':'pending',error:a.channel==='system'?'ไม่มี ADMIN รับผิดชอบ ห้ามดำเนินการลบ':null})),skipDuplicates:true});
  return actions;
}
export async function processNotices(deadline=performance.now()+6500,keyPrefix?:string) {
  const notices=await prisma.notification.findMany({where:{...(keyPrefix?{idempotencyKey:{startsWith:keyPrefix}}:{}),channel:{in:['in_app','email']},status:{in:['pending','failed','sending']},attempts:{lt:10},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},include:{user:{select:{id:true,role:true,active:true,approvedAt:true,email:true}}},orderBy:{createdAt:'asc'},take:20});
  let processed=0;
  for(const notice of notices) {
    if(performance.now()>deadline)break;
    if(notice.idempotencyKey.startsWith('registration:')) {
      const account=await prisma.user.findUnique({where:{id:notice.idempotencyKey.split(':')[1]},select:{approvedAt:true,active:true}});
      if(!account||account.approvedAt||!account.active){await prisma.notification.update({where:{id:notice.id},data:{status:'cancelled',leaseUntil:null}});continue;}
    }
    if(notice.idempotencyKey.startsWith('training-result:')) {
      const [,id,due]=notice.idempotencyKey.split(':');
      const record=await prisma.trainingParticipation.findUnique({where:{id},select:{status:true,reportDueOn:true,result:{select:{id:true}}}});
      if(!record||record.result||record.status==='cancelled'||day(record.reportDueOn)!==due){await prisma.notification.update({where:{id:notice.id},data:{status:'cancelled',leaseUntil:null}});continue;}
    }
    const lease=await prisma.notification.updateMany({where:{id:notice.id,status:{not:'sent'},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{leaseUntil:new Date(Date.now()+30000),status:'sending',attempts:{increment:1}}});
    if(!lease.count)continue;
    try {
      if(!notice.user?.active||!notice.user.approvedAt||notice.user.role!=='ADMIN')throw new Error('ผู้รับไม่ใช่ ADMIN ที่ใช้งานอยู่');
      if(notice.channel==='email') {
        if(!notice.user.email||!process.env.SMTP_URL||!process.env.MAIL_FROM)throw new Error('ยังไม่ได้กำหนดอีเมล ADMIN หรือ SMTP/MAIL_FROM');
        const transport=nodemailer.createTransport({url:process.env.SMTP_URL,connectionTimeout:2000,greetingTimeout:2000,socketTimeout:2500});
        const origin=process.env.APP_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:'');
        const text=notice.message+(origin?`\n\nเปิดระบบ: ${origin.replace(/\/$/,'')}${notice.idempotencyKey.startsWith('registration:')?'/admin#accounts':'/admin/notices'}`:'');
        const subject=notice.idempotencyKey.startsWith('registration:')?'สมาชิกใหม่รออนุมัติ กองคลัง':notice.idempotencyKey.startsWith('training-result:')?'แจ้งเตือนกำหนดรายงานผลอบรม กองคลัง':'แจ้งเตือนข้อมูลรายปี กองคลัง';
        try {await transport.sendMail({from:process.env.MAIL_FROM,to:notice.user.email,subject,text,messageId:`<${sha256(notice.idempotencyKey)}@management-skills.local>`});}finally{transport.close();}
      }
      await prisma.notification.update({where:{id:notice.id},data:{status:'sent',sentAt:new Date(),error:null,leaseUntil:null}});
    }catch(error) {
      const message=error instanceof Error&&/ADMIN|SMTP/.test(error.message)?error.message:'ส่งอีเมลไม่สำเร็จ กรุณาตรวจผู้ให้บริการ SMTP';
      await prisma.notification.update({where:{id:notice.id},data:{status:'failed',error:message,leaseUntil:null}});
    }processed++;
  }return processed;
}
export async function runScheduledWork() {
  const started=performance.now();await enqueueNotices();await enqueueTrainingReminders();const notices=await processNotices(started+6000);
  await prisma.authSession.deleteMany({where:{expiresAt:{lt:new Date()}}});await prisma.rateLimit.deleteMany({where:{resetAt:{lt:new Date()}}});await prisma.pendingUpload.deleteMany({where:{expiresAt:{lt:new Date()}}});
  if(process.env.RETENTION_ENABLED==='true'&&performance.now()-started<6500) {
    const policies=await prisma.retentionPolicy.findMany({where:{autoDelete:true,legalHold:false},select:{fiscalYearId:true}});
    for(const policy of policies) {if(performance.now()-started>7000)break;const preview=await purgeYear(null,policy.fiscalYearId,new Date(),true);if(preview.ready)await purgeYear(null,policy.fiscalYearId,new Date(),false);}
  }
  return {notices};
}
