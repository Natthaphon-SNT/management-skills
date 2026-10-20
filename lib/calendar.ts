export const CATEGORIES = { professional: 'ด้านวิชาชีพ', teaching: 'ด้านครู', other: 'อื่น ๆ' } as const;
export const PLAN_CATEGORIES = { study: 'ศึกษาต่อ', promotion: 'ขอตำแหน่งสูงขึ้น', training: 'อบรมตามวิชาชีพ' } as const;
export const STATES: Record<string,string> = { draft:'ฉบับร่าง',submitted:'ส่งแผนแล้ว',approved:'อนุมัติแผนแล้ว',planned:'วางแผนเข้าร่วม',completed:'อบรมสำเร็จ',cancelled:'ยกเลิก',pending:'รอตรวจ',verified:'ผ่านการตรวจยืนยัน',changes_requested:'ขอให้แก้ไข',open:'เปิดรับแก้ไข',closed:'ปิดปี',archived:'จัดเก็บ archive',purged:'ลบข้อมูลประจำปีแล้ว' };
export const KPI_NAMES = {A:'ความครอบคลุมการจัดทำ IDP',B:'ความครอบคลุมการได้รับการพัฒนา',C:'ความสำเร็จตามแผน',D:'อัตราการรายงานการนำไปใช้',E:'อัตราการนำไปใช้ที่ผ่านการตรวจยืนยัน',F:'ชั่วโมงพัฒนาต่อคน'} as const;
export type KpiCode = keyof typeof KPI_NAMES;
export const FORMULAS: Record<KpiCode,string> = {
  A:'บุคลากรไม่ซ้ำที่มี IDP ตามสถานะ ÷ บุคลากรในฐานประเมิน × 100',
  B:'บุคลากรไม่ซ้ำที่อบรมสำเร็จตามเกณฑ์ ÷ บุคลากรในฐานประเมิน × 100',
  C:'เป้าหมายไม่ซ้ำที่มีกิจกรรมสำเร็จ ÷ เป้าหมายที่มีกำหนดในช่วงประเมิน × 100',
  D:'รายการถึงกำหนดที่รายงานผลแล้ว ÷ รายการสำเร็จที่ถึงกำหนดรายงาน × 100',
  E:'รายการสำเร็จที่ผ่านเงื่อนไขและตรวจยืนยัน ÷ รายการสำเร็จที่มีสิทธิ์ประเมิน × 100',
  F:'ชั่วโมงสำเร็จตามเกณฑ์ ÷ บุคลากรในฐานประเมิน (รวมคนไม่มีชั่วโมง)',
};
export const day = (date: Date | string) => typeof date === 'string' ? date.slice(0,10) : date.toISOString().slice(0,10);
export const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const reportDeadline=(endsOn:string|Date)=>day(new Date(+dateOnly(day(endsOn))+3*86400000));
export const bangkokToday = (at = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export function fiscalBounds(year: number, quarter?: number) {
  if (!Number.isInteger(year) || year<2500 || year>2700 || (quarter!==undefined && (quarter<1 || quarter>4))) throw new Error('ปีงบประมาณหรือไตรมาสไม่ถูกต้อง');
  const offset = quarter ? (quarter-1)*3 : 0;
  return { start:day(new Date(Date.UTC(year-544,9+offset,1))), end:day(new Date(Date.UTC(year-544,9+offset+(quarter?3:12),0))) };
}
export function identifyFiscal(date: string) {
  const parsed=dateOnly(date); if(Number.isNaN(+parsed)||day(parsed)!==date) throw new Error('วันที่ไม่ถูกต้อง');
  const month=parsed.getUTCMonth()+1;
  return { year:parsed.getUTCFullYear()+543+(month>=10?1:0),quarter:Math.floor(((month+2)%12)/3)+1 };
}
export function validateTrainingDates(year: number, quarter: number, start: string, end: string, exception=false) {
  identifyFiscal(start); identifyFiscal(end);
  if(end<start) throw new Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
  const bounds=fiscalBounds(year,quarter);
  if(start<bounds.start || start>bounds.end) throw new Error('วันที่เริ่มไม่ตรงกับปีงบประมาณและไตรมาส');
  if(end>bounds.end && !exception) throw new Error('กิจกรรมข้ามไตรมาสต้องระบุเหตุผลและให้ ADMIN ตรวจทาน');
}
export function safeCell(value: unknown): string {
  const text=String(value??''); return /^[\s\uFEFF\u200B]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text)?`'${text}`:text;
}
export const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
