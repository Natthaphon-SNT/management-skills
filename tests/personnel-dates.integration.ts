import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';
import {day,bangkokToday} from '../lib/calendar';
async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {savePerson}=await import('../lib/admin-actions');
  const {prisma}=await import('../lib/prisma');
  try{
    const f=await fixture();
    const input={code:'SYSTEM-START',fullName:'ทดสอบวันเริ่มใช้ระบบ',hiredOn:day(f.year.startsOn),active:'1',departmentId:f.departments[1].id};
    const id=await savePerson(f.admin,input);
    let person=await testDb.person.findUniqueOrThrow({where:{id},include:{assignments:true}});
    assert.equal(person.assignments.length,1);assert.equal(day(person.assignments[0].startsOn),input.hiredOn);
    await savePerson(f.admin,{...input,fullName:'แก้ชื่อโดยไม่กรอกวันที่เริ่มฝ่าย'},id);
    assert.equal(await testDb.personnelAssignment.count({where:{personId:id}}),1);
    await savePerson(f.admin,{...input,departmentId:f.departments[6].id,effectiveOn:''},id);
    person=await testDb.person.findUniqueOrThrow({where:{id},include:{assignments:{orderBy:{startsOn:'desc'}}}});
    assert.equal(day(person.assignments[0].startsOn),bangkokToday());assert.equal(person.assignments[0].departmentId,f.departments[6].id);
    assert.equal(day(person.hiredOn),input.hiredOn);
    console.log('PASS: first department defaults to system start, unchanged department needs no date, transfer defaults to Bangkok today, existing start preserved');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Personnel date integration failed (credentials omitted)');process.exitCode=1;});
