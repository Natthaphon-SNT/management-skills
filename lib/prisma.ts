import { PrismaClient,Prisma } from '@prisma/client';

const globalDatabase=globalThis as unknown as { managementPrisma?: PrismaClient };
export function connectionUrl(input:string | undefined) {
  if(!input) return undefined;
  const url=new URL(input);
  url.searchParams.set('connect_timeout','15');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) url.searchParams.set('sslmode','require');
  return url.toString();
}
const url=connectionUrl(process.env.DATABASE_URL);
export const prisma=globalDatabase.managementPrisma ?? new PrismaClient({ ...(url?{datasources:{db:{url}}}:{}), log:[] });
export function sqlTable(name:string) {
  const schema=url?new URL(url).searchParams.get('schema')??'public':'public';
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)||!/^[a-z_]+$/.test(name)) throw new Error('Invalid internal SQL identifier');
  return Prisma.raw(`"${schema}"."${name}"`);
}
// หนึ่ง client ต่อ process / warm serverless instance และคงไว้เมื่อ hot reload
globalDatabase.managementPrisma=prisma;
const coldStartCodes=new Set(['P1001','P1002','P1017']);
export async function withColdStartRetry<T>(query:()=>Promise<T>):Promise<T> {
  try { return await query(); } catch(error) {
    const code=typeof error==='object' && error!==null && 'code' in error?String(error.code):'';
    if(!coldStartCodes.has(code)) throw error;
    await new Promise(resolve=>setTimeout(resolve,150));
    return query(); // retry เพียง 1 ครั้ง ใช้เฉพาะ reads / connect ไม่ retry mutation
  }
}
export async function databaseHealth() { await withColdStartRetry(()=>prisma.$queryRaw`SELECT 1`); }
