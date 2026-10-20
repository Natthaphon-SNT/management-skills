import {PASSWORD_MIN_LENGTH} from '../lib/password-policy';
import 'dotenv/config';
import {PrismaClient,Prisma} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {bangkokToday,identifyFiscal,fiscalBounds,dateOnly,day} from '../lib/calendar';
export const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl)throw new Error('กำหนด TEST_DATABASE_URL เป็นฐาน/schema ทดสอบแยกก่อนรัน E2E');
const url=new URL(testUrl),schema=url.searchParams.get('schema')??'public';
if(!schema.endsWith('_test')||testUrl===process.env.DATABASE_URL)throw new Error('E2E ต้องใช้ schema ลงท้าย _test และแยกจากฐานแอป');
if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))throw new Error('Invalid test schema');
export const testDb=new PrismaClient({datasources:{db:{url:testUrl}}});
export const testPassword=process.env.ADMIN_INITIAL_PASSWORD!;
if(!testPassword||testPassword.length<PASSWORD_MIN_LENGTH)throw new Error('ต้องมีรหัสผ่านทดสอบจาก ADMIN_INITIAL_PASSWORD');
export async function fixture() {
  const tables=Prisma.dmmf.datamodel.models.map(m=>`"${schema}"."${m.dbName??m.name}"`).join(',');
  await testDb.$executeRawUnsafe('TRUNCATE '+tables+' CASCADE');
  const yearNumber=identifyFiscal(bangkokToday()).year,bounds=fiscalBounds(yearNumber),passwordHash=await bcrypt.hash(testPassword,4);
  const departments=[];for(const name of ['ผู้อำนวยการ','บริหารงานทั่วไป','พัสดุ','ตรวจสอบและเบิกจ่าย 1','ตรวจสอบและเบิกจ่าย 2','บัญชี','การเงิน'])departments.push(await testDb.department.create({data:{name}}));
  const year=await testDb.fiscalYear.create({data:{year:yearNumber,startsOn:dateOnly(bounds.start),endsOn:dateOnly(bounds.end),retention:{create:{}}}});
  const persons=[];for(const [code,fullName,index] of [['TEST-ADMIN','ผู้ดูแล สมมติ',0],['TEST-USER','พัฒนา สมมติ',5],['TEST-NO-LOGIN','เรียนรู้ สมมติ',6]] as const) {
    const person=await testDb.person.create({data:{code,fullName,personnelType:'ข้อมูลสมมติสำหรับทดสอบ',position:'เจ้าหน้าที่สมมติ',hiredOn:dateOnly(bounds.start),assignments:{create:{departmentId:departments[index].id,startsOn:dateOnly(bounds.start)}},scopes:{create:{fiscalYearId:year.id,departmentId:departments[index].id,basis:'ชุดข้อมูลสมมติสำหรับตรวจสูตร'}}}});persons.push(person);
  }
  const admin=await testDb.user.create({data:{username:'admin',name:persons[0].fullName,passwordHash,role:'ADMIN',approvedAt:new Date(),personId:persons[0].id}});
  const user=await testDb.user.create({data:{username:'tester',name:persons[1].fullName,passwordHash,approvedAt:new Date(),personId:persons[1].id}});
  const strategy=await testDb.strategy.create({data:{id:'rmutt-strategy-4',name:'ยุทธศาสตร์ที่ 4',level:'institution'}});
  const plan=await testDb.developmentPlan.create({data:{personId:persons[1].id,fiscalYearId:year.id,title:'แผนสมมติ',status:'approved',createdBy:admin.id}});
  const items=[];for(const topic of ['AI Skills for All','Microsoft 365'])items.push(await testDb.planItem.create({data:{developmentPlanId:plan.id,category:'training',topic,plannedApplication:'ข้อความในแผน ยังไม่ใช่ผลจริง',schedules:{create:{fiscalYearId:year.id,quarter:1}}}}));
  const participations=[];
  for(const [index,hours] of [6,4].entries()) {
    const startsOn=new Date(+dateOnly(bounds.start)+(5+index)*86400000),due=new Date(+startsOn+7*86400000);
    const activity=await testDb.trainingActivity.create({data:{fiscalYearId:year.id,quarter:1,startsOn,endsOn:startsOn,organizer:'หน่วยงานสมมติ',category:'professional',title:'กิจกรรมสมมติ '+(index+1),location:'ห้องอบรมสมมติ',hours,strategyId:strategy.id,createdBy:admin.id}});
    const part=await testDb.trainingParticipation.create({data:{trainingActivityId:activity.id,personId:user.personId!,departmentId:departments[5].id,planItemId:items[0].id,status:'completed',reportDueOn:due,recordedBy:admin.id,...(index===0?{result:{create:{explanation:'นำความรู้ไปสรุปเอกสารสมมติ',outcome:'ตัวอย่างผลลัพธ์สำหรับตรวจสูตร',reportedOn:startsOn,reviewStatus:'verified',recordedBy:admin.id,reviews:{create:{resultVersion:1,reviewerId:admin.id,decision:'verified',comment:'ผ่านการตรวจสมมติ'}}}}}:{})}});participations.push(part);
  }
  return {admin,user,persons,departments,year,strategy,plan,items,participations,trainingDate:day(new Date(+dateOnly(bounds.start)+9*86400000))};
}
