'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main-content" className="page-error card"><h1>โหลดข้อมูลไม่สำเร็จ</h1><p className="scope-note">ฐานข้อมูลอาจกำลังเริ่มทำงาน กรุณาลองอีกครั้ง หากยังพบปัญหาให้ติดต่อ ADMIN</p><button className="button" onClick={reset}>ลองอีกครั้ง</button></main>;}
