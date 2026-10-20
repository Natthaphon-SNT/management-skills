'use client';
import {useEffect,useState,type ReactNode} from 'react';
export function GuestForm({action,children,label}:{action:string,children:ReactNode,label:string}) {
  const [csrf,setCsrf]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let mounted=true;fetch('/api/auth/csrf',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();if(mounted)setCsrf(data.csrf);}).catch(()=>{if(mounted)setError('โหลดฟอร์มไม่สำเร็จ กรุณารีเฟรชหน้า');});return()=>{mounted=false;};},[]);
  return <form method="post" action={action} className="stack"><input type="hidden" name="csrf" value={csrf}/>{children}{error&&<p className="error" role="alert">{error}</p>}<button className="button full" disabled={!csrf}>{csrf?label:'กำลังเตรียมฟอร์ม…'}</button></form>;
}
