import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';
async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {removeRegistration}=await import('../lib/registrations');
  const {adminData,createYear,saveAccount}=await import('../lib/admin-actions');
  const {reportData}=await import('../lib/reports');
  const {saveTraining}=await import('../lib/actions');
  const {prisma}=await import('../lib/prisma');
  const deletion={confirmation:'DELETE',reason:'ทดสอบลบรายการโดยเก็บรายงาน'};
  try{
    const f=await fixture();
    await testDb.user.update({where:{id:f.user.id},data:{registrationDepartmentId:f.departments[1].id}});
    let data=await adminData(f.admin);
    assert.equal(data.accounts.find(a=>a.id===f.user.id)?.registrationDepartment?.name,f.departments[1].name);
    await assert.rejects(()=>removeRegistration(f.user,'accounts',f.admin.id,deletion),{status:403});
    await assert.rejects(()=>removeRegistration(f.admin,'accounts',f.admin.id,deletion),{status:422});
    await assert.rejects(()=>removeRegistration(f.admin,'personnel',f.user.personId!,{...deletion,confirmation:'NO'}));
    await testDb.authSession.create({data:{userId:f.user.id,tokenHash:'removal-test',csrfToken:'test',expiresAt:new Date(Date.now()+60000)}});
    await removeRegistration(f.admin,'accounts',f.user.id,deletion);
    assert.equal(await testDb.authSession.count({where:{userId:f.user.id}}),0);
    assert.equal(await testDb.trainingParticipation.count(),2);
    data=await adminData(f.admin);assert.ok(!data.accounts.some(a=>a.id===f.user.id));assert.ok(data.people.some(p=>p.id===f.user.personId));
    await assert.rejects(()=>saveAccount(f.admin,f.user.id,{intent:'settings',role:'ADMIN',active:'1'}),{status:422});
    await removeRegistration(f.admin,'accounts',f.user.id,{},true);
    assert.equal((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).active,false);
    await saveAccount(f.admin,f.user.id,{intent:'settings',role:'USER',active:'1'});
    await removeRegistration(f.admin,'personnel',f.user.personId!,deletion);
    assert.ok((await testDb.person.findUniqueOrThrow({where:{id:f.user.personId!}})).deletedAt);
    assert.ok((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).deletedAt);
    const historical=await reportData(f.admin,{fiscalYearId:f.year.id});
    assert.equal(historical.rows.length,2);assert.equal(historical.summary.population,3);
    assert.ok(!historical.lookups?.people.some(p=>p.id===f.user.personId));
    await assert.rejects(()=>saveTraining(f.admin,{personId:f.user.personId,fiscalYearId:f.year.id,quarter:1,startsOn:f.trainingDate,endsOn:f.trainingDate,organizer:'ทดสอบ',title:'ไม่สร้างเพิ่มให้ทะเบียนที่ลบ',location:'ทดสอบ',category:'professional',status:'planned'}),{status:422});
    for(let offset=1;offset<=6;offset++)await createYear(f.admin,{year:f.year.year+offset});
    assert.equal(await testDb.fiscalYear.count(),7);
    assert.equal((await reportData(f.admin,{fiscalYearId:f.year.id})).rows.length,2);
    assert.equal(await testDb.annualPersonnelScope.count({where:{personId:f.user.personId!,fiscalYear:{year:{gt:f.year.year}}}}),0);
    assert.equal(await testDb.retentionPolicy.count({where:{autoDelete:true}}),0);
    await assert.rejects(()=>removeRegistration(f.admin,'accounts',f.user.id,{},true),{status:422});
    await removeRegistration(f.admin,'personnel',f.user.personId!,{},true);
    await removeRegistration(f.admin,'accounts',f.user.id,{},true);
    assert.equal((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).active,false);
    assert.equal(await testDb.auditLog.count({where:{action:'delete_registration'}}),2);
    console.log('PASS: admin-only confirmed deletion, session revocation, reversible inactive restore, report preservation, registration department, six additional fiscal years and no automatic deletion');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Registration removal integration failed (credentials omitted)');process.exitCode=1;});
