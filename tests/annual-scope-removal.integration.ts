import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';

async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {removeScope,updateScope,addScopes}=await import('../lib/admin-actions');
  const {reportData}=await import('../lib/reports');
  try{
    const f=await fixture();
    const scope=await testDb.annualPersonnelScope.findUniqueOrThrow({where:{fiscalYearId_personId:{fiscalYearId:f.year.id,personId:f.user.personId!}}});
    const input={reason:'Excluded for this annual assessment',confirmation:'DELETE'};
    await assert.rejects(()=>removeScope(f.user,scope.id,input),{status:403});
    await assert.rejects(()=>removeScope(f.admin,scope.id,{...input,reason:''}));
    await assert.rejects(()=>removeScope(f.admin,scope.id,{...input,confirmation:'WRONG'}));
    const before=await reportData(f.admin,{fiscalYearId:f.year.id});
    await removeScope(f.admin,scope.id,input);
    const after=await reportData(f.admin,{fiscalYearId:f.year.id});
    assert.equal(after.summary.population,before.summary.population-1);
    assert.equal(after.year.dataVersion,before.year.dataVersion+1);
    assert.deepEqual(after.rows.map(r=>r.id),before.rows.map(r=>r.id));
    assert.equal(after.kpis.find(k=>k.code==='B')!.numerator,0);
    assert.equal(await testDb.user.count({where:{id:f.user.id,active:true}}),1);
    assert.equal(await testDb.person.count({where:{id:f.user.personId!,deletedAt:null}}),1);
    await addScopes(f.admin,f.year.id);
    assert.equal((await testDb.annualPersonnelScope.findUniqueOrThrow({where:{id:scope.id}})).included,false);
    assert.equal(await testDb.auditLog.count({where:{entityId:scope.id,action:'remove_scope',actorId:f.admin.id}}),1);
    await updateScope(f.admin,scope.id,{departmentId:scope.departmentId,included:'1',basis:'Restore annual assessment'});
    assert.equal((await reportData(f.admin,{fiscalYearId:f.year.id})).summary.population,before.summary.population);
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{state:'closed'}});
    await assert.rejects(()=>removeScope(f.admin,scope.id,input),{status:422});
    assert.equal((await testDb.annualPersonnelScope.findUniqueOrThrow({where:{id:scope.id}})).included,true);
    console.log('PASS: annual removal, restoration, unchanged training/accounts, KPI population, audit, no automatic re-add, USER and closed-year guards');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Annual scope integration failed (credentials omitted)');process.exitCode=1;});
