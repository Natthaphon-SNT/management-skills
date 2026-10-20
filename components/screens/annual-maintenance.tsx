import {prisma,withColdStartRetry} from '@/lib/prisma';
import {ANNUAL_REPORT_KIND,storageUsage} from '@/lib/annual-maintenance';
import {bangkokToday,day} from '@/lib/calendar';
import {Field,Form,Submit} from '../form';
import {Badge} from '../reports';

export async function AnnualMaintenancePanel({year,query}:{year:{id:string,year:number,endsOn:Date},query:Record<string,string|undefined>}){
  const page=Math.max(1,Math.floor(Number(query.annualPage)||1)),back='/admin/retention?fiscalYearId='+year.id;
  const [usage,jobs]=await withColdStartRetry(()=>Promise.all([storageUsage(),prisma.exportJob.findMany({where:{fiscalYearId:year.id,kind:ANNUAL_REPORT_KIND},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*30,take:31,select:{id:true,status:true,error:true,dataVersion:true,rowCount:true,sha256:true,createdAt:true,filters:true}})]));
  const mb=(value:number)=>(value/1_000_000).toFixed(1)+' MB';
  return <>
    <section className="card" id="storage-monitor"><div className="card-title"><h2>พื้นที่ฐานข้อมูลและการเตือนอัตโนมัติ</h2><Badge warning={usage.percent>=80}>{usage.percent.toFixed(1)}%</Badge></div>
      <p>ฐานหลักใช้ประมาณ <strong>{mb(usage.usedBytes)}</strong> จากเกณฑ์ <strong>{mb(usage.limitBytes)}</strong></p>
      <progress className="storage-progress" aria-label="สัดส่วนพื้นที่ฐานหลักที่ใช้" max={100} value={Math.min(100,usage.percent)}/>
      <p className="scope-note">เนื้อไฟล์หลักฐาน {mb(usage.attachments)} · ไฟล์รายงานรวม ZIP อัตโนมัติ {mb(usage.reports)} · ชุดสำรอง {mb(usage.backups)}</p>
      <p className="notice">ตรวจวันละครั้ง แจ้งแอดมินที่ระดับ 80% และ 90% ไม่เกินหนึ่งครั้งต่อระดับในรอบสัปดาห์ เมื่อถึง 90% จะพักสร้าง ZIP อัตโนมัติเพื่อไม่เพิ่มภาระพื้นที่ แอดมินเป็นผู้ดาวน์โหลดและยืนยันลบเอง</p>
      <p className="scope-note">ตัวเลขนี้วัดฐานหลักเทียบกับเกณฑ์ที่ตั้งไว้ โควตา Neon จริงรวมทั้งโปรเจกต์และ branch อื่น ควรตรวจ Dashboard ของ Neon ประกอบ การเก็บ ZIP ค้างไว้ยังใช้พื้นที่ และไม่ได้ทดแทนการเก็บสำรองภายนอก</p>
    </section>
    <section className="card" id="annual-reports"><div className="card-title"><h2>ZIP รายงานอัตโนมัติ · ปี {year.year}</h2><Badge>{process.env.AUTO_ANNUAL_REPORTS_ENABLED==='false'?'ปิดอัตโนมัติ':'เปิดอัตโนมัติ'}</Badge></div>
      <p className="scope-note">หลังสิ้นปีงบประมาณ ระบบสร้าง ZIP รายงาน Excel ปกติและ Dashboard ตามรอบงานรายวัน เก็บแต่ละรุ่นจนแอดมินลบเอง ไม่สร้างซ้ำรุ่นเดิม หากข้อมูลปีเก่าเปลี่ยน ระบบจะสร้างรุ่นใหม่และเก็บรุ่นเดิมไว้ เมื่อมีหลายปีค้าง จะทยอยสร้างรอบละหนึ่งปี</p>
      <p className="notice">ZIP ส่วนนี้มีเฉพาะรายงาน ไม่รวมไฟล์หลักฐาน และใช้กู้คืนฐานข้อมูลไม่ได้ ก่อนล้างข้อมูลปีต้องสร้างชุดสำรองเต็มและทดสอบกู้คืนตามขั้นตอนด้านล่าง</p>
      {!jobs.length&&<p>{day(year.endsOn)>=bangkokToday()?'ปีนี้ยังไม่สิ้นสุด จึงยังไม่สร้าง ZIP อัตโนมัติ':'ยังไม่มี ZIP อัตโนมัติ ระบบจะตรวจในรอบรายวัน หากพื้นที่ถึง 90% งานสร้างจะพักไว้ก่อน'}</p>}
      {jobs.slice(0,30).map(job=>{
        const meta=job.filters&&typeof job.filters==='object'&&!Array.isArray(job.filters)?job.filters:{};
        const location='storageLocation' in meta?String(meta.storageLocation):'';
        return <details className="editor" key={job.id}><summary>รายงานปี {year.year} · รุ่น {job.dataVersion} <Badge success={job.status==='completed'}>{({pending:'รอสร้าง / กำลังสร้าง',completed:'พร้อมดาวน์โหลด',failed:'สร้างไม่สำเร็จ',released:'แอดมินนำไฟล์ออกแล้ว'} as Record<string,string>)[job.status]??job.status}</Badge></summary>
          <p className="scope-note">สร้างรายการ {job.createdAt.toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · ข้อมูล {job.rowCount} รายการ{job.error?' · '+job.error:''}</p>
          {job.sha256&&<p className="scope-note">SHA-256: <code className="long-checksum">{job.sha256}</code></p>}
          {job.status==='completed'&&<><a className="button secondary" href={'/api/admin/annual-reports/'+job.id}>ดาวน์โหลด ZIP รายงานปี {year.year} ↧</a>
            <details className="editor"><summary>ลบ ZIP รายงานนี้เพื่อคืนพื้นที่</summary><p className="notice">ต้องดาวน์โหลดและเก็บภายนอกก่อน การลบส่วนนี้นำเฉพาะ ZIP รายงานออก ข้อมูลอบรมและชุดสำรองเต็มยังอยู่ ระบบจะไม่สร้าง ZIP รุ่นที่ลบนี้กลับมาเอง</p><Form action={`/api/admin/annual-reports/${job.id}/delete`} returnTo={back}><Field name="storageLocation" label="ที่เก็บ ZIP รายงานภายนอก" required maxLength={1000}/><Field name="confirmation" label="พิมพ์ DELETE เพื่อยืนยันลบ ZIP รายงาน" required pattern="DELETE" autoComplete="off"/><Submit danger>ยืนยันลบ ZIP รายงาน</Submit></Form></details>
          </>}
          {job.status==='released'&&<p className="scope-note">ที่เก็บภายนอก: {location||'ดูหลักฐานในประวัติการดำเนินการ'}</p>}
        </details>;
      })}
      <nav className="pagination" aria-label="หน้า ZIP รายงาน">{page>1&&<a href={`${back}&annualPage=${page-1}`}>← ก่อนหน้า</a>}{jobs.length>30&&<a href={`${back}&annualPage=${page+1}`}>ถัดไป →</a>}</nav>
    </section>
  </>;
}
