import {notFound} from 'next/navigation';
import {pageActor} from '@/lib/auth';
import {AppError} from '@/lib/security';
import {Messages} from '@/components/messages';
import {DashboardScreen} from '@/components/screens/dashboard';
import {TrainingsScreen} from '@/components/screens/trainings';
import {AdminScreen} from '@/components/screens/admin';
import {ExportsScreen} from '@/components/screens/exports';
import {RetentionScreen} from '@/components/screens/retention';
import {AuditScreen,NoticesScreen,PasswordScreen} from '@/components/screens/other';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=10;
type Props={params:Promise<{screen:string[]}>,searchParams:Promise<Record<string,string|string[]|undefined>>};
export default async function Screen({params,searchParams}:Props) {
  const segments=(await params).screen,actor=await pageActor(segments[0]==='admin');
  const query=Object.fromEntries(Object.entries(await searchParams).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
  let content:React.ReactNode;
  try {
    if(segments[0]==='dashboard'&&segments.length===1)content=await DashboardScreen({actor,query});
    else if(segments[0]==='trainings')content=await TrainingsScreen({actor,query,segments});
    else if(segments[0]==='exports'&&segments.length===1)content=await ExportsScreen({actor,query});
    else if(segments[0]==='settings'&&segments[1]==='password')content=PasswordScreen();
    else if(segments[0]==='admin') {
      if(segments.length===1)content=await AdminScreen({actor});
      else if(segments[1]==='retention')content=await RetentionScreen({actor,query});
      else if(segments[1]==='audit')content=await AuditScreen({actor,query});
      else if(segments[1]==='notices')content=await NoticesScreen({actor,query});
      else notFound();
    }else notFound();
  }catch(error) {
    if(error instanceof AppError)content=<section className="card"><h1>{error.status===403?'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้':'แสดงข้อมูลไม่ได้'}</h1><p className="scope-note">{error.message}</p><a className="button" href="/dashboard">กลับหน้าหลัก</a></section>;else throw error;
  }
  return <><Messages query={query}/>{content}</>;
}
