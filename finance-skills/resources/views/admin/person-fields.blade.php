@php($personRow=$person??null)
<div class="form-grid"><x-input name="code" label="รหัสบุคลากร" :value="$personRow?->code" maxlength="100" :required="true" />
<x-input name="full_name" label="ชื่อ-นามสกุล" :value="$personRow?->full_name" maxlength="255" :required="true" />
<x-input name="personnel_type" label="ประเภทบุคลากร" :value="$personRow?->personnel_type" maxlength="255" />
<x-input name="position" label="ตำแหน่ง" :value="$personRow?->position" maxlength="255" />
<x-input name="hired_on" label="วันที่เริ่มปฏิบัติงาน" type="date" :value="$personRow?->hired_on" :required="true" />
<x-input name="left_on" label="วันที่สิ้นสุดการปฏิบัติงาน (ถ้ามี)" type="date" :value="$personRow?->left_on" />
<x-select name="active" label="สถานะปฏิบัติงาน" :options="[1=>'ปฏิบัติงาน',0=>'ไม่ปฏิบัติงาน']" :value="(int)($personRow?->active??true)" :empty="false" />
<x-select name="department_id" label="ฝ่ายปัจจุบัน / ฝ่ายที่จะย้าย" :options="$departments->pluck('name','id')" :value="$personRow?($assignments[$personRow->id]??collect())->first()?->department_id:null" :required="true" />
<x-input name="effective_on" label="วันที่เริ่มฝ่าย / วันที่ย้ายมีผล" type="date" :value="$personRow?($assignments[$personRow->id]??collect())->first()?->starts_on:null" :required="true" /></div>
