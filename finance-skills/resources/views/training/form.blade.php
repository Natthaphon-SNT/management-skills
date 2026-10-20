@extends('layouts.app')
@section('title',$record?'แก้ไขการอบรม':'บันทึกการอบรม')
@section('content')
<p class="breadcrumbs"><a href="/trainings">การอบรม</a> / {{ $record?'แก้ไขรายการ':'บันทึกรายการใหม่' }}</p>
<div class="page-head"><div><p class="eyebrow">TRAINING RECORD</p><h1>{{ $record?'แก้ไขการอบรม':'บันทึกการอบรม' }}</h1><p>ผลการนำความรู้ไปใช้กรอกภายหลังได้ โดยไม่บังคับในขั้นตอนนี้</p></div></div>
<section class="card"><form action="{{ $record?'/trainings/'.$record->id:'/trainings' }}" method="post" data-fiscal-form>@csrf @if($record)@method('PUT')@endif
<div class="form-grid"><x-select name="person_id" label="เจ้าของรายการ" :options="$people->pluck('full_name','id')" :value="$personId" :required="true" :empty="false" data-person-select />
<x-select name="fiscal_year_id" label="ปีงบประมาณ" :empty="false" :required="true">@foreach($years as $fy)<option value="{{ $fy->id }}" data-year="{{ $fy->year }}" @selected(old('fiscal_year_id',$activity?->fiscal_year_id??$years->first()->id)==$fy->id)>{{ $fy->year }} · {{ $fy->state }}</option>@endforeach</x-select>
<x-select name="quarter" label="ไตรมาส" :options="[1=>'Q1 · ต.ค.–ธ.ค.',2=>'Q2 · ม.ค.–มี.ค.',3=>'Q3 · เม.ย.–มิ.ย.',4=>'Q4 · ก.ค.–ก.ย.']" :value="$activity?->quarter" :required="true" empty="เลือกไตรมาส หรือเลือกวันเริ่มก่อน" />
<x-select name="status" label="สถานะการอบรม" :options="['planned'=>'วางแผนเข้าร่วม','completed'=>'อบรมสำเร็จ','cancelled'=>'ยกเลิก']" :value="$record?->status??'planned'" :required="true" :empty="false" />
<x-input name="starts_on" label="วันที่เริ่ม" type="date" :value="$activity?->starts_on" :required="true" />
<x-input name="ends_on" label="วันที่สิ้นสุด" type="date" :value="$activity?->ends_on" :required="true" />
<p data-date-error class="error wide" role="alert"></p>
<x-input name="organizer" label="หน่วยงานที่จัด" :value="$activity?->organizer" maxlength="255" :required="true" />
<x-select name="category" label="ประเภทการพัฒนา" :options="config('skills.categories')" :value="$activity?->category??'professional'" :required="true" :empty="false" />
<div data-other-field class="wide"><x-input name="other_category" label="ระบุประเภทอื่น ๆ" :value="$activity?->other_category" maxlength="255" /></div>
<x-input name="title" label="หลักสูตร / หัวข้อ" :value="$activity?->title" maxlength="255" :required="true" />
<x-input name="location" label="สถานที่สัมมนา" :value="$activity?->location" maxlength="255" :required="true" />
<x-input name="hours" label="ชั่วโมงอบรม (ถ้าทราบ)" type="number" min="0" max="10000" step="0.01" :value="$activity?->hours" />
<x-input name="report_due_on" label="กำหนดรายงานผลการนำไปใช้" type="date" :value="$record?->report_due_on??today()->addDays(config('skills.report_due_days'))->toDateString()" :required="true" />
<x-select name="plan_item_id" label="เป้าหมาย IDP ที่เกี่ยวข้อง" :value="$record?->plan_item_id" empty="กิจกรรมนอกแผน">@foreach($planItems as $item)<option value="{{ $item->id }}" data-person="{{ $item->person_id }}" @selected(old('plan_item_id',$record?->plan_item_id)==$item->id)>{{ $item->topic }} (#{{ $item->id }})</option>@endforeach</x-select>
<x-select name="strategy_id" label="ยุทธศาสตร์ที่เกี่ยวข้อง" :options="$strategies->pluck('name','id')" :value="$activity?->strategy_id" empty="ยังไม่ระบุ" />
<x-textarea name="exception_reason" label="เหตุผลกรณีข้อมูลเก่าหรืออบรมข้ามไตรมาส (ถ้ามี)" :value="$activity?->exception_reason" maxlength="3000" />
</div><p class="scope-note">ฝ่ายจะอ้างอิงประวัติที่มีผล ณ วันเริ่มอบรม ระบบใช้ไตรมาสหลักจากวันเริ่ม กรณีข้ามไตรมาสจะยังไม่นับผลสำเร็จจนกว่า ADMIN จะตรวจทานและบันทึกรายการนี้ · ค่าเริ่มต้นกำหนดรายงาน {{ config('skills.report_due_days') }} วันเป็นค่าระบบ ปรับได้ ไม่ใช่เกณฑ์ราชการ</p>
<div class="form-actions"><button type="submit" class="button">บันทึกการอบรม</button><a class="button secondary" href="/trainings">ยกเลิก</a></div></form></section>
@endsection
