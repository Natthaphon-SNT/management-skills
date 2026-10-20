@extends('layouts.app')
@section('title','การอบรมและผลการนำไปใช้')
@section('content')
<div class="page-head"><div><p class="eyebrow">TRAINING & APPLICATION</p><h1>การอบรมและผลการนำไปใช้</h1><p>บันทึกกิจกรรมจริง และกลับมารายงานการนำความรู้ไปใช้ภายหลังได้</p></div><a class="button" href="/trainings/create">＋ บันทึกการอบรม</a></div>
@include('partials.filters')<section class="card"><div class="card-title"><h2>รายการอบรม</h2><span class="badge neutral">{{ $rows->count() }} รายการ</span></div>@include('partials.training-table')</section>
<p class="scope-note">{{ $scopeNote }}</p>@include('partials.export')
@endsection
