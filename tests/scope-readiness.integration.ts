import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';
import {day,dateOnly} from '../lib/calendar';
async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {addScopes,savePerson}=await import('../lib/admin-actions');
  try{
    const f=await fixture();
    await testDb.annualPersonnelScope.updateMany({where:{personId:f.persons[2].id},data:{included:false}});
    const missing=await testDb.person.create({data:{code:'UNASSIGNED',fullName:'Missing department',hiredOn:f.year.startsOn}});
    const ready=await testDb.person.create({data:{code:'READY',fullName:'Ready without training',hiredOn:f.year.startsOn,assignments:{create:{departmentId:f.departments[5].id,startsOn:f.year.startsOn}}}});
    await testDb.person.create({data:{code:'FUTURE',fullName:'Not in this year',hiredOn:new Date(+f.year.endsOn+86400000)}});
    const expired=await testDb.person.create({data:{code:'EXPIRED',fullName:'Assignment outside year',hiredOn:new Date(+f.year.startsOn-86400000),assignments:{create:{departmentId:f.departments[1].id,startsOn:new Date(+f.year.startsOn-86400000),endsOn:new Date(+f.year.startsOn-86400000)}}}});
    await assert.rejects(()=>addScopes(f.user,f.year.id),{status:403});
    const result=await addScopes(f.admin,f.year.id);
    assert.equal(result.added,1);assert.equal(result.existing,3);assert.equal(result.excluded,1);
    assert.deepEqual(new Set(result.missingDepartment.map(p=>p.id)),new Set([missing.id,expired.id]));
    assert.equal(await testDb.trainingParticipation.count({where:{personId:ready.id}}),0);
    assert.equal(await testDb.annualPersonnelScope.count({where:{personId:ready.id}}),1);
    assert.equal((await testDb.annualPersonnelScope.findFirstOrThrow({where:{personId:f.persons[2].id}})).included,false);
    const version=(await testDb.fiscalYear.findUniqueOrThrow({where:{id:f.year.id}})).dataVersion;
    const again=await addScopes(f.admin,f.year.id);assert.equal(again.added,0);
    assert.ok(again.message.includes('0')&&again.message.includes('2'));
    assert.equal((await testDb.fiscalYear.findUniqueOrThrow({where:{id:f.year.id}})).dataVersion,version);
    await savePerson(f.admin,{code:missing.code,fullName:missing.fullName,hiredOn:day(missing.hiredOn),departmentId:f.departments[1].id,active:'1'},missing.id);
    assert.equal(await testDb.annualPersonnelScope.count({where:{personId:missing.id}}),1);
    assert.equal((await addScopes(f.admin,f.year.id)).missingDepartment.length,1);
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{state:'closed'}});
    await assert.rejects(()=>addScopes(f.admin,f.year.id),{status:422});
    console.log('PASS: zero-add reports missing departments, no training prerequisite, respects removed scopes and assignment dates, no-op preserves version, saving department fixes missing base, USER/closed-year guards');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Scope readiness integration failed (credentials omitted)');process.exitCode=1;});
