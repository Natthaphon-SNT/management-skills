import assert from 'node:assert/strict';
import {fixture,testDb,testUrl} from './fixtures';

async function main() {
  // fixtures enforces a separate schema ending in _test before any writes.
  process.env.DATABASE_URL=testUrl;
  process.env.DIRECT_URL=testUrl;
  const {deleteTraining,saveResult}=await import('../lib/actions');
  const {saveAccount}=await import('../lib/admin-actions');
  const {getParticipation}=await import('../lib/records');
  const {prisma}=await import('../lib/prisma');
  try {
    const f=await fixture(),id=f.participations[0].id;
    assert.equal((await getParticipation(id,f.admin)).personId,f.user.personId);
    const result=(await getParticipation(id,f.admin)).result!;
    await saveResult(f.admin,id,{explanation:'แอดมินแก้ไขรายงานที่ผู้ใช้ส่งมา',outcome:'ทดสอบสิทธิ์การแก้ไข',reportedOn:result.reportedOn.toISOString().slice(0,10),version:result.version});
    assert.equal((await testDb.applicationResult.findUniqueOrThrow({where:{participationId:id}})).reviewStatus,'pending');
    await assert.rejects(()=>deleteTraining(f.user,id,{reason:'ทดสอบ',confirmation:'DELETE'}),{status:403});
    await assert.rejects(()=>saveAccount(f.user,f.user.id,{personId:f.user.personId,role:'ADMIN',active:'1'}),{status:403});
    await assert.rejects(()=>saveAccount(f.admin,f.admin.id,{personId:f.admin.personId,role:'USER',active:'1'}));
    const pending=await testDb.user.create({data:{username:'pending_permissions',name:'Pending',passwordHash:f.user.passwordHash}});
    const scopeCount=await testDb.annualPersonnelScope.count();
    await saveAccount(f.admin,pending.id,{intent:'settings',role:'ADMIN',active:'1',email:'admin@example.invalid'});
    const updated=await testDb.user.findUniqueOrThrow({where:{id:pending.id}});
    assert.equal(updated.role,'ADMIN');assert.equal(updated.personId,null);assert.equal(updated.approvedAt,null);
    assert.equal(await testDb.annualPersonnelScope.count(),scopeCount);
    // A pending ADMIN must not count as a usable replacement for the last real admin.
    await assert.rejects(()=>saveAccount(f.admin,f.admin.id,{intent:'settings',role:'USER',active:'1'}),{status:422});
    await assert.rejects(()=>saveAccount(f.admin,pending.id,{intent:'approve',personId:f.user.personId,role:'ADMIN',active:'1'}),{status:422});
    await assert.rejects(()=>saveAccount(f.user,f.user.id,{intent:'settings',role:'ADMIN',active:'1'}),{status:403});
    await saveAccount(f.admin,f.user.id,{intent:'settings',role:'ADMIN',active:'1'});
    assert.equal((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).personId,f.user.personId);
    await saveAccount(f.admin,f.user.id,{intent:'settings',role:'USER',active:'1'});
    await saveAccount(f.admin,f.user.id,{personId:f.user.personId,role:'ADMIN',active:'1'});
    assert.equal((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).role,'ADMIN');
    await assert.rejects(()=>deleteTraining(f.admin,id,{reason:'',confirmation:'DELETE'}));
    await assert.rejects(()=>deleteTraining(f.admin,id,{reason:'ทดสอบ',confirmation:'WRONG'}));
    assert.ok(await testDb.trainingParticipation.findUnique({where:{id}}));
    await testDb.attachment.create({data:{participationId:id,originalName:'test.pdf',mime:'application/pdf',size:4,sha256:'fixture',data:Buffer.from('test'),uploadedBy:f.user.id}});
    // A shared activity must survive deleting just one person's report.
    const other=await testDb.trainingParticipation.create({data:{trainingActivityId:f.participations[0].trainingActivityId,personId:f.admin.personId!,departmentId:f.departments[0].id,status:'completed',reportDueOn:f.participations[0].reportDueOn,recordedBy:f.admin.id}});
    const version=(await testDb.fiscalYear.findUniqueOrThrow({where:{id:f.year.id}})).dataVersion;
    await deleteTraining(f.admin,id,{reason:'ข้อมูลซ้ำ',confirmation:'DELETE'});
    assert.equal(await testDb.trainingParticipation.findUnique({where:{id}}),null);
    assert.equal(await testDb.applicationResult.count({where:{participationId:id}}),0);
    assert.equal(await testDb.attachment.count({where:{participationId:id}}),0);
    assert.ok(await testDb.trainingParticipation.findUnique({where:{id:other.id}}));
    assert.ok(await testDb.trainingActivity.findUnique({where:{id:other.trainingActivityId}}));
    assert.equal((await testDb.fiscalYear.findUniqueOrThrow({where:{id:f.year.id}})).dataVersion,version+1);
    assert.equal(await testDb.auditLog.count({where:{action:'delete',entityId:id,actorId:f.admin.id}}),1);
    await deleteTraining(f.admin,other.id,{reason:'ทดสอบลบผู้เข้าร่วมสุดท้าย',confirmation:'DELETE'});
    assert.equal(await testDb.trainingActivity.findUnique({where:{id:other.trainingActivityId}}),null);
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{state:'closed'}});
    await assert.rejects(()=>deleteTraining(f.admin,f.participations[1].id,{reason:'ทดสอบปีปิด',confirmation:'DELETE'}));
    assert.ok(await testDb.trainingParticipation.findUnique({where:{id:f.participations[1].id}}));
    console.log('PASS: admin view/edit/delete, promotion, USER denial, confirmation, audit, cascade, shared activity, closed-year guard');
  } finally {await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(()=>{console.error('Admin permission integration checks failed; no credentials logged.');process.exitCode=1;});
