import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {fixture,testDb,testUrl} from './fixtures';

async function main(){
  process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=testUrl;
  const {reportData}=await import('../lib/reports');
  const {makeExport}=await import('../lib/exports');
  const {prisma}=await import('../lib/prisma');
  try{
    const f=await fixture();
    await testDb.person.update({where:{id:f.user.personId!},data:{code:'001'}});
    const input={fiscalYearId:f.year.id,quarter:1,departmentId:f.departments[5].id,q:'พัฒนา'};
    const report=await reportData(f.admin,input,false);
    const file=await makeExport(report,'dashboard','xlsx');
    await mkdir('../.tools',{recursive:true});
    await writeFile(`../.tools/export-${process.env.EXPORT_BASELINE?'before':'after'}.xlsx`,file.bytes);
    if(process.env.EXPORT_BASELINE)return;
    const book=new ExcelJS.Workbook();await book.xlsx.load(file.bytes as never);
    assert.equal(book.getWorksheet('ฐานบุคลากรและชั่วโมง')!.getCell('B2').value,'001');
    assert.equal(book.getWorksheet('รายละเอียดอบรม')!.getCell('B2').value,'001');
    const meta=JSON.stringify(book.getWorksheet('เงื่อนไขรายงาน')!.getSheetValues());
    assert.ok(meta.includes('ไตรมาส 1'));assert.ok(meta.includes('บัญชี'));assert.ok(meta.includes('พัฒนา'));
    assert.ok(!meta.includes(f.year.id));assert.ok(!meta.includes(f.departments[5].id));
    const empty=await reportData(f.admin,{...input,q:'ไม่มีชื่อนี้แน่นอน'},false);
    assert.equal(empty.rows.length,0);
    assert.ok(JSON.stringify(empty.filterDetails).includes('บัญชี'));
    const zip=await JSZip.loadAsync(file.bytes),sheet=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    assert.ok(sheet.indexOf('<drawing ')<sheet.indexOf('<tableParts'));
    const chart=await zip.file('xl/charts/chart1.xml')!.async('string');
    assert.ok(chart.includes('$E$2:$E$4'));assert.ok(chart.includes('$F$2:$F$4'));
    assert.equal(book.getWorksheet('ภาพรวม KPI')!.getCell('A2').value,'B');
    assert.equal(book.getWorksheet('ภาพรวม KPI')!.getCell('A5').value,'F');
    console.log('PASS: personnel code with leading zeros, readable filters without lookups/rows, KPI data and drawing order');
  }finally{await prisma.$disconnect();await testDb.$disconnect();}
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Export regression failed (credentials omitted)');process.exitCode=1;});
