@extends('layouts.app')
@section('title','แผนพัฒนารายบุคคล')
@section('content')
<div class="page-head"><div><p class="eyebrow">INDIVIDUAL DEVELOPMENT PLAN</p><h1>แผนพัฒนารายบุคคล</h1><p>แผนการพัฒนาเป็นเป้าหมายที่ตั้งไว้ แยกจากกิจกรรมและผลที่เกิดขึ้นจริง</p></div></div>
<section class="card"><div class="card-title"><h2>แผน IDP</h2><span class="badge neutral">{{ $plans->count() }} แผน</span></div>
@if($plans->isEmpty())<div class="empty"><h3>ยังไม่มีแผนพัฒนา</h3><p>สร้างแผนประจำปี แล้วเพิ่มเป้าหมายศึกษาต่อ ขอตำแหน่ง หรืออบรม</p></div>@else<div class="table-wrap" tabindex="0"><table><thead><tr><th>ปีงบประมาณ</th><th>บุคลากร</th><th>แผน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>@foreach($plans as $plan)<tr><td>{{ $plan->year }}</td><td>{{ $plan->full_name }}</td><td class="course">{{ $plan->title }}</td><td><span class="badge">{{ config('skills.states.'.$plan->status) }}</span></td><td><a href="/plans/{{ $plan->id }}">ดู / แก้ไข →</a></td></tr>@endforeach</tbody></table></div>@endif</section>
<section class="card"><h2>สร้างแผนประจำปี</h2><form action="/plans" method="post" style="margin-top:18px">@csrf<div class="form-grid">
<x-select name="person_id" label="เจ้าของแผน" :options="$people->pluck('full_name','id')" :value="auth()->user()->person_id" :required="true" :empty="false" />
<x-select name="fiscal_year_id" label="ปีงบประมาณของแผน" :options="$years->mapWithKeys(fn($y)=>[$y->id=>$y->year.' · '.$y->state])" :required="true" :empty="false" />
<x-input name="title" label="ชื่อแผน" maxlength="255" :required="true" /><x-input name="source_reference" label="เอกสารต้นทาง / เลขหน้า (ถ้ามี)" maxlength="3000" />
<x-textarea name="notes" label="หมายเหตุ" maxlength="5000" /></div><button class="button" style="margin-top:18px">สร้างแผนและเพิ่มเป้าหมาย →</button></form></section>
@endsection
