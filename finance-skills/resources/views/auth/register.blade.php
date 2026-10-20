@extends('layouts.app')
@section('title','สมัครสมาชิก')
@section('content')
<div class="auth-intro"><p class="eyebrow">FINANCE DIVISION · RMUTT</p><h1>สมัครสมาชิก</h1><p>ระบบพัฒนาทักษะของบุคลากรกองคลัง</p></div>
<section class="auth-card"><p class="notice">ADMIN จะตรวจสอบและเชื่อมบัญชีกับทะเบียนบุคลากร เพื่อป้องกันข้อมูลซ้ำ</p><form action="/register" method="post" class="stack">@csrf
<x-input name="name" label="ชื่อ-นามสกุล" autocomplete="name" :required="true" />
<x-select name="department_id" label="ฝ่าย" :options="$departments->pluck('name','id')" :required="true" />
<x-input name="username" label="Username" autocomplete="username" minlength="3" maxlength="100" :required="true" />
<x-input name="password" label="Password (อย่างน้อย 12 ตัวอักษร)" type="password" minlength="12" autocomplete="new-password" :required="true" />
<x-input name="password_confirmation" label="ยืนยัน Password" type="password" minlength="12" autocomplete="new-password" :required="true" />
<button class="button full">สมัครสมาชิก</button></form><div class="auth-signup"><a href="/login">← กลับไปเข้าสู่ระบบ</a></div></section>
@endsection
