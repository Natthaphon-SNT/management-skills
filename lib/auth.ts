import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { User } from '@prisma/client';
import { prisma, withColdStartRetry } from './prisma';
import { AppError, sha256, sign, constantEqual } from './security';
export const COOKIE='management_session';
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:7200};
export type Actor=Pick<User,'id'|'role'|'personId'|'name'|'username'|'active'|'approvedAt'>;
export const getSession=cache(async()=> {
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token) return null;
  return withColdStartRetry(()=>prisma.authSession.findUnique({where:{tokenHash:sha256(sign(token))},include:{user:{include:{person:true}}}})).then(session=>
    session && session.expiresAt>new Date() && session.user.active && !session.user.deletedAt && !session.user.person?.deletedAt && session.user.approvedAt && session.user.personId ? session : null);
});
export async function requireActor():Promise<Actor> { const session=await getSession(); if(!session) throw new AppError(401,'กรุณาเข้าสู่ระบบ'); return session.user; }
export async function pageActor(admin=false) { const session=await getSession(); if(!session) redirect('/login'); if(admin && session.user.role!=='ADMIN') redirect('/dashboard?error='+encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้')); return session.user; }
export function assertOwner(actor:Actor,personId:string) { if(actor.role!=='ADMIN' && actor.personId!==personId) throw new AppError(403,'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้'); }
export function assertAdmin(actor:Actor) { if(actor.role!=='ADMIN') throw new AppError(403,'ต้องใช้สิทธิ์ ADMIN'); }
export async function validateCsrf(request:Request,data:Record<string,unknown>,guest=false) {
  const token=String(request.headers.get('x-csrf-token')??data.csrf??'');
  if(guest) {
    const expected=(await cookies()).get('management_csrf')?.value??'';
    const [nonce,signature]=token.split('.');
    if(!nonce || !signature || !constantEqual(sign(nonce),signature) || !constantEqual(token,expected)) throw new AppError(419,'เซสชันฟอร์มหมดอายุ กรุณารีเฟรชหน้า');
  } else {
    const session=await getSession(); if(!session || !constantEqual(session.csrfToken,token)) throw new AppError(419,'เซสชันฟอร์มหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
}
