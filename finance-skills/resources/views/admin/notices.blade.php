@extends('layouts.app')
@section('title','การแจ้งเตือน')
@section('content')
<div class="page-head"><div><p class="eyebrow">NOTIFICATIONS</p><h1>การแจ้งเตือนย้อนหลัง</h1><p>ประวัติการส่งในระบบและอีเมลสำหรับบัญชีของคุณ</p></div></div>
<section class="card">@forelse($notices as $notice)<article class="editor" style="border-bottom:1px solid var(--line);padding:16px 0"><span class="badge">{{ $notice->channel }} · {{ $notice->status }}</span><p style="margin-top:10px">{{ $notice->message }}</p><p class="scope-note">ส่ง {{ $notice->attempts }} ครั้ง · {{ $notice->sent_at??'ยังส่งไม่สำเร็จ' }} @if($notice->error) · {{ $notice->error }} @endif</p></article>@empty<div class="empty"><h3>ยังไม่มีการแจ้งเตือน</h3><p>ระบบจะแจ้งตามรอบที่กำหนด โดยไม่ต้องเปิดหน้านี้ค้างไว้</p></div>@endforelse
<div class="pagination">@if($notices->previousPageUrl())<a href="{{ $notices->previousPageUrl() }}">← ก่อนหน้า</a>@endif @if($notices->nextPageUrl())<a href="{{ $notices->nextPageUrl() }}">ถัดไป →</a>@endif</div></section>
@endsection
