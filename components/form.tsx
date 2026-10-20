import type {InputHTMLAttributes,ReactNode} from 'react';
import {getSession} from '@/lib/auth';
export type Option={value:string|number,label:string,year?:number,person?:string};
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'name'|'defaultValue'|'value'> & {name:string,label:string,value?:string|number|null,options?:Option[]|Record<string,string>,empty?:string|false,textarea?:boolean,children?:ReactNode};
export function Field({name,label,value,options,empty='กรุณาเลือก',textarea,children,...rest}:Props) {
  const id='field-'+name.replace(/[^\w-]/g,'')+'-'+crypto.randomUUID().slice(0,8);
  const optionList:Option[]|null=options?(Array.isArray(options)?options:Object.entries(options).map(([value,label])=>({value,label}))):null;
  return <div className={'field'+(textarea?' wide':'')}><label htmlFor={id}>{label} {rest.required&&<span className="required" aria-hidden="true">*</span>}</label>
    {textarea?<textarea id={id} name={name} defaultValue={value??''} rows={3} required={rest.required} maxLength={rest.maxLength}/>:
      optionList||children?<select id={id} name={name} defaultValue={value??''} required={rest.required} data-person-select={rest['data-person-select' as keyof typeof rest] as string|undefined}>
        {empty!==false&&<option value="">{empty}</option>}{optionList?.map(o=><option key={o.value} value={o.value} data-year={o.year} data-person={o.person}>{o.label}</option>)}{children}</select>:
      <input {...rest} id={id} name={name} defaultValue={rest.type==='password'?'':value??''}/>}</div>;
}
export async function Form({action,returnTo,children,fiscal=false,filter=false,className=''}:{action:string,returnTo?:string,children:ReactNode,fiscal?:boolean,filter?:boolean,className?:string}) {
  const session=await getSession();
  return <form action={action} method={filter?'get':'post'} className={className} data-fiscal-form={fiscal||undefined} data-start={filter?'[name="from"]':undefined} data-end={filter?'[name="to"]':undefined}>
    {!filter&&<input type="hidden" name="csrf" value={session?.csrfToken??''}/>} {returnTo&&<input type="hidden" name="returnTo" value={returnTo}/>} {children}</form>;
}
export const Submit=({children='บันทึกข้อมูล',secondary=false,danger=false,disabled=false}:{children?:ReactNode,secondary?:boolean,danger?:boolean,disabled?:boolean})=><button type="submit" disabled={disabled} className={'button'+(secondary?' secondary':'')+(danger?' danger':'')}>{children}</button>;
export const yesNo={'1':'ใช่ / เปิดใช้งาน','0':'ไม่ / ปิดใช้งาน'};
