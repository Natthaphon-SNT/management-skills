import {cookies} from 'next/headers';
import {randomToken,sign} from '@/lib/security';
import {cookieOptions,getSession} from '@/lib/auth';
export const runtime='nodejs';
export const maxDuration=10;
export const dynamic='force-dynamic';
export async function GET() {
  const session=await getSession();if(session)return Response.json({csrf:session.csrfToken},{headers:{'Cache-Control':'no-store'}});
  const nonce=randomToken(),token=nonce+'.'+sign(nonce);(await cookies()).set('management_csrf',token,{...cookieOptions,maxAge:1800});
  return Response.json({csrf:token},{headers:{'Cache-Control':'no-store'}});
}
