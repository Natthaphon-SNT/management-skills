import type {Actor} from '@/lib/auth';
import type {ReportData,ReportRow} from '@/lib/reports';
import {CATEGORIES,STATES,day} from '@/lib/calendar';
import {Field,Form,Submit} from './form';
export function PageHead({eyebrow,title,description,children}:{eyebrow:string,title:string,description?:string,children?:React.ReactNode}){return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;}
export function Empty({title='ยังไม่มีข้อมูล',description='เริ่มเพิ่มข้อมูล หรือปรับตัวกรองเพื่อแสดงรายการ'}:{title?:string,description?:string}){return <div className="empty"><h3>{title}</h3><p>{description}</p></div>;}
export function Badge({children,success=false,warning=false}:{children:React.ReactNode,success?:boolean,warning?:boolean}){return <span className={'badge'+(success?' success':'')+(warning?' warning':'')}>{children}</span>;}
export async function Filters({report,actor,path}:{report:ReportData,actor:Actor,path:string}) {
  const lookups=report.lookups!;
  return <details className="card filter-card" open><summary>ตัวกรองข้อมูล <span className="muted">· ปีงบประมาณ {report.year.year}</span></summary><Form action={path} filter className="filters">
    <Field name="fiscalYearId" label="ปีงบประมาณ" value={report.year.id} empty={false} options={lookups.years.map(y=>({value:y.id,label:y.year+' · '+STATES[y.state],year:y.year}))}/>
    <Field name="quarter" label="ไตรมาส" empty="ทุกไตรมาส" value={report.filters.quarter} options={{1:'Q1 · ต.ค.–ธ.ค.',2:'Q2 · ม.ค.–มี.ค.',3:'Q3 · เม.ย.–มิ.ย.',4:'Q4 · ก.ค.–ก.ย.'}}/>
    <Field name="departmentId" label="ฝ่ายในฐานประเมิน" empty="ทุกฝ่าย" value={report.filters.departmentId} options={lookups.departments.map(d=>({value:d.id,label:d.name}))}/>
    <Field name="q" label="ค้นหาชื่อ-นามสกุล" value={report.filters.q} placeholder="พิมพ์ชื่อหรือบางส่วนของนามสกุล" type="search" maxLength={255}/>

    <div className="wide actions"><Submit>แสดงข้อมูล</Submit><a href={path} className="button secondary">ล้างตัวกรอง</a><p data-date-error className="error" role="alert"/></div>
  </Form></details>;
}
export async function ExportForm({report}:{report:ReportData}){return <section className="card" id="export"><div className="card-title"><div><h2>ส่งออกรายงาน</h2><p>ใช้ตัวกรองและสูตรเดียวกับข้อมูลที่แสดง · รุ่นข้อมูล {report.year.dataVersion}</p></div></div><Form action="/api/exports" returnTo="/dashboard" className="export-form">{Object.entries(report.filters).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}<input type="hidden" name="dataVersion" value={report.year.dataVersion}/><Field name="kind" label="รูปแบบรายงาน" empty={false} options={{normal:'รายงานปกติ',dashboard:'Dashboard พร้อม KPI'}}/><Field name="format" label="ประเภทไฟล์" empty={false} options={{xlsx:'Excel (.xlsx)',csv:'CSV (.csv)'}}/><Submit>สร้างไฟล์รายงาน ↧</Submit></Form><p className="scope-note">CSV เก็บรูปแบบตาราง ความกว้างคอลัมน์และกราฟไม่ได้ หากต้องการ Dashboard พร้อมกราฟให้เลือก XLSX</p></section>;}
export function TrainingTable({rows,actor}:{rows:ReportRow[],actor:Actor}){
  if(!rows.length)return <Empty title="ยังไม่มีรายการในช่วงที่เลือก" description="ปรับตัวกรอง หรือเริ่มบันทึกการอบรมรายการแรก"/>;
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="ตารางการอบรม เลื่อนแนวนอนเพื่อดูรายละเอียด"><table><thead><tr><th>ไตรมาส / ระยะเวลา</th>{actor.role==='ADMIN'&&<th>บุคลากร / ฝ่าย</th>}<th>หลักสูตร / หน่วยงานที่จัด</th><th>ประเภท / สถานที่</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Badge>Q{row.activity.quarter}</Badge><small>{day(row.activity.startsOn)}<br/>ถึง {day(row.activity.endsOn)}</small></td>{actor.role==='ADMIN'&&<td>{row.person.fullName}<small>{row.department.name}</small></td>}<td className="course"><strong>{row.activity.title}</strong><small>{row.activity.organizer}</small></td><td>{CATEGORIES[row.activity.category as keyof typeof CATEGORIES]}<small>{row.activity.location}</small></td><td><Badge success={row.status==='completed'}>{STATES[row.status]}</Badge><small><Badge success={row.result?.reviewStatus==='verified'} warning={!row.result}>{row.result?STATES[row.result.reviewStatus]:'รอกรอกผลการนำไปใช้'}</Badge></small></td><td><div className="actions"><a href={'/trainings/'+row.id}>ดู</a><a href={'/trainings/'+row.id+'/edit'}>แก้ไข</a></div></td></tr>)}</tbody></table></div>;
}
export const Pagination=({page,hasMore,path}:{page:number,hasMore:boolean,path:string})=><div className="pagination">{page>1&&<a href={path+'?page='+(page-1)}>← ก่อนหน้า</a>}{hasMore&&<a href={path+'?page='+(page+1)}>ถัดไป →</a>}</div>;
