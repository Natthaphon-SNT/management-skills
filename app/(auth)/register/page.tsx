import {GuestForm} from '@/components/guest-form';
import {Field} from '@/components/form';
import {Messages} from '@/components/messages';
import {prisma,withColdStartRetry} from '@/lib/prisma';
export const metadata={title:'สมัครสมาชิก'};
export default async function Register({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const departments=await withColdStartRetry(()=>prisma.department.findMany({where:{active:true},select:{id:true,name:true}}));
  return <><Messages query={await searchParams}/><div className="auth-intro"><p className="eyebrow">FINANCE DIVISION · RMUTT</p><h1>สมัครสมาชิก</h1><p>ระบบพัฒนาทักษะของบุคลากรกองคลัง</p></div><section className="auth-card"><p className="notice">ADMIN จะตรวจตัวตนและเชื่อมบัญชีกับทะเบียนเดิม เพื่อไม่สร้างบุคลากรซ้ำ</p><GuestForm action="/api/auth/register" label="สมัครสมาชิก"><Field name="name" label="ชื่อ-นามสกุล" required autoComplete="name"/><Field name="departmentId" label="ฝ่าย" options={departments.map(d=>({value:d.id,label:d.name}))} required/><Field name="username" label="Username" required minLength={3} autoComplete="username"/><Field name="password" label="Password (อย่างน้อย 12 ตัวอักษร)" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/><Field name="passwordConfirmation" label="ยืนยัน Password" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/></GuestForm><div className="auth-signup"><a href="/login">← กลับไปเข้าสู่ระบบ</a></div></section></>;
}
