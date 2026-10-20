import assert from 'node:assert/strict';
import net from 'node:net';
import {fixture,testDb,testUrl,testPassword} from './fixtures';

async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  delete process.env.SMTP_URL;delete process.env.MAIL_FROM;
  const {register}=await import('../lib/actions');
  const {enqueueRegistrationNotices,processNotices,queueAdminEmailTest,retryAdminEmail}=await import('../lib/notifications');
  const {prisma}=await import('../lib/prisma');
  const messages:string[]=[];
  let reject=false,stall=false,stallRecipient='';
  const server=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
    let input='',data=false,body='',recipient='';
    socket.on('data',chunk=>{
      input+=chunk;
      while(input.includes('\r\n')){
        const end=input.indexOf('\r\n'),line=input.slice(0,end);input=input.slice(end+2);
        if(data){if(line==='.') {data=false;if(!stall&&recipient!==stallRecipient){if(!reject)messages.push(body);socket.write(reject?'550 rejected for test\r\n':'250 accepted\r\n');}body='';}else body+=line+'\r\n';continue;}
        if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');
        else if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]??'';socket.write('250 OK\r\n');}
        else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}
        else if(line==='QUIT'){socket.end('221 bye\r\n');}
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error',()=>{});
  });
  try{
    const f=await fixture();
    await testDb.user.update({where:{id:f.admin.id},data:{email:'admin@example.invalid'}});
    await testDb.user.create({data:{username:'inactive_admin',name:'Inactive',passwordHash:f.admin.passwordHash,role:'ADMIN',active:false,approvedAt:new Date()}});
    const data={name:'สมาชิกทดสอบ',username:'signup_notice',departmentId:f.departments[5].id,password:testPassword,passwordConfirmation:testPassword};
    assert.ok((await register(data,'127.0.0.9')).startsWith('/login?success='));
    const user=await testDb.user.findUniqueOrThrow({where:{username:data.username}});
    assert.equal(user.role,'USER');assert.equal(user.approvedAt,null);assert.equal(user.personId,null);
    let notices=await testDb.notification.findMany({where:{idempotencyKey:{startsWith:`registration:${user.id}:`}}});
    assert.equal(notices.length,2);assert.ok(notices.every(n=>n.userId===f.admin.id));
    assert.equal(notices.find(n=>n.channel==='in_app')!.status,'sent');
    assert.equal(notices.find(n=>n.channel==='email')!.status,'pending');
    assert.ok(notices.every(n=>!n.message.includes(testPassword)&&!n.message.includes(user.passwordHash)));
    await testDb.$transaction(tx=>enqueueRegistrationNotices(tx,user,f.departments[5].name));
    assert.equal(await testDb.notification.count(),2);
    await processNotices(performance.now()+4000,'registration:');
    assert.equal((await testDb.notification.findFirstOrThrow({where:{channel:'email'}})).status,'failed');
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address() as net.AddressInfo;
    process.env.SMTP_URL=`smtp://127.0.0.1:${address.port}/?ignoreTLS=true`;
    process.env.MAIL_FROM='sender@example.invalid';process.env.APP_URL='https://example.invalid';
    reject=true;await processNotices(performance.now()+4000,'registration:');
    assert.equal((await testDb.notification.findFirstOrThrow({where:{channel:'email'}})).status,'failed');assert.equal(messages.length,0);
    reject=false;await processNotices(performance.now()+4000,'registration:');
    const sent=await testDb.notification.findFirstOrThrow({where:{channel:'email'}});
    assert.equal(sent.status,'sent');assert.ok(sent.sentAt);assert.equal(messages.length,1);
    assert.ok(messages[0].includes('Subject:'));assert.ok(messages[0].includes('admin@example.invalid'));
    assert.ok(!messages[0].includes(testPassword));
    await processNotices(performance.now()+4000,'registration:');assert.equal(messages.length,1);
    await register({...data,username:'already_approved'},'127.0.0.10');
    const second=await testDb.user.findUniqueOrThrow({where:{username:'already_approved'}});
    await testDb.user.update({where:{id:second.id},data:{approvedAt:new Date()}});
    await processNotices(performance.now()+4000,'registration:');
    assert.equal((await testDb.notification.findFirstOrThrow({where:{idempotencyKey:{startsWith:`registration:${second.id}:`},channel:'email'}})).status,'cancelled');
    assert.equal(messages.length,1);
    // Each admin has a separate recipient. A missing address must not block the other admin.
    await testDb.user.update({where:{id:f.user.id},data:{role:'ADMIN'}});
    await register({...data,username:'multiple_admins'},'127.0.0.11');
    const third=await testDb.user.findUniqueOrThrow({where:{username:'multiple_admins'}});
    const prefix=`registration:${third.id}:`;
    await processNotices(performance.now()+5000,prefix);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:prefix},channel:'email',status:'sent'}}),1);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:prefix},channel:'email',status:'failed'}}),1);
    await testDb.user.update({where:{id:f.user.id},data:{email:'second@example.invalid'}});
    const beforeRetry=messages.length;await retryAdminEmail(f.user.id);
    assert.equal(messages.length,beforeRetry+1);assert.ok(messages.at(-1)!.includes('second@example.invalid'));
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:prefix},channel:'email',status:'sent'}}),2);
    await assert.rejects(()=>queueAdminEmailTest(f.user,f.admin.id),{status:403});
    await assert.rejects(()=>queueAdminEmailTest(f.admin,third.id),{status:422});
    const testKey=await queueAdminEmailTest(f.admin,f.user.id);
    await processNotices(performance.now()+4000,testKey);
    assert.equal((await testDb.notification.findUniqueOrThrow({where:{idempotencyKey:testKey}})).status,'sent');
    const slowKey=await queueAdminEmailTest(f.admin,f.user.id);stall=true;
    const started=performance.now();await processNotices(started+1100,slowKey);
    const slow=await testDb.notification.findUniqueOrThrow({where:{idempotencyKey:slowKey}});
    assert.equal(slow.status,'failed');assert.ok(slow.error?.includes('SMTP ตอบช้า'));assert.ok(performance.now()-started<2000);
    stall=false;
    await testDb.notification.update({where:{idempotencyKey:slowKey},data:{status:'cancelled'}});
    const slowAdmin=await queueAdminEmailTest(f.admin,f.admin.id),fastAdmin=await queueAdminEmailTest(f.admin,f.user.id);
    stallRecipient='admin@example.invalid';
    const parallelStart=performance.now();await processNotices(parallelStart+1100,'email-test:');
    assert.equal((await testDb.notification.findUniqueOrThrow({where:{idempotencyKey:slowAdmin}})).status,'failed');
    assert.equal((await testDb.notification.findUniqueOrThrow({where:{idempotencyKey:fastAdmin}})).status,'sent');
    assert.ok(performance.now()-parallelStart<2000);
    console.log('PASS: registration queue, recipients, dedup, missing SMTP, rejected SMTP, successful local SMTP, no duplicate send, stale approval cancellation (no external email sent)');
  }finally{server.close();await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Registration notification integration failed (credentials omitted)');process.exitCode=1;});
