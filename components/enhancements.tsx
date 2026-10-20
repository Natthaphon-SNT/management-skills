'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export function Enhancements() {
  const pathname=usePathname();
  useEffect(()=> {
    const abort=new AbortController(),options={signal:abort.signal};
    const fiscalForms=new WeakSet<Element>(),submitForms=new WeakSet<Element>();
    const enhance=()=>{
    document.querySelectorAll<HTMLFormElement>('[data-fiscal-form]').forEach(form=> {
      if(fiscalForms.has(form))return;
      const year=form.querySelector<HTMLSelectElement>('[name="fiscalYearId"]')!,quarter=form.querySelector<HTMLSelectElement>('[name="quarter"]')!;
      const start=form.querySelector<HTMLInputElement>(form.dataset.start??'[name="startsOn"]')!,end=form.querySelector<HTMLInputElement>(form.dataset.end??'[name="endsOn"]')!;
      const exception=form.querySelector<HTMLTextAreaElement>('[name="exceptionReason"]'),category=form.querySelector<HTMLSelectElement>('[name="category"]'),other=form.querySelector<HTMLInputElement>('[name="otherCategory"]');
      if(!year||!quarter||!start||!end)return;
      fiscalForms.add(form);
      const iso=(d:Date)=>d.toISOString().slice(0,10);
      const validate=()=> {
        const fy=Number(year.selectedOptions[0]?.dataset.year),q=Number(quarter.value);let low='',high='',message='';
        if(fy){const month=9+(q?(q-1)*3:0);low=iso(new Date(Date.UTC(fy-544,month,1)));high=iso(new Date(Date.UTC(fy-544,month+(q?3:12),0)));}
        start.min=low;start.max=high;end.min=start.value&&start.value>low?start.value:low;end.max=exception?.value.trim()?'':high;
        if(start.value&&end.value&&end.value<start.value)message='วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
        else if(start.value&&low&&(start.value<low||start.value>high))message='วันที่เริ่มไม่ตรงกับปีงบประมาณ/ไตรมาส กรุณาแก้ไขวันที่';
        else if(end.value&&high&&!exception?.value.trim()&&end.value>high)message='วันที่สิ้นสุดอยู่นอกช่วงที่เลือก กรุณาแก้ไขหรือระบุเหตุผลข้ามไตรมาส';
        end.setCustomValidity(message);const error=form.querySelector('[data-date-error]');if(error)error.textContent=message;
        form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(button=>{button.disabled=!!message;});
        if(category&&other){const visible=category.value==='other';other.required=visible;const wrapper=other.closest<HTMLElement>('[data-other-field]');if(wrapper)wrapper.hidden=!visible;}
      };
      start.addEventListener('change',()=>{if(start.value&&!quarter.value){const [y,m]=start.value.split('-').map(Number),fy=y+543+(m>=10?1:0),match=[...year.options].find(o=>Number(o.dataset.year)===fy);if(match){year.value=match.value;quarter.value=String(Math.floor(((m+2)%12)/3)+1);}}validate();},options);
      [year,quarter,end,exception,category].filter((v):v is HTMLSelectElement|HTMLInputElement|HTMLTextAreaElement=>!!v).forEach(field=>field.addEventListener('input',validate,options));validate();
    });
    document.querySelectorAll<HTMLFormElement>('form:not([data-managed-submit])').forEach(form=>{if(submitForms.has(form))return;submitForms.add(form);form.addEventListener('submit',event=>{if(!form.checkValidity())return;const button=(event as SubmitEvent).submitter as HTMLButtonElement|null;if(button){button.dataset.originalText=button.textContent??'';button.disabled=true;button.textContent='กำลังดำเนินการ…';button.setAttribute('aria-busy','true');}},options);});
    };
    enhance();
    const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});
    const restoreButtons=()=>document.querySelectorAll<HTMLButtonElement>('[data-original-text]').forEach(button=>{button.disabled=false;button.textContent=button.dataset.originalText!;button.removeAttribute('aria-busy');});
    window.addEventListener('pageshow',restoreButtons,options);return()=>{observer.disconnect();abort.abort();};
  },[pathname]);
  return null;
}
export function ThemeButton() {
  return <button type="button" className="icon-button" aria-label="สลับธีมสว่างและมืด" onClick={()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('finance-theme',theme);}catch{}}}>◐</button>;
}
