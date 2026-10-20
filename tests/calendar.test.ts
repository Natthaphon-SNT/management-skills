import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalBounds,identifyFiscal,validateTrainingDates,safeCell,bangkokToday} from '../lib/calendar';
import {connectionUrl,withColdStartRetry,prisma} from '../lib/prisma';
test('ปีงบประมาณและทั้งสี่ไตรมาสตรงตามปฏิทิน พ.ศ.',()=> {
  assert.deepEqual(fiscalBounds(2569),{start:'2025-10-01',end:'2026-09-30'});
  for(const [quarter,start,end] of [[1,'2025-10-01','2025-12-31'],[2,'2026-01-01','2026-03-31'],[3,'2026-04-01','2026-06-30'],[4,'2026-07-01','2026-09-30']] as const) {
    assert.deepEqual(fiscalBounds(2569,quarter),{start,end});assert.deepEqual(identifyFiscal(start),{year:2569,quarter});assert.deepEqual(identifyFiscal(end),{year:2569,quarter});
  }
});
test('รองรับ 29 กุมภาพันธ์และการเปลี่ยนปีงบประมาณ',()=> {
  assert.deepEqual(identifyFiscal('2024-02-29'),{year:2567,quarter:2});assert.deepEqual(identifyFiscal('2026-10-01'),{year:2570,quarter:1});
  assert.throws(()=>identifyFiscal('2026-02-29'));assert.equal(bangkokToday(new Date('2026-10-19T18:00:00Z')),'2026-10-20');
});
test('ปฏิเสธวันสิ้นสุดก่อนวันเริ่มและไตรมาสผิด แต่ไม่ตัดวันข้ามไตรมาส',()=> {
  assert.throws(()=>validateTrainingDates(2569,1,'2025-10-10','2025-10-09'),/วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม/);
  assert.throws(()=>validateTrainingDates(2569,2,'2025-10-10','2025-10-11'));
  assert.throws(()=>validateTrainingDates(2569,1,'2025-12-31','2026-01-02'));
  assert.doesNotThrow(()=>validateTrainingDates(2569,1,'2025-12-31','2026-01-02',true));
});
test('CSV ป้องกัน formula injection รวมช่องว่างและ tab',()=> {
  for(const text of ['=SUM(1,2)','+1','-1','@cmd','  =1','\t=2','\n@cmd'])assert.equal(safeCell(text),"'"+text);
  assert.equal(safeCell('ข้อความไทย, "ตัวอย่าง"\nบรรทัดที่สอง'),'ข้อความไทย, "ตัวอย่าง"\nบรรทัดที่สอง');
});
test('Neon connection ใช้ TLS และ timeout 15 โดยคง pooled host',()=> {
  const url=new URL(connectionUrl('postgresql://USER:PLACEHOLDER@ep-example-pooler.ap-southeast-1.aws.neon.tech/neondb')!);
  assert.equal(url.searchParams.get('sslmode'),'require');assert.equal(url.searchParams.get('connect_timeout'),'15');assert.match(url.hostname,/-pooler\./);
  assert.equal(new URL(connectionUrl('postgresql://USER:PLACEHOLDER@127.0.0.1:5432/test?sslmode=disable')!).searchParams.get('sslmode'),'disable');
});
test('cold start retry อ่านเพียง 1 ครั้ง และไม่ retry validation/unique error',async()=> {
  let calls=0;assert.equal(await withColdStartRetry(async()=>{if(++calls===1)throw Object.assign(new Error('cold'),{code:'P1001'});return 7;}),7);assert.equal(calls,2);
  calls=0;await assert.rejects(()=>withColdStartRetry(async()=>{calls++;throw Object.assign(new Error('duplicate'),{code:'P2002'});}));assert.equal(calls,1);
  calls=0;await assert.rejects(()=>withColdStartRetry(async()=>{calls++;throw Object.assign(new Error('offline'),{code:'P1002'});}));assert.equal(calls,2);
});
test.after(()=>prisma.$disconnect());
