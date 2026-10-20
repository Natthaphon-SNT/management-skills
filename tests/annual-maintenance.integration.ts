import assert from 'node:assert/strict';
import net from 'node:net';
import JSZip from 'jszip';
import {fixture,testDb,testUrl} from './fixtures';
import {sha256} from '../lib/security';

async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {prisma}=await import('../lib/prisma');
  const {storageUsage,enqueueStorageWarnings,createAnnualReport,removeAnnualReport}=await import('../lib/annual-maintenance');
  const {processNotices}=await import('../lib/notifications');
  const {audit}=await import('../lib/records');
  const messages:string[]=[];
  const server=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost SMTP\r\n');let input='',data=false,body='';
    socket.on('data',chunk=>{input+=chunk;while(input.includes('\r\n')){const end=input.indexOf('\r\n'),line=input.slice(0,end);input=input.slice(end+2);
      if(data){if(line==='.') {data=false;messages.push(body);body='';socket.write('250 accepted\r\n');}else body+=line+'\r\n';continue;}
      if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}else if(line==='QUIT')socket.end('221 bye\r\n');else socket.write('250 OK\r\n');
    }});socket.on('error',()=>{});
  });
  try{
    const f=await fixture();
    await testDb.user.update({where:{id:f.admin.id},data:{email:'first@example.invalid'}});
    await testDb.user.create({data:{username:'second-admin',name:'Second',passwordHash:f.admin.passwordHash,role:'ADMIN',active:true,approvedAt:new Date(),personId:f.persons[2].id,email:'second@example.invalid'}});
    const raw=await storageUsage();assert.ok(raw.usedBytes>0);assert.equal(raw.limitBytes,1_000_000_000);
    process.env.DATABASE_STORAGE_LIMIT_MB=String(raw.usedBytes/1_000_000/.85);
    const warning=await storageUsage();assert.ok(warning.percent>=80&&warning.percent<90);
    await enqueueStorageWarnings(warning);await enqueueStorageWarnings(warning);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:'storage-warning:80:'}}}),4);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.SMTP_URL=`smtp://127.0.0.1:${(server.address() as net.AddressInfo).port}/?ignoreTLS=true`;process.env.MAIL_FROM='sender@example.invalid';
    await processNotices(performance.now()+4000,'storage-warning:');assert.equal(messages.length,2);
    assert.ok(messages.some(m=>m.includes('first@example.invalid'))&&messages.some(m=>m.includes('second@example.invalid')));
    process.env.DATABASE_STORAGE_LIMIT_MB=String(raw.usedBytes/1_000_000/.95);
    await enqueueStorageWarnings(await storageUsage());
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:'storage-warning:90:'}}}),4);
    process.env.DATABASE_STORAGE_LIMIT_MB='1000';
    await processNotices(performance.now()+4000,'storage-warning:90:');
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:'storage-warning:90:'},channel:'email',status:'cancelled'}}),2);
    const safe=await storageUsage(),afterEnd=new Date(+f.year.endsOn+86400000);
    assert.equal((await createAnnualReport(new Date(),safe)).status,'up_to_date');
    assert.equal((await createAnnualReport(afterEnd,{...safe,percent:91})).status,'paused_storage');
    const results=await Promise.all([createAnnualReport(afterEnd,safe),createAnnualReport(afterEnd,safe)]);
    assert.equal(results.filter(r=>r.status==='completed').length,1);
    const job=await testDb.exportJob.findFirstOrThrow({where:{kind:'annual_zip'}});assert.ok(job.data);assert.equal(job.sha256,sha256(job.data!));
    const zip=await JSZip.loadAsync(job.data!);assert.ok(zip.file('reports/normal.xlsx'));assert.ok(zip.file('reports/dashboard.xlsx'));assert.equal(zip.file('database.json'),null);
    const manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));assert.equal(manifest.rowCount,2);assert.equal(manifest.year,f.year.year);
    assert.equal(await testDb.exportJob.count({where:{kind:'annual_zip'}}),1);
    await processNotices(performance.now()+4000,'annual-report-ready:');
    assert.equal(messages.length,4);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:'annual-report-ready:'},channel:'email',status:'sent'}}),2);
    await assert.rejects(()=>removeAnnualReport(f.user,job.id,{confirmation:'DELETE',storageLocation:'External copy'}),{status:403});
    await assert.rejects(()=>removeAnnualReport(f.admin,job.id,{confirmation:'DELETE',storageLocation:'External copy'}),{status:422});
    await audit(prisma,f.admin,'download_annual_report','export_jobs',job.id,undefined,f.year.id);
    await removeAnnualReport(f.admin,job.id,{confirmation:'DELETE',storageLocation:'Unit drive / reports.zip'});
    assert.equal((await testDb.exportJob.findUniqueOrThrow({where:{id:job.id}})).data,null);
    assert.equal((await createAnnualReport(afterEnd,safe)).status,'up_to_date');
    await testDb.fiscalYear.update({where:{id:f.year.id},data:{dataVersion:{increment:1}}});
    assert.equal((await createAnnualReport(afterEnd,safe)).status,'completed');
    assert.equal(await testDb.exportJob.count({where:{kind:'annual_zip'}}),2);
    assert.equal(await testDb.trainingParticipation.count(),2);
    console.log('PASS: measured storage; 80/90 weekly dedup; real local SMTP to multiple admins; recovered warnings cancelled; annual date/space gates; concurrent ZIP dedup; manifest/XLSX integrity; manual deletion and no regeneration; new data creates new version (no external emails sent)');
  }finally{server.close();await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Annual maintenance integration failed (credentials omitted)');process.exitCode=1;});
