import {getSession} from '@/lib/auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function AuthLayout({children}:{children:React.ReactNode}){if(await getSession())redirect('/dashboard');return <main id="main-content" className="auth-page" tabIndex={-1}>{children}</main>;}
