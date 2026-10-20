import assert from 'node:assert/strict';
import net from 'node:net';
import {fixture,testDb,testUrl} from './fixtures';

async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {saveTraining,saveResult}=await import('../lib/actions');
  const {enqueueTrainingEvent,processNotices}=await import('../lib/notifications');
  const {prisma}=await import('../lib/prisma');
  const messages:string[]=[];
  const server=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
    let input='',data=false,body='';
    socket.on('data',chunk=>{
      input+=chunk;
      while(input.includes('\r\n')){
        const end=input.indexOf('\r\n'),line=input.slice(0,end);input=input.slice(end+2);
        if(data){if(line==='.') {data=false;messages.push(body);body='';socket.write('250 accepted\r\n');}else body+=line+'\r\n';continue;}
        if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');
        else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}
        else if(line==='QUIT')socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error',()=>{});
  });
  try{
    const f=await fixture();
    await testDb.user.update({where:{id:f.admin.id},data:{email:'first@example.invalid'}});
    const second=await testDb.user.create({data:{username:'second-admin',name:'Second admin',passwordHash:f.admin.passwordHash,role:'ADMIN',approvedAt:new Date(),personId:f.persons[2].id,email:'second@example.invalid'}});
    for(const [username,extra] of [['pending-admin',{}],['inactive-admin',{approvedAt:new Date(),active:false}],['deleted-admin',{approvedAt:new Date(),deletedAt:new Date()}]] as const){
      await testDb.user.create({data:{username,name:username,passwordHash:f.admin.passwordHash,role:'ADMIN',email:`${username}@example.invalid`,...extra}});
    }
    const payload={personId:f.user.personId!,fiscalYearId:f.year.id,quarter:1,startsOn:f.trainingDate,endsOn:f.trainingDate,organizer:'Test organizer',title:'Notification test',location:'Test room',category:'professional',hours:2,status:'completed'};
    await assert.rejects(()=>saveTraining(f.user,{...payload,title:''}));
    assert.equal(await testDb.notification.count(),0);
    const id=await saveTraining(f.user,payload),prefix=`training-saved:${id}:`;
    const notices=await testDb.notification.findMany({where:{idempotencyKey:{startsWith:prefix}}});
    assert.equal(notices.length,4);
    assert.deepEqual(new Set(notices.map(n=>n.userId)),new Set([f.admin.id,second.id]));
    assert.equal(notices.filter(n=>n.channel==='email'&&n.status==='pending').length,2);
    assert.ok(notices.every(n=>n.message.includes(f.user.name)&&n.message.includes(payload.title)));
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.SMTP_URL=`smtp://127.0.0.1:${(server.address() as net.AddressInfo).port}/?ignoreTLS=true`;
    process.env.MAIL_FROM='sender@example.invalid';process.env.APP_URL='https://example.invalid';
    await processNotices(performance.now()+4000,prefix);
    assert.equal(messages.length,2);
    assert.ok(messages.some(m=>m.includes('first@example.invalid'))&&messages.some(m=>m.includes('second@example.invalid')));
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:prefix},channel:'email',status:'sent'}}),2);
    await processNotices(performance.now()+4000,prefix);assert.equal(messages.length,2);
    await saveTraining(f.user,{...payload,title:'Edited training'},id);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:prefix},channel:'email'}}),4);
    const resultInput={explanation:'Private detailed explanation',outcome:'Private detailed outcome',reportedOn:f.trainingDate,version:0};
    await saveResult(f.user,id,resultInput);
    const result=await testDb.applicationResult.findUniqueOrThrow({where:{participationId:id}});
    const resultPrefix=`result-submitted:${id}:${result.version}:`;
    await testDb.$transaction(tx=>enqueueTrainingEvent(tx,id,'result-submitted',String(result.version)));
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:resultPrefix}}}),4);
    const resultNotices=await testDb.notification.findMany({where:{idempotencyKey:{startsWith:resultPrefix}}});
    assert.ok(resultNotices.every(n=>!n.message.includes(resultInput.explanation)&&!n.message.includes(f.user.passwordHash)));
    await processNotices(performance.now()+4000,resultPrefix);assert.equal(messages.length,4);
    await assert.rejects(()=>saveResult(f.user,id,resultInput),{status:409});
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:`result-submitted:${id}:`}}}),4);
    await saveResult(f.user,id,{...resultInput,version:result.version,outcome:'Edited outcome'});
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:`result-submitted:${id}:`}}}),8);
    console.log('PASS: training create/edit and result submit/resubmit queue all eligible admins, actual local SMTP acceptance, dedup, rejected save creates no notice, private result omitted (no external email sent)');
  }finally{server.close();await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Training notification integration failed (credentials omitted)');process.exitCode=1;});
