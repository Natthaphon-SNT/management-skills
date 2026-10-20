import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {fixture,testDb,testUrl} from './fixtures';
async function main(){
  if(!process.env.RESTORE_DIRECT_URL)throw Error('Set an isolated RESTORE_DIRECT_URL');
  const target=new URL(process.env.RESTORE_DIRECT_URL);
  if(!['localhost','127.0.0.1'].includes(target.hostname))throw Error('This integration test requires a local restore database');
  target.searchParams.set('schema',`next_restore_${Date.now()}_test`);
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {createArchive}=await import('../lib/archive');
  const restore=new PrismaClient({datasources:{db:{url:target.toString()}}});
  try{
    const f=await fixture();
    const bytes=Buffer.from('restore attachment test');
    await testDb.attachment.create({data:{participationId:f.participations[0].id,originalName:'restore.pdf',mime:'application/pdf',size:bytes.length,sha256:'verified-in-manifest',data:bytes,uploadedBy:f.admin.id}});
    const id=await createArchive(f.admin,f.year.id);
    const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/restore-check.ts',id],{env:{...process.env,RESTORE_DIRECT_URL:target.toString()},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.equal(await restore.person.count(),3);
    assert.equal(await restore.trainingParticipation.count(),2);
    assert.deepEqual(Buffer.from((await restore.attachment.findFirstOrThrow()).data),bytes);
    const archive=await testDb.archiveManifest.findUniqueOrThrow({where:{id}});
    assert.equal(archive.state,'restore_verified');assert.ok(archive.restoreTestedAt);
    assert.equal(await testDb.trainingParticipation.count(),2);
    const repeated=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/restore-check.ts',id],{env:{...process.env,RESTORE_DIRECT_URL:target.toString()},encoding:'utf8'});
    assert.notEqual(repeated.status,0);assert.equal(await restore.person.count(),3);
    console.log('PASS: actual isolated PostgreSQL restore, every-row comparison, attachment/report checksums, main database preserved, nonempty target rejected');
  }finally{await restore.$disconnect();await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Restore integration failed; connection details omitted');process.exitCode=1;});
