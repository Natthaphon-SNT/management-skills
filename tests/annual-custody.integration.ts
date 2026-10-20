import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fixture,testDb,testUrl} from './fixtures';
import {day,dateOnly,fiscalBounds} from '../lib/calendar';

async function main(){
  if(!process.env.RESTORE_DIRECT_URL)throw new Error('Requires isolated local restore database');
  const target=new URL(process.env.RESTORE_DIRECT_URL);
  if(!['localhost','127.0.0.1'].includes(target.hostname))throw new Error('Local restore database required');
  target.searchParams.set('schema',`custody_restore_${Date.now()}_test`);
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {createArchive}=await import('../lib/archive');
  const {audit}=await import('../lib/records');
  const {retentionPreview,savePolicy,changeYearState,receiveArchive,approveDeletion,purgeYear,releaseArchive,externalStorage}=await import('../lib/retention');
  try{
    const f=await fixture();
    const file=Buffer.from('Synthetic annual attachment');
    await testDb.attachment.create({data:{participationId:f.participations[0].id,originalName:'annual.pdf',mime:'application/pdf',size:file.length,sha256:'fixture',data:file,uploadedBy:f.admin.id}});
    const nextBounds=fiscalBounds(f.year.year+1);
    const next=await testDb.fiscalYear.create({data:{year:f.year.year+1,startsOn:dateOnly(nextBounds.start),endsOn:dateOnly(nextBounds.end)}});
    const later=await testDb.trainingActivity.create({data:{fiscalYearId:next.id,quarter:1,startsOn:dateOnly(nextBounds.start),endsOn:dateOnly(nextBounds.start),organizer:'Synthetic',category:'professional',title:'Next year preserved',location:'Test',createdBy:f.admin.id}});
    const future=new Date(Date.UTC(f.year.endsOn.getUTCFullYear()+2,0,1));
    await assert.rejects(()=>purgeYear(null,f.year.id,future,false),{status:403});
    await assert.rejects(()=>purgeYear(f.user,f.year.id,future,false),{status:403});
    await changeYearState(f.admin,f.year.id,{state:'closed'});
    await savePolicy(f.admin,f.year.id,{plans:day(f.year.endsOn),training:day(f.year.endsOn),results:day(f.year.endsOn),attachments:day(f.year.endsOn),graceDays:0,noticeDays:'30,7,1',legalHold:'0',autoDelete:'1',backupRetentionDays:365,archiveRetentionDays:1825,policyReference:'Synthetic annual custody policy'});
    assert.equal((await testDb.retentionPolicy.findUniqueOrThrow({where:{fiscalYearId:f.year.id}})).autoDelete,false);
    const id=await createArchive(f.admin,f.year.id);
    assert.equal((await retentionPreview(f.year.id,future)).ready,false);
    await assert.rejects(()=>receiveArchive(f.admin,id,{storageLocation:'Unit archive / FY / backup.zip'}),{status:422});
    const restored=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/restore-check.ts',id],{env:{...process.env,RESTORE_DIRECT_URL:target.toString()},encoding:'utf8'});
    assert.equal(restored.status,0,restored.stderr||restored.stdout);
    // Tested restore is insufficient without this admin's download and external receipt.
    await assert.rejects(()=>receiveArchive(f.admin,id,{storageLocation:'Unit archive / FY / backup.zip'}),{status:422});
    await audit(prisma,f.admin,'download_archive','archive_manifests',id,undefined,f.year.id);
    await assert.rejects(()=>receiveArchive(f.admin,id,{storageLocation:''}));
    await assert.rejects(()=>receiveArchive(f.user,id,{storageLocation:'Unit archive / FY / backup.zip'}),{status:403});
    await receiveArchive(f.admin,id,{storageLocation:'Unit archive / FY / backup.zip'});
    assert.equal(externalStorage((await testDb.archiveManifest.findUniqueOrThrow({where:{id}})).restoreEvidence)?.location,'Unit archive / FY / backup.zip');
    await assert.rejects(()=>releaseArchive(f.admin,id,{confirmation:'REMOVE',reason:'Free space'}),{status:422});
    await approveDeletion(f.admin,id,'Data and reports stored externally by admin');
    const ready=await retentionPreview(f.year.id,future);
    assert.equal(ready.ready,true,ready.reasons.join(' / '));
    assert.equal(ready.payloadBytes.attachments,file.length);assert.ok(ready.payloadBytes.backups>0);
    // Changed data invalidates the current backup approval.
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{dataVersion:{increment:1}}});
    await assert.rejects(()=>purgeYear(f.admin,f.year.id,future,false),{status:422});
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{dataVersion:ready.year.dataVersion}});
    await purgeYear(f.admin,f.year.id,future,false);
    assert.equal(await testDb.trainingParticipation.count({where:{activity:{fiscalYearId:f.year.id}}}),0);
    assert.equal(await testDb.attachment.count(),0);
    assert.ok(await testDb.trainingActivity.findUnique({where:{id:later.id}}));
    assert.equal(await testDb.person.count(),3);assert.equal(await testDb.user.count(),2);
    assert.ok((await testDb.archiveManifest.findUniqueOrThrow({where:{id}})).data);
    await assert.rejects(()=>releaseArchive(f.user,id,{confirmation:'REMOVE',reason:'Free space'}),{status:403});
    await assert.rejects(()=>releaseArchive(f.admin,id,{confirmation:'WRONG',reason:'Free space'}));
    await releaseArchive(f.admin,id,{confirmation:'REMOVE',reason:'Confirmed full external custody; free database space'});
    const released=await testDb.archiveManifest.findUniqueOrThrow({where:{id}});
    assert.equal(released.data,null);assert.equal(released.state,'external_only');assert.ok(released.sha256);
    assert.equal(externalStorage(released.restoreEvidence)?.location,'Unit archive / FY / backup.zip');
    assert.equal((await retentionPreview(f.year.id,future)).payloadBytes.backups,0);
    assert.equal(await testDb.auditLog.count({where:{action:'release_archive_copy',entityId:id,actorId:f.admin.id}}),1);
    console.log('PASS: actual isolated restore; mandatory download and external location; admin-only purge/release; stale backup guards; current-year attachments and ZIP freed; other year, personnel, custody evidence and checksum preserved');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Annual custody integration failed (credentials omitted)');process.exitCode=1;});
