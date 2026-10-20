import {LoginForm,LoginThemeToggle} from '@/components/login-form';
import './login.css';
export const metadata={title:'เข้าสู่ระบบ'};
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query=await searchParams;
  return <div className="login-screen"><div className="login-theme"><LoginThemeToggle/></div>
    <section className="login-card" aria-labelledby="system-title">
      <div className="login-visual" aria-hidden="true"><img src="/images/login-finance-desk.png" alt="" fetchPriority="high"/><svg className="login-waves" viewBox="0 0 600 280" preserveAspectRatio="none"><path d="M0 75C160 210 360-40 600 90V280H0Z" fill="#2864b5" fillOpacity=".25"/><path d="M0 135C170 15 380 270 600 100V280H0Z" fill="#1e50a3" fillOpacity=".38"/><path d="M0 185C240 310 400 95 600 190V280H0Z" fill="#162b75" fillOpacity=".65"/></svg></div>
      <div className="login-panel"><div className="login-panel-inner">
        <div className="login-identity"><img src="/rmutt-emblem.png" alt="ตรามหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี" className="login-emblem" width={66} height={114}/><p>มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี</p><h1 id="system-title">ระบบบริหารจัดการและติดตามผล<br/>การพัฒนาทักษะของบุคลากร<br/>กองคลัง</h1></div>
        <div className="login-form-heading"><h2>เข้าสู่ระบบ</h2><p>กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน</p></div>
        <LoginForm initialError={query.error} success={query.success}/><p className="login-register">ยังไม่มีบัญชี? <a href="/register">สมัครสมาชิก</a></p>
      </div></div>
    </section><footer className="login-footer">กองคลัง มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี</footer></div>;
}
