'use client';
import {usePathname} from 'next/navigation';
export function Navigation({admin}:{admin:boolean}) {
  const current=usePathname(),items=[['/dashboard','▦','ภาพรวมและ KPI'],['/trainings','◇','การอบรมและผลการนำไปใช้'],['/exports','↧','รายงานส่งออก']];
  const adminItems=[['/admin','♧','ทะเบียนและการตั้งค่า'],['/admin/retention','▣','จัดเก็บและสำรองรายปี'],['/admin/notices','◉','การแจ้งเตือน'],['/admin/audit','↺','ประวัติการดำเนินการ']];
  const render=(list:string[][])=>list.map(([path,icon,label])=><a key={path} href={path} className={(path==='/admin'?current===path:current.startsWith(path))?'active':''}><span aria-hidden="true">{icon}</span>{label}</a>);
  return <nav>{render(items)}{admin&&<><p className="nav-caption">สำหรับผู้ดูแลระบบ</p>{render(adminItems)}</>}</nav>;
}
