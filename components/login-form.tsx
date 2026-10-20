'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
function Icon({name}:{name:'user'|'key'|'eye'|'eye-off'|'arrow'|'sun'|'moon'}) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{
    name==='user'?<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>:
    name==='key'?<><circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 2-2m-5-1 2-2"/></>:
    name==='arrow'?<path d="M4 12h16m-6-6 6 6-6 6"/>:
    name==='sun'?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>:
    name==='moon'?<path d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z"/>:
    <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>{name==='eye-off'&&<path d="m3 3 18 18"/>}</>
  }</svg>;
}
export function LoginThemeToggle() {
  const [dark,setDark]=useState(false);
  useEffect(()=>setDark(document.documentElement.dataset.theme==='dark'),[]);
  return <button className="login-theme-button" type="button" aria-label={dark?'เปลี่ยนเป็นโหมดสว่าง':'เปลี่ยนเป็นโหมดมืด'} aria-pressed={dark} onClick={()=>{const value=!dark;setDark(value);document.documentElement.dataset.theme=value?'dark':'light';try{localStorage.setItem('finance-theme',value?'dark':'light');}catch{}}}><Icon name="sun"/><span className="login-theme-divider"/><Icon name="moon"/></button>;
}
export function LoginForm({initialError,success}:{initialError?:string,success?:string}) {
  const [csrf,setCsrf]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(initialError??'');
  const pending=useRef(false),errorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const abort=new AbortController();fetch('/api/auth/csrf',{cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();setCsrf(data.csrf);}).catch(()=>{if(!abort.signal.aborted)setError('โหลดฟอร์มไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง');});return()=>abort.abort();},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending.current||!csrf)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','x-csrf-token':csrf},body:JSON.stringify({username,password,csrf})});
      const result=await response.json();if(!response.ok)throw Error(result.error??'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
      window.location.assign('/dashboard');
    } catch(reason) {
      setError(reason instanceof TypeError?'เชื่อมต่อระบบไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง':reason instanceof Error?reason.message:'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
      setPassword('');setVisible(false);pending.current=false;setBusy(false);setTimeout(()=>errorRef.current?.focus(),0);
    }
  }
  return <form action="/api/auth/login" method="post" onSubmit={submit} data-managed-submit="true" className="login-form" aria-busy={busy}>
    <input type="hidden" name="csrf" value={csrf}/>{success&&!error&&<p className="login-success" role="status">{success}</p>}
    <div className="login-field"><label htmlFor="login-username">Username</label><div className="login-input-wrap"><Icon name="user"/><input id="login-username" name="username" autoComplete="username" placeholder="ชื่อผู้ใช้งาน" required value={username} onChange={e=>setUsername(e.target.value)} readOnly={busy}/></div></div>
    <div className="login-field"><label htmlFor="login-password">Password</label><div className="login-input-wrap"><Icon name="key"/><input id="login-password" name="password" type={visible?'text':'password'} autoComplete="current-password" placeholder="รหัสผ่าน" required value={password} onChange={e=>setPassword(e.target.value)} readOnly={busy}/><button className="login-password-toggle" type="button" aria-label={visible?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'} aria-pressed={visible} aria-controls="login-password" onClick={()=>setVisible(!visible)}><Icon name={visible?'eye-off':'eye'}/></button></div></div>
    {error&&<p className="login-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    <button type="submit" className="login-submit" disabled={!csrf||busy}><span>{busy?'กำลังเข้าสู่ระบบ…':!csrf?'กำลังเตรียมฟอร์ม…':'เข้าสู่ระบบ'}</span>{busy?<span className="login-spinner" aria-hidden="true"/>:<Icon name="arrow"/>}</button>
  </form>;
}
