import type {Metadata} from 'next';
import Script from 'next/script';
import {Enhancements} from '@/components/enhancements';
import './globals.css';
export const metadata:Metadata={title:{default:'ระบบพัฒนาทักษะบุคลากรกองคลัง',template:'%s · กองคลัง RMUTT'},description:'ระบบบริหารจัดการและติดตามผลการพัฒนาทักษะของบุคลากรกองคลัง มทร.ธัญบุรี',icons:{icon:'/rmutt-emblem.png'}};
export const runtime='nodejs';
export const maxDuration=10;
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="th" suppressHydrationWarning><head><link rel="stylesheet" href="/css/app.css"/><Script src="/theme.js" strategy="beforeInteractive"/></head><body><a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหา</a>{children}<Enhancements/></body></html>;}
