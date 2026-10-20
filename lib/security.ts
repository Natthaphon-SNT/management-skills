import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export class AppError extends Error { constructor(public status:number,message:string,public fields?:Record<string,string>) { super(message); } }
export const randomToken=()=>randomBytes(32).toString('base64url');
export const sha256=(value: string | Uint8Array)=>createHash('sha256').update(value).digest('hex');
export function secret() {
  const value=process.env.SESSION_SECRET;
  if(!value || value.length<32) throw new AppError(503,'ยังไม่ได้กำหนด SESSION_SECRET ที่ปลอดภัย');
  return value;
}
export const sign=(value:string)=>createHmac('sha256',secret()).update(value).digest('base64url');
export function constantEqual(left:string,right:string) {
  const a=Buffer.from(left),b=Buffer.from(right); return a.length===b.length && timingSafeEqual(a,b);
}
export function requestOrigin(request:Request) {
  const url=new URL(request.url),host=request.headers.get('host');
  if(host) {
    const external=new URL(url.protocol+'//'+host);
    if(external.host!==host||external.username||external.password) throw new AppError(403,'ชื่อโฮสต์ไม่ถูกต้อง');
    return external.origin;
  }
  return url.origin;
}
export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(!origin || origin!==requestOrigin(request)) throw new AppError(403,'แหล่งที่มาของคำขอไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ');
}
export const asJson=<T>(value:T)=>JSON.parse(JSON.stringify(value)) as T;
