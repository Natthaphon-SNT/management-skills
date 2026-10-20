@extends('layouts.app')
@section('title','รายละเอียดแผน IDP')
@section('content')
<p class="breadcrumbs"><a href="/plans">แผนพัฒนารายบุคคล</a> / แผน #{{ $plan->id }}</p><div class="page-head"><div><p class="eyebrow">INDIVIDUAL DEVELOPMENT PLAN</p><h1>{{ $plan->title }}</h1><p>{{ $person->full_name }} · แผนและกำหนดการหลายปี</p></div><span class="badge">{{ config('skills.states.'.$plan->status) }}</span></div>
<p class="notice">ข้อความในแผนนี้ยังไม่ถือเป็นการอบรมที่ดำเนินการแล้ว หรือผลการนำความรู้ไปใช้ที่ผ่านตรวจยืนยัน</p>
<section class="card"><h2>ข้อมูลแผน</h2><form action="/plans/{{ $plan->id }}" method="post" style="margin-top:18px">@csrf @method('PUT')<div class="form-grid"><x-input name="title" label="ชื่อแผน" :value="$plan->title" :required="true" maxlength="255" />
<x-select name="status" label="สถานะแผน" :options="auth()->user()->role==='ADMIN'?['draft'=>'ฉบับร่าง','submitted'=>'ส่งแผนแล้ว','approved'=>'อนุมัติแผนแล้ว']:['draft'=>'ฉบับร่าง','submitted'=>'ส่งแผนแล้ว']" :value="$plan->status" :empty="false" :required="true" />
<x-input name="source_reference" label="เอกสารต้นทาง / เลขหน้า" :value="$plan->source_reference" maxlength="3000" /><x-textarea name="notes" label="หมายเหตุแผน" :value="$plan->notes" maxlength="5000" /></div><button class="button secondary" style="margin-top:18px">บันทึกข้อมูลแผน</button></form></section>
<section class="card"><div class="card-title"><h2>เป้าหมายและกำหนดการ</h2><span class="badge neutral">{{ $items->count() }} เป้าหมาย</span></div>
@forelse($items as $item)<details class="editor"><summary><strong>{{ $item->topic }}</strong> · {{ config('skills.plan_categories.'.$item->category) }} @if($item->needs_source_review)<span class="badge warning">รอตรวจต้นฉบับ</span>@endif<br><span class="muted">@foreach($schedules[$item->id]??[] as $s){{ $s->year }}/Q{{ $s->quarter }} @endforeach</span></summary>
<form action="/plans/{{ $plan->id }}/items/{{ $item->id }}" method="post">@csrf @method('PUT')@include('plans.item-fields',['item'=>$item])<button class="button secondary" style="margin-top:18px">บันทึกเป้าหมายนี้</button></form></details>@empty<div class="empty"><h3>ยังไม่มีเป้าหมาย</h3><p>เพิ่มเป้าหมายด้านล่างเพื่อกำหนดปีและไตรมาสดำเนินการ</p></div>@endforelse</section>
<section class="card"><h2>เพิ่มเป้าหมายใหม่</h2><form action="/plans/{{ $plan->id }}/items" method="post" style="margin-top:18px">@csrf @include('plans.item-fields',['item'=>null])<button class="button" style="margin-top:18px">＋ เพิ่มเป้าหมายในแผน</button></form></section>
@endsection
