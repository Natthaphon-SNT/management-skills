@extends('layouts.app')
@section('title','รายงานส่งออก')
@section('content')
<div class="page-head"><div><p class="eyebrow">PRIVATE REPORTS</p><h1>รายงานส่งออก</h1><p>ไฟล์รายงานเฉพาะบัญชีของคุณ · งานสร้างไฟล์ทำงานผ่าน worker</p></div><a class="button secondary" href="/exports">↻ รีเฟรชสถานะ</a></div>
<section class="card"><div class="table-wrap" tabindex="0"><table><thead><tr><th>วันที่ขอ</th><th>รายงาน</th><th>สถานะ</th><th>จำนวนแถว</th><th>ดาวน์โหลด</th></tr></thead><tbody>
@forelse($jobs as $job)<tr><td>{{ $job->created_at }}</td><td>{{ ['normal'=>'รายงานปกติ','dashboard'=>'Dashboard + KPI','idp'=>'แผน IDP'][$job->kind] }}<small>{{ strtoupper($job->format) }} · รุ่นข้อมูล {{ $job->data_version }}</small></td><td><span class="badge">{{ ['pending'=>'กำลังรอ worker','completed'=>'สร้างไฟล์แล้ว','failed'=>'สร้างไม่สำเร็จ'][$job->status] }}</span>@if($job->error)<small>{{ $job->error }}</small>@endif</td><td>{{ $job->row_count }}</td><td>@if($job->status==='completed')<a href="/exports/{{ $job->id }}">ดาวน์โหลด ↧</a>@else — @endif</td></tr>@empty<tr><td colspan="5">ยังไม่มีรายงาน สร้างได้จากหน้า Dashboard หรือรายการอบรม</td></tr>@endforelse
</tbody></table></div><div class="pagination">@if($jobs->previousPageUrl())<a href="{{ $jobs->previousPageUrl() }}">← ก่อนหน้า</a>@endif @if($jobs->nextPageUrl())<a href="{{ $jobs->nextPageUrl() }}">ถัดไป →</a>@endif</div></section>
@endsection
