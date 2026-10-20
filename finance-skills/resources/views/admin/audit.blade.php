@extends('layouts.app')
@section('title','ประวัติการดำเนินการ')
@section('content')
<div class="page-head"><div><p class="eyebrow">AUDIT TRAIL</p><h1>ประวัติการดำเนินการ</h1><p>เจ้าของข้อมูล ผู้ดำเนินการ และการเปลี่ยนแปลงที่ตรวจย้อนกลับได้</p></div></div>
<section class="card">@forelse($logs as $log)<details class="editor"><summary>{{ $log->created_at }} · {{ $log->action }} · {{ $log->entity }} #{{ $log->entity_id }}<br><span class="muted">ผู้ดำเนินการ ID {{ $log->actor_id??'scheduler' }} · เจ้าของบุคลากร ID {{ $log->owner_id??'—' }} · ปี ID {{ $log->fiscal_year_id??'—' }}</span></summary><pre>{{ $log->changes?json_encode(json_decode($log->changes),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE):'ไม่มีรายละเอียดเพิ่มเติม' }}</pre></details>@empty<p class="scope-note">ยังไม่มีประวัติ</p>@endforelse
<div class="pagination">@if($logs->previousPageUrl())<a href="{{ $logs->previousPageUrl() }}">← ก่อนหน้า</a>@endif @if($logs->nextPageUrl())<a href="{{ $logs->nextPageUrl() }}">ถัดไป →</a>@endif</div></section>
@endsection
