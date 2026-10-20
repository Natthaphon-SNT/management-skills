'use client';
import {useState,type FormEvent} from 'react';
export function FileUpload({participationId,csrf}:{participationId:string,csrf:string}) {
  const [progress,setProgress]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget),file=data.get('file');if(!(file instanceof File))return;
    if(file.size>10*1024*1024){setError('ไฟล์ต้องไม่เกิน 10 MB');return;}
    setBusy(true);setError('');
    const send=async(url:string,body:BodyInit,extra:Record<string,string>={})=>{const response=await fetch(url,{method:'POST',headers:{'x-csrf-token':csrf,...extra},body});const result=await response.json();if(!response.ok)throw new Error(result.error??'อัปโหลดไม่สำเร็จ');return result;};
    try {
      const size=2*1024*1024,chunks=Math.ceil(file.size/size);
      const job=await send(`/api/trainings/${participationId}/uploads`,JSON.stringify({name:file.name,size:file.size,chunks}),{'Content-Type':'application/json'});
      for(let i=0;i<chunks;i++){setProgress(`กำลังอัปโหลดส่วนที่ ${i+1} / ${chunks}`);await send(`/api/uploads/${job.id}/chunks`,file.slice(i*size,(i+1)*size),{'Content-Type':'application/octet-stream','x-chunk-index':String(i)});}
      setProgress('กำลังตรวจและบันทึกไฟล์…');const result=await send(`/api/uploads/${job.id}/finish`,'{}',{'Content-Type':'application/json'});window.location.assign(result.redirect);
    }catch(error){setError(error instanceof Error?error.message:'อัปโหลดไม่สำเร็จ');setBusy(false);setProgress('');}
  }
  return <form onSubmit={submit} className="export-form"><div className="field"><label htmlFor="evidence-file">เลือกหลักฐาน (PDF, JPG, PNG ไม่เกิน 10 MB)</label><input id="evidence-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required disabled={busy}/></div><button type="submit" className="button secondary" disabled={busy}>{busy?'กำลังอัปโหลด…':'แนบหลักฐาน'}</button><p role="status">{progress}</p>{error&&<p className="error" role="alert">{error}</p>}</form>;
}
