import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {fiscalBounds,identifyFiscal,bangkokToday,dateOnly} from '../lib/calendar';
const db=new PrismaClient();
async function main() {
  const password=process.env.ADMIN_INITIAL_PASSWORD;
  if(!password || password.length<12) throw new Error('ADMIN_INITIAL_PASSWORD ต้องมีอย่างน้อย 12 ตัวอักษร');
  await db.$transaction(async tx=> {
    const names=['ผู้อำนวยการ','บริหารงานทั่วไป','พัสดุ','ตรวจสอบและเบิกจ่าย 1','ตรวจสอบและเบิกจ่าย 2','บัญชี','การเงิน'];
    for(const name of names) await tx.department.upsert({where:{name},update:{},create:{name}});
    const department=await tx.department.findUniqueOrThrow({where:{name:'ผู้อำนวยการ'}});
    const person=await tx.person.upsert({where:{code:'ADMIN-INITIAL'},update:{},create:{code:'ADMIN-INITIAL',fullName:'ผู้ดูแลระบบ (โปรดแก้ข้อมูลทะเบียน)',hiredOn:dateOnly(bangkokToday())}});
    const existingAssignment=await tx.personnelAssignment.findFirst({where:{personId:person.id}});
    if(!existingAssignment) await tx.personnelAssignment.create({data:{personId:person.id,departmentId:department.id,startsOn:person.hiredOn}});
    const passwordHash=await bcrypt.hash(password,12);
    await tx.user.upsert({where:{username:'admin'},update:{},create:{username:'admin',name:'ผู้ดูแลระบบ',personId:person.id,passwordHash,role:'ADMIN',approvedAt:new Date()}});
    for(const yearNumber of new Set([2569,identifyFiscal(bangkokToday()).year])) {
      const bounds=fiscalBounds(yearNumber);
      const year=await tx.fiscalYear.upsert({where:{year:yearNumber},update:{},create:{year:yearNumber,startsOn:dateOnly(bounds.start),endsOn:dateOnly(bounds.end)}});
      await tx.retentionPolicy.upsert({where:{fiscalYearId:year.id},update:{},create:{fiscalYearId:year.id}});
      if(person.hiredOn<=year.endsOn) await tx.annualPersonnelScope.upsert({where:{fiscalYearId_personId:{fiscalYearId:year.id,personId:person.id}},update:{},create:{fiscalYearId:year.id,personId:person.id,departmentId:department.id,basis:'บัญชีผู้ดูแลเริ่มต้น ต้องตรวจทะเบียนจริงก่อนประเมิน'}});
    }
  },{timeout:15000});
  console.log('Seed สำเร็จ: 7 ฝ่าย ปีงบประมาณ และ admin; การรันซ้ำไม่เปลี่ยนรหัสผ่านเดิม');
}
main().catch(()=>{console.error('Seed ไม่สำเร็จ ตรวจ environment และฐานข้อมูล (ไม่แสดง secret)');process.exitCode=1;}).finally(()=>db.$disconnect());
