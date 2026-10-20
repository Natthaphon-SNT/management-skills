@extends('layouts.app')
@section('title','เข้าสู่ระบบ')
@section('content')
<div class="auth-intro"><span class="auth-symbol" aria-hidden="true">F<span>+</span></span><p class="eyebrow">FINANCE DIVISION · RMUTT</p><h1>ระบบบริหารจัดการและติดตามผล<br>การพัฒนาทักษะของบุคลากรกองคลัง</h1><p>มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี</p></div>
<section class="auth-card"><h2>เข้าสู่ระบบ</h2><p class="muted">เข้าสู่พื้นที่การพัฒนาและติดตามผลของคุณ</p><form action="/login" method="post" class="stack">@csrf
<x-input name="username" label="Username" autocomplete="username" :required="true" autofocus />
<x-input name="password" label="Password" type="password" autocomplete="current-password" :required="true" />
<button class="button full" data-busy-label="กำลังเข้าสู่ระบบ…">เข้าสู่ระบบ <span aria-hidden="true">→</span></button></form>
<div class="auth-signup">ยังไม่มีบัญชี? <a href="/register">สมัครสมาชิก</a></div>
@if(app()->environment('local') && config('skills.demo_accounts'))<p class="demo-credentials">บัญชี development/test เท่านั้น<br>USER: <code>user / user</code> · ADMIN: <code>admin / admin</code></p>@endif</section>
<button type="button" class="auth-theme text-button" data-theme-toggle>◐ สลับธีมสว่าง / มืด</button>
@endsection
