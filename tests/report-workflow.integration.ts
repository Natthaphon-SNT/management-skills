import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {fixture,testDb,testUrl} from './fixtures';
import {dateOnly,day,reportDeadline} from '../lib/calendar';
async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  delete process.env.SMTP_URL;
  const {saveTraining,saveResult}=await import('../lib/actions');
  const {reportData}=await import('../lib/reports');
  const {makeExport}=await import('../lib/exports');
  const {enqueueTrainingReminders,processNotices}=await import('../lib/notifications');
  const {prisma}=await import('../lib/prisma');
  try{
    const f=await fixture();
    assert.equal(reportDeadline('2028-02-28'),'2028-03-02');
    assert.equal(reportDeadline('2026-12-30'),'2027-01-02');
    const id=await saveTraining(f.admin,{personId:f.user.personId,fiscalYearId:f.year.id,quarter:1,startsOn:f.trainingDate,endsOn:f.trainingDate,organizer:'ทดสอบ',title:'ทดสอบกำหนดสามวัน',location:'ห้องสมมติ',category:'professional',hours:2,status:'completed',reportDueOn:'2099-01-01'});
    const record=await testDb.trainingParticipation.findUniqueOrThrow({where:{id},include:{activity:true}});
    assert.equal(day(record.reportDueOn),reportDeadline(f.trainingDate));assert.equal(record.activity.strategyId,null);
    const due=record.reportDueOn,at=(delta:number)=>new Date(+due+delta*86400000+12*3600000);
    assert.ok(!(await enqueueTrainingReminders(at(-2),true)).actions.some(a=>a.idempotencyKey.includes(id)));
    for(const delta of [-1,0,1]){
      const first=await enqueueTrainingReminders(at(delta));
      assert.ok(first.actions.some(a=>a.idempotencyKey.includes(id)));
      const count=await testDb.notification.count();await enqueueTrainingReminders(at(delta));assert.equal(await testDb.notification.count(),count);
    }
    await saveResult(f.admin,id,{explanation:'ทดสอบผลจริง',outcome:'บันทึกได้',reportedOn:f.trainingDate,version:0});
    assert.ok(!(await enqueueTrainingReminders(at(2),true)).actions.some(a=>a.idempotencyKey.includes(id)));
    await processNotices(performance.now()+5000);
    assert.equal(await testDb.notification.count({where:{idempotencyKey:{startsWith:`training-result:${id}:`},channel:'email',status:'cancelled'}}),3);
    const report=await reportData(f.admin,{fiscalYearId:f.year.id,q:'พัฒนา'});
    assert.ok(report.rows.length>0);assert.ok(report.rows.every(r=>r.personId===f.user.personId));
    assert.equal((await reportData(f.user,{q:'ผู้ดูแล'})).rows.length,0);
    for(const kind of ['normal','dashboard'] as const){
      const exported=await makeExport(report,kind,'xlsx'),book=new ExcelJS.Workbook();await book.xlsx.load(exported.bytes as never);
      const sheet=book.getWorksheet('รายละเอียดอบรม')!;
      assert.equal(sheet.getCell('A1').value,'ลำดับ');assert.equal(sheet.getCell('A2').value,1);
      assert.ok(!JSON.stringify(sheet.getRow(1).values).includes('ยุทธศาสตร์'));
    }
    const csv=await makeExport(report,'normal','csv');assert.ok(csv.bytes.toString().startsWith('\uFEFF"ลำดับ","รหัสบุคลากร"'));
    console.log('PASS: computed 3-day deadline, pre/due/overdue notices, dedup, cancelled stale email, result date, name search + ownership, XLSX/CSV numbering');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Report workflow integration failed (credentials omitted)');process.exitCode=1;});
