<section class="card"><div class="card-title"><div><h2>ส่งออกรายงาน</h2><p>ใช้ตัวกรองและสูตรเดียวกับข้อมูลที่แสดง · รุ่นข้อมูล {{ $year->data_version }}</p></div></div>
<form action="/exports" method="post" class="export-form">@csrf
@foreach($filters as $key=>$value)<input type="hidden" name="{{ $key }}" value="{{ $value }}">@endforeach
<input type="hidden" name="data_version" value="{{ $year->data_version }}">
<x-select name="kind" label="รูปแบบรายงาน" :empty="false" :options="['normal'=>'รายงานปกติ','dashboard'=>'Dashboard พร้อม KPI','idp'=>'แผน IDP และกำหนดการ']" />
<x-select name="format" label="ประเภทไฟล์" :empty="false" :options="['xlsx'=>'Excel (.xlsx)','csv'=>'CSV (.csv)']" />
<button class="button">สร้างไฟล์รายงาน <span aria-hidden="true">↧</span></button></form>
<p class="scope-note">CSV เก็บรูปแบบตาราง ความกว้างคอลัมน์ และกราฟไม่ได้ หากต้องการ Dashboard พร้อมกราฟให้เลือก XLSX</p></section>
