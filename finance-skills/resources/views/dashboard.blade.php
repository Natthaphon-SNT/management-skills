@extends('layouts.app')
@section('title','ภาพรวมและ KPI')
@section('content')
<div class="page-head"><div><p class="eyebrow">DEVELOPMENT OVERVIEW</p><h1>ภาพรวมการพัฒนาบุคลากร</h1><p>{{ auth()->user()->role==='ADMIN'?'ติดตามภาพรวมของกองคลัง':'ติดตามแผนและผลการพัฒนาของคุณ' }} · ปีงบประมาณ {{ $year->year }}</p></div><div class="actions"><a href="#export" class="button secondary">↧ ส่งออกรายงาน</a><a href="/trainings/create" class="button">＋ บันทึกการอบรม</a></div></div>
@include('partials.filters')
<div class="summary-grid">
<article class="metric accent"><span class="metric-label">บุคลากรในขอบเขตประเมิน</span><span class="metric-value">{{ number_format($summary['population']) }}</span><small>คน · รวมผู้ที่ยังไม่มีบัญชีและยังไม่เคยอบรม</small></article>
<article class="metric"><span class="metric-label">ได้รับการพัฒนาแล้ว</span><span class="metric-value">{{ number_format($summary['developed_people']) }} <small>คน</small></span><small>นับบุคลากรไม่ซ้ำจากกิจกรรมสำเร็จ</small></article>
<article class="metric"><span class="metric-label">กิจกรรมอบรมสำเร็จ</span><span class="metric-value">{{ number_format($summary['completed']) }} <small>รายการ</small></span><small>{{ $summary['hours'] }} ชั่วโมง · ไม่ทราบชั่วโมง {{ $summary['missing_hours'] }} รายการ</small></article>
<article class="metric"><span class="metric-label">รอกรอกผลการนำไปใช้</span><span class="metric-value">{{ number_format($summary['missing_result']) }} <small>รายการ</small></span><small>รอตรวจ {{ $summary['pending'] }} · ตรวจยืนยัน {{ $summary['verified'] }}</small></article>
</div>
<div class="section-head"><div><h2>ผลการพัฒนาตามตัวชี้วัด</h2><p>เป้าหมายกำหนดโดย ADMIN · ผลจริงแยกจากผลเทียบเป้าหมาย</p></div><span class="badge neutral">{{ $periodStart }} — {{ $periodEnd }}</span></div>
<div class="kpi-grid">@foreach($kpis as $kpi)<article class="card kpi" data-kpi="{{ $kpi['code'] }}"><div class="kpi-top"><span class="kpi-code">{{ $kpi['code'] }}</span><h3>{{ $kpi['name'] }}</h3></div>
<p class="kpi-number">{{ $kpi['actual']===null?'—':number_format($kpi['actual'],2) }}<small>{{ $kpi['unit'] }}</small></p>
<span @class(['badge','success'=>$kpi['status']==='ผ่านเป้าหมาย','warning'=>$kpi['status']==='ยังไม่ผ่านเป้าหมาย','neutral'=>$kpi['target']===null||$kpi['actual']===null])>{{ $kpi['status'] }}</span>
<dl><dt>เป้าหมาย</dt><dd>{{ $kpi['target']===null?'ยังไม่กำหนด':number_format($kpi['target'],2).' '.$kpi['unit'] }}</dd><dt>ตัวตั้ง / ตัวหาร</dt><dd>{{ $kpi['numerator'] }} / {{ $kpi['denominator'] }}</dd><dt>ช่องว่างตามทิศทาง</dt><dd>{{ $kpi['gap']===null?'—':$kpi['gap'] }}</dd><dt>ผลจริงเทียบเป้าหมาย</dt><dd>{{ $kpi['attainment']===null?'—':$kpi['attainment'].'%' }}</dd></dl>
<p class="formula">{{ $kpi['formula'] }}</p><details><summary>เงื่อนไขและรุ่นนิยาม</summary><p class="scope-note">{{ $kpi['definition_id']?'นิยาม #'.$kpi['definition_id'].' รุ่น '.$kpi['version']:'สูตรตั้งต้น ยังไม่มีเป้าหมายที่หน่วยงานรับรอง' }}<br>หลักฐาน: {{ $kpi['evidence_required']?'ต้องมี':'ไม่บังคับ' }} · ตรวจยืนยัน: {{ $kpi['verified_required']?'ต้องผ่าน':'ไม่บังคับ' }}</p></details></article>@endforeach</div>
<p class="scope-note">{{ $scopeNote }}</p>
<div class="section-head"><div><h2>การพัฒนาในแต่ละมิติ</h2><p>จำนวนรายการสำเร็จตามตัวกรอง · เปรียบเทียบจากข้อมูลจริง</p></div></div>
<div class="chart-grid">@foreach(['department'=>'เปรียบเทียบตามฝ่าย ณ วันอบรม','quarter'=>'เปรียบเทียบตามไตรมาส','category'=>'เปรียบเทียบตามประเภท','strategy'=>'เปรียบเทียบตามยุทธศาสตร์'] as $key=>$label)<section class="card chart-card"><h3>{{ $label }}</h3>
@php($max=max(array_merge([1],array_column($charts[$key],'participations'))))
@forelse($charts[$key] as $group=>$values)@php($text=$key==='category'?config('skills.categories.'.$group):($key==='quarter'?'ไตรมาส '.$group:($group?:'ยังไม่ระบุยุทธศาสตร์')))
<div class="bar-row"><span class="bar-label" title="{{ $text }}">{{ $text }}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:{{ round($values['participations']/$max*100) }}%"></div></div><strong>{{ $values['participations'] }}</strong></div>
@empty<p class="scope-note">ยังไม่มีกิจกรรมสำเร็จในช่วงนี้</p>@endforelse</section>@endforeach</div>
<div class="section-head"><div><h2>แผนและผลการอบรม</h2><p>IDP {{ $summary['idp_people'] }} คน · {{ $summary['plans'] }} แผน · {{ $summary['plan_items'] }} เป้าหมายที่มีกำหนดในช่วงนี้</p></div><a href="/trainings?{{ http_build_query($filters) }}">ดูรายการทั้งหมด →</a></div>
<section class="card">@include('partials.training-table',['rows'=>$rows->take(5)])</section>
<section class="card"><h3>ชั่วโมงพัฒนารายบุคคล</h3><p class="scope-note">แสดงทุกคนในฐานประเมิน รวมผู้ไม่มีชั่วโมง เป้าหมาย KPI F ใช้เทียบรายคนได้จากตัวกรองบุคลากร</p><div class="table-wrap" tabindex="0"><table><thead><tr><th>ชื่อ-นามสกุล</th><th>ฝ่ายในฐานประเมิน</th><th>ชั่วโมง</th><th>รายการไม่ทราบชั่วโมง</th></tr></thead><tbody>@forelse($personHours as $person)<tr><td>{{ $person['full_name'] }}</td><td>{{ $person['department'] }}</td><td>{{ $person['hours'] }}</td><td>{{ $person['missing_hours'] }}</td></tr>@empty<tr><td colspan="4">ไม่มีบุคลากรในฐานประเมินนี้</td></tr>@endforelse</tbody></table></div></section>
<div id="export">@include('partials.export')</div>
@endsection
