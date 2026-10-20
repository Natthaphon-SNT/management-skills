import {databaseHealth} from '@/lib/prisma';
export const runtime='nodejs';
export const maxDuration=10;
export const dynamic='force-dynamic';
export async function GET() {
  try {await databaseHealth();return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
