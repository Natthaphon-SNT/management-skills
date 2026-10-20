'use client';
import {useEffect,useRef,useState} from 'react';
import {reportDeadline} from '@/lib/calendar';
export function ReportDeadline({endsOn}:{endsOn?:string}) {
  const ref=useRef<HTMLInputElement>(null),[deadline,setDeadline]=useState(endsOn?reportDeadline(endsOn):'');
  useEffect(()=>{const input=ref.current?.form?.querySelector<HTMLInputElement>('[name="endsOn"]');if(!input)return;const update=()=>setDeadline(input.value?reportDeadline(input.value):'');update();input.addEventListener('input',update);input.addEventListener('change',update);return()=>{input.removeEventListener('input',update);input.removeEventListener('change',update);};},[]);
  return <div className="field"><label htmlFor="report-deadline">กำหนดรายงานผลการนำไปใช้</label><input id="report-deadline" ref={ref} type="date" value={deadline} readOnly aria-describedby="report-deadline-note"/><small id="report-deadline-note">คำนวณอัตโนมัติ: ภายใน 3 วันหลังวันสิ้นสุดการอบรม</small></div>;
}
