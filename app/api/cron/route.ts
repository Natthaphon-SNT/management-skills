import {constantEqual} from '@/lib/security';
import {runScheduledWork} from '@/lib/notifications';
export const runtime='nodejs';
export const maxDuration=10;
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const token=process.env.CRON_SECRET;if(!token||token.length<32)return Response.json({ok:false},{status:503});
  if(!constantEqual(request.headers.get('authorization')??'','Bearer '+token))return Response.json({ok:false},{status:401});
  try {const result=await runScheduledWork();return Response.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false},{status:503});}
}
