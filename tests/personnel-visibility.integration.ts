import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';
import {day} from '../lib/calendar';
async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {reportData}=await import('../lib/reports');
  const {savePerson,saveAccount}=await import('../lib/admin-actions');
  const {saveTraining}=await import('../lib/actions');
  const {getParticipation}=await import('../lib/records');
  try{
    const f=await fixture();
    await testDb.annualPersonnelScope.deleteMany({where:{personId:f.user.personId!}});
    const own=await reportData(f.user,{fiscalYearId:f.year.id});
    assert.equal(own.rows.length,2);assert.equal(own.scopes.length,0);assert.ok(own.kpis.every(k=>k.actual===null));
    const admin=await reportData(f.admin,{q:'พัฒนา',departmentId:f.departments[5].id});assert.equal(admin.rows.length,2);
    await testDb.annualPersonnelScope.create({data:{personId:f.user.personId!,fiscalYearId:f.year.id,departmentId:f.departments[5].id,included:false,basis:'exclude explicitly for test'}});
    assert.equal((await reportData(f.user,{})).rows.length,2);
    const excluded=await reportData(f.admin,{});assert.equal(excluded.kpis.find(k=>k.code==='B')!.numerator,0);
    const personInput={code:'NEW-TEST-PERSON',fullName:'บุคลากรใหม่ทดสอบ',hiredOn:day(f.year.startsOn),effectiveOn:day(f.year.startsOn),active:'1',departmentId:f.departments[1].id};
    const personId=await savePerson(f.admin,personInput);
    const initial=await testDb.annualPersonnelScope.findUniqueOrThrow({where:{fiscalYearId_personId:{fiscalYearId:f.year.id,personId}}});
    assert.equal(initial.departmentId,f.departments[1].id);
    // Approving an existing account also repairs its missing scope.
    await testDb.annualPersonnelScope.delete({where:{id:initial.id}});
    const account=await testDb.user.create({data:{username:'new-person',name:personInput.fullName,passwordHash:f.user.passwordHash}});
    await saveAccount(f.admin,account.id,{personId,role:'USER',active:'1'});
    assert.equal(await testDb.annualPersonnelScope.count({where:{fiscalYearId:f.year.id,personId}}),1);
    const newActor=await testDb.user.findUniqueOrThrow({where:{id:account.id}});
    const payload={personId,fiscalYearId:f.year.id,quarter:1,startsOn:f.trainingDate,endsOn:f.trainingDate,organizer:'ผู้จัดทดสอบ',title:'รายการของบุคลากรใหม่',location:'ห้องทดสอบ',category:'professional',hours:2,status:'completed'};
    const id=await saveTraining(newActor,payload);
    assert.deepEqual((await reportData(newActor,{})).rows.map(r=>r.id),[id]);
    await assert.rejects(()=>getParticipation(f.participations[0].id,newActor),{status:403});
    await assert.rejects(()=>reportData(newActor,{personId:f.user.personId}),{status:403});
    await savePerson(f.admin,{...personInput,effectiveOn:f.trainingDate,departmentId:f.departments[6].id},personId);
    assert.equal((await testDb.annualPersonnelScope.findUniqueOrThrow({where:{fiscalYearId_personId:{fiscalYearId:f.year.id,personId}}})).departmentId,f.departments[1].id);
    await saveAccount(f.admin,f.user.id,{personId:f.user.personId,role:'USER',active:'1'});
    assert.equal((await testDb.annualPersonnelScope.findUniqueOrThrow({where:{fiscalYearId_personId:{fiscalYearId:f.year.id,personId:f.user.personId!}}})).included,false);
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{state:'closed'}});
    const closedPerson=await savePerson(f.admin,{...personInput,code:'CLOSED-YEAR-PERSON'});
    assert.equal(await testDb.annualPersonnelScope.count({where:{personId:closedPerson}}),0);
    console.log('PASS: saved rows visible without scope, explicit exclusions respected by KPI, new personnel/account scopes, no IDOR, immutable department snapshots, closed years preserved');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Personnel visibility integration failed (credentials omitted)');process.exitCode=1;});
