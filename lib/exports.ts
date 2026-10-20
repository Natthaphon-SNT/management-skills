import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {CATEGORIES,PLAN_CATEGORIES,STATES,day,safeCell,bangkokToday} from './calendar';
import type {ReportData} from './reports';
import {AppError,sha256,asJson} from './security';
import type {Actor} from './auth';
import {prisma} from './prisma';
import {audit,lockYear} from './records';

export type ExportKind='normal'|'dashboard';
export type ExportFormat='xlsx'|'csv';
function detailData(report:ReportData,kind:ExportKind) {
  return {headers:['\u0e25\u0e33\u0e14\u0e31\u0e1a','รหัสบุคลากร','ชื่อ-นามสกุล','ฝ่าย ณ วันอบรม','ปีงบประมาณ','ไตรมาส','วันที่เริ่ม','วันที่สิ้นสุด','หน่วยงานที่จัด','ประเภท','หลักสูตร/หัวข้อ','สถานที่','ชั่วโมง','สถานะอบรม','สถานะผล','คำอธิบายการนำไปใช้','ผลลัพธ์จริง','วันที่รายงาน','จำนวนหลักฐาน'],
    rows:report.rows.map((r,index)=>[index+1,r.person.code,r.person.fullName,r.department.name,report.year.year,r.activity.quarter,day(r.activity.startsOn),day(r.activity.endsOn),r.activity.organizer,CATEGORIES[r.activity.category as keyof typeof CATEGORIES]+(r.activity.otherCategory?' / '+r.activity.otherCategory:''),r.activity.title,r.activity.location,r.activity.hours===null?null:Number(r.activity.hours),STATES[r.status],r.result?STATES[r.result.reviewStatus]:'รอกรอกผลการนำไปใช้',r.result?.explanation,r.result?.outcome,r.result?day(r.result.reportedOn):null,r._count.attachments])};
}
function addTable(sheet:ExcelJS.Worksheet,headers:string[],rows:unknown[][],name:string) {
  sheet.addTable({name,ref:'A1',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:headers.map(name=>({name,filterButton:true})),rows:rows.length?rows:[headers.map(()=>null)]});
  sheet.views=[{state:'frozen',ySplit:1}]; sheet.getRow(1).height=35;
  sheet.columns.forEach((column,index)=> {
    const longest=Math.max(headers[index]?.length??10,...rows.map(row=>Math.min(42,String(row[index]??'').length)));
    column.width=Math.max(14,Math.min(42,longest+3));column.alignment={wrapText:true,vertical:'top'};column.font={name:'Noto Sans Thai',size:11};
  });
  sheet.getRow(1).font={name:'Noto Sans Thai',size:11,bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2458AD'}};
  for(let i=0;i<rows.length;i++) {
    const lines=Math.max(1,...rows[i].map((v,c)=>Math.ceil(String(v??'').length/Math.max(10,(sheet.getColumn(c+1).width??20)-4))+String(v??'').split('\n').length-1));
    sheet.getRow(i+2).height=Math.min(240,Math.max(32,lines*18));
  }
  sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
}
const xml=(text:string)=>text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
async function addEditableChart(buffer:Buffer,report:ReportData) {
  const zip=await JSZip.loadAsync(buffer),sheet=zip.file('xl/worksheets/sheet1.xml'); if(!sheet) throw new Error('Missing KPI worksheet');
  let sheetXml=await sheet.async('string'); if(!sheetXml.includes('xmlns:r=')) sheetXml=sheetXml.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  zip.file('xl/worksheets/sheet1.xml',sheetXml.replace('</worksheet>','<drawing r:id="rIdKpiDrawing"/></worksheet>'));
  const relPath='xl/worksheets/_rels/sheet1.xml.rels';
  const relationship='<Relationship Id="rIdKpiDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
  const old=zip.file(relPath);zip.file(relPath,old?(await old.async('string')).replace('</Relationships>',relationship+'</Relationships>'):`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship}</Relationships>`);
  zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>28</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="KPI B, D, E"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>');
  const series=[['ผลจริง','E','actual'],['เป้าหมาย','F','target']].map(([label,column,key],index)=>`<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${xml(label)}</c:v></c:tx><c:cat><c:strRef><c:f>'ภาพรวม KPI'!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/>${report.kpis.slice(0,3).map((k,i)=>`<c:pt idx="${i}"><c:v>${k.code}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>'ภาพรวม KPI'!$${column}$2:${column}$4</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="3"/>${report.kpis.slice(0,3).map((k,i)=>k[key as 'actual'|'target']===null?'':`<c:pt idx="${i}"><c:v>${k[key as 'actual'|'target']}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`).join('');
  zip.file('xl/charts/chart1.xml',`<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${series}<c:axId val="100"/><c:axId val="200"/></c:barChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="200"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="100"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`);
  const types=await zip.file('[Content_Types].xml')!.async('string'); zip.file('[Content_Types].xml',types.replace('</Types>','<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:1}});
}
export async function makeExport(report:ReportData,kind:ExportKind,format:ExportFormat) {
  if(format==='csv'&&kind==='dashboard') throw new AppError(422,'Dashboard พร้อมกราฟต้องใช้ XLSX; CSV เก็บรูปแบบและกราฟไม่ได้');
  const {headers,rows}=detailData(report,kind);
  if(rows.length>5000) throw new AppError(422,'รายงานเกิน 5,000 แถว กรุณาจำกัดตัวกรองหรือแยกช่วงวันที่ เพื่อสร้าง Excel ภายในเวลา serverless');
  if(format==='csv') {
    const escape=(value:unknown)=>`"${safeCell(value).replaceAll('"','""')}"`;
    return {bytes:Buffer.from('\uFEFF'+[headers,...rows].map(row=>row.map(escape).join(',')).join('\r\n'),'utf8'),rowCount:rows.length};
  }
  const book=new ExcelJS.Workbook();book.creator='กองคลัง RMUTT';book.created=new Date();
  if(kind==='dashboard') {
    const overview=book.addWorksheet('ภาพรวม KPI');
    addTable(overview,['รหัส','KPI','ตัวตั้ง','ตัวหาร','ผลจริง','เป้าหมาย','ช่องว่างตามทิศทาง','ผลจริงเทียบเป้าหมาย (%)','หน่วย','สถานะ','สูตร','นิยาม ID','รุ่น'],report.kpis.map(k=>[k.code,k.name,k.numerator,k.denominator,k.actual,k.target,k.gap,k.attainment,k.unit,k.status,k.formula,k.definitionId,k.version]),'KpiSummary');
  }
  const sheet=book.addWorksheet('รายละเอียดอบรม');addTable(sheet,headers,rows,'ReportData');
  const meta=book.addWorksheet('เงื่อนไขรายงาน');addTable(meta,['รายการ','ค่า'],[['ปีงบประมาณ',report.year.year],['ช่วงวันที่',report.periodStart+' ถึง '+report.periodEnd],['ตัวกรอง',JSON.stringify(report.filters)],['สร้างเมื่อ (Bangkok)',new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})],['รุ่นข้อมูล',report.year.dataVersion],['ขอบเขต',report.scopeNote],['เอกสารต้นทาง','ยังไม่ได้รับ PDF เพื่อยืนยัน mapping และเลขหน้า']],'ReportMetadata');
  if(kind==='dashboard') {const hours=book.addWorksheet('ฐานบุคลากรและชั่วโมง');addTable(hours,['\u0e25\u0e33\u0e14\u0e31\u0e1a','รหัสบุคลากร','ชื่อ-นามสกุล','ฝ่ายในฐาน','ชั่วโมงตามเกณฑ์ F','ไม่ทราบชั่วโมง','เป้าหมาย','ช่องว่าง'],report.personHours.map((p,index)=>[index+1,p.personId,p.fullName,p.department,p.hours,p.missingHours,p.target,p.gap]),'PersonnelHours');}
  let bytes=Buffer.from(await book.xlsx.writeBuffer()); if(kind==='dashboard') bytes=Buffer.from(await addEditableChart(bytes,report));return {bytes,rowCount:rows.length};
}
export async function persistExport(actor:Actor,report:ReportData,kind:ExportKind,format:ExportFormat,dataVersion:number) {
  if(report.year.dataVersion!==dataVersion) throw new AppError(409,'ข้อมูลเปลี่ยนแล้ว กรุณารีเฟรช Dashboard ก่อนส่งออก');
  const started=performance.now();const file=await makeExport(report,kind,format);
  if(performance.now()-started>7000) throw new AppError(422,'การสร้างรายงานใช้เวลานาน กรุณาจำกัดตัวกรองแล้วลองใหม่');
  return prisma.$transaction(async tx=> {
    const year=await lockYear(tx,report.year.id,false);if(year.dataVersion!==dataVersion)throw new AppError(409,'ข้อมูลเปลี่ยนระหว่างสร้างไฟล์ กรุณาส่งออกใหม่');
    const job=await tx.exportJob.create({data:{userId:actor.id,fiscalYearId:year.id,kind,format,filters:asJson(report.filters),dataVersion,status:'completed',data:file.bytes,sha256:sha256(file.bytes),rowCount:file.rowCount},select:{id:true}});
    await audit(tx,actor,'export_completed','export_jobs',job.id,undefined,year.id,{rowCount:file.rowCount,sha256:sha256(file.bytes)});return job.id;
  });
}
