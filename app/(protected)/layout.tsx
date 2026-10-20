import {pageActor,getSession} from '@/lib/auth';
import {prisma,withColdStartRetry} from '@/lib/prisma';
import {dateOnly,bangkokToday} from '@/lib/calendar';
import {Navigation} from '@/components/navigation';
import {ThemeButton} from '@/components/enhancements';
import {Form} from '@/components/form';
import {TrainingReminder} from '@/components/training-reminder';
export const dynamic='force-dynamic';
export default async function ProtectedLayout({children}:{children:React.ReactNode}) {
  const actor=await pageActor(),session=await getSession();
  const assignment=await withColdStartRetry(()=>prisma.personnelAssignment.findFirst({where:{personId:actor.personId!,startsOn:{lte:dateOnly(bangkokToday())},OR:[{endsOn:null},{endsOn:{gte:dateOnly(bangkokToday())}}]},select:{department:{select:{name:true}}},orderBy:{startsOn:'desc'}}));
  return <div className="app-shell"><aside className="sidebar" aria-label="เมนูหลัก"><a href="/dashboard" className="brand"><img className="university-logo" src="/rmutt-emblem.png" alt="RMUTT" width={54} height={76}/><span>กองคลัง<small>RMUTT · PEOPLE DEVELOPMENT</small></span></a><p className="nav-caption">พื้นที่การทำงาน</p><Navigation admin={actor.role==='ADMIN'}/><div className="sidebar-note"><span className="online-dot"/> ระบบพัฒนาทักษะบุคลากร<small>มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี</small></div></aside>
    <div className="workspace"><header className="topbar"><div><p className="eyebrow">FINANCE DIVISION</p><p>ระบบบริหารจัดการและติดตามผลการพัฒนาทักษะของบุคลากรกองคลัง</p></div><div className="account"><div className="avatar" aria-hidden="true">{(session?.user.person?.fullName??actor.name).slice(0,1)}</div><div><strong>{session?.user.person?.fullName??actor.name}</strong><small>{assignment?.department.name??'ยังไม่ระบุฝ่าย'} · {actor.role}</small></div><ThemeButton/><a className="text-button" href="/settings/password">เปลี่ยนรหัสผ่าน</a><Form action="/api/auth/logout"><button className="text-button">ออกจากระบบ</button></Form></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>{actor.role==='ADMIN'&&<TrainingReminder/>}{children}<footer className="footer">กองคลัง มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี<span>วันที่และเวลาทางธุรกิจ: Asia/Bangkok</span></footer></main></div></div>;
}
