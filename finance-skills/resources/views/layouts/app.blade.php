<!doctype html><html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="{{ csrf_token() }}">
<title>@yield('title','ภาพรวมการพัฒนา') · กองคลัง RMUTT</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css">
<script src="/js/theme.js"></script><script type="module" src="/js/app.js"></script></head><body>
<a href="#main-content" class="skip-link">ข้ามไปยังเนื้อหา</a>
@auth
@php
$headerPerson=\Illuminate\Support\Facades\DB::table('personnel')->find(auth()->user()->person_id);
$headerDepartment=\Illuminate\Support\Facades\DB::table('personnel_assignments as a')->join('departments as d','d.id','=','a.department_id')->where('a.person_id',auth()->user()->person_id)->where('a.starts_on','<=',today()->toDateString())->where(fn($q)=>$q->whereNull('a.ends_on')->orWhere('a.ends_on','>=',today()->toDateString()))->value('d.name');
@endphp
<div class="app-shell"><aside class="sidebar" aria-label="เมนูหลัก">
<a class="brand" href="/dashboard"><span class="brand-mark" aria-hidden="true">F<span>+</span></span><span>กองคลัง <small>RMUTT · PEOPLE DEVELOPMENT</small></span></a>
<p class="nav-caption">พื้นที่การทำงาน</p><nav>
<a href="/dashboard" @class(['active'=>request()->is('dashboard')])><span aria-hidden="true">▦</span> ภาพรวมและ KPI</a>
<a href="/plans" @class(['active'=>request()->is('plans*')])><span aria-hidden="true">▤</span> แผนพัฒนารายบุคคล</a>
<a href="/trainings" @class(['active'=>request()->is('trainings*')])><span aria-hidden="true">◇</span> การอบรมและผลการนำไปใช้</a>
<a href="/exports" @class(['active'=>request()->is('exports*')])><span aria-hidden="true">↧</span> รายงานส่งออก</a>
@if(auth()->user()->role==='ADMIN')<p class="nav-caption">สำหรับผู้ดูแลระบบ</p>
<a href="/admin" @class(['active'=>request()->is('admin')])><span aria-hidden="true">♧</span> ทะเบียนและการตั้งค่า</a>
<a href="/admin/retention" @class(['active'=>request()->is('admin/retention*')])><span aria-hidden="true">▣</span> จัดเก็บและสำรองรายปี</a>
<a href="/admin/notices" @class(['active'=>request()->is('admin/notices*')])><span aria-hidden="true">◉</span> การแจ้งเตือน</a>
<a href="/admin/audit" @class(['active'=>request()->is('admin/audit*')])><span aria-hidden="true">↺</span> ประวัติการดำเนินการ</a>@endif
</nav><div class="sidebar-note"><span class="online-dot"></span> ระบบพัฒนาทักษะบุคลากร<small>มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี</small></div></aside>
<div class="workspace"><header class="topbar"><div><p class="eyebrow">FINANCE DIVISION</p><p>ระบบบริหารจัดการและติดตามผลการพัฒนาทักษะของบุคลากรกองคลัง</p></div>
<div class="account"><div class="avatar" aria-hidden="true">{{ mb_substr($headerPerson?->full_name??auth()->user()->name,0,1) }}</div><div><strong>{{ $headerPerson?->full_name??auth()->user()->name }}</strong><small>{{ $headerDepartment??'รอระบุฝ่าย' }} · {{ auth()->user()->role }}</small></div>
<button type="button" class="icon-button" data-theme-toggle aria-label="สลับธีมสว่างและมืด">◐</button><form action="/logout" method="post">@csrf<button class="text-button">ออกจากระบบ</button></form></div></header>
<main id="main-content" class="main-content" tabindex="-1">@include('partials.messages')@yield('content')
<footer class="footer">กองคลัง มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี <span>วันที่และเวลาทางธุรกิจ: Asia/Bangkok</span></footer></main></div></div>
@else<main id="main-content" class="auth-page" tabindex="-1">@include('partials.messages')@yield('content')</main>@endauth
</body></html>
