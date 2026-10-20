<details class="card filter-card" open><summary>ตัวกรองข้อมูล <span class="muted">· ปีงบประมาณ {{ $year->year }}</span></summary>
<form method="get" class="filters" data-fiscal-form data-start="[name='from']" data-end="[name='to']">
<x-select name="fiscal_year_id" label="ปีงบประมาณ" :empty="false" :value="$year->id">
@foreach($lookups['years'] as $fy)<option value="{{ $fy->id }}" data-year="{{ $fy->year }}" @selected($year->id==$fy->id)>{{ $fy->year }} · {{ $fy->state }}</option>@endforeach</x-select>
<x-select name="quarter" label="ไตรมาส" :options="[1=>'ไตรมาส 1 · ต.ค.–ธ.ค.',2=>'ไตรมาส 2 · ม.ค.–มี.ค.',3=>'ไตรมาส 3 · เม.ย.–มิ.ย.',4=>'ไตรมาส 4 · ก.ค.–ก.ย.']" :value="$filters['quarter']??null" empty="ทุกไตรมาส" />
<x-input name="from" label="ตั้งแต่วันที่" type="date" :value="$filters['from']??null" />
<x-input name="to" label="ถึงวันที่" type="date" :value="$filters['to']??null" />
<x-select name="department_id" label="ฝ่ายในฐานประเมิน" :options="$lookups['departments']->pluck('name','id')" :value="$filters['department_id']??null" empty="ทุกฝ่าย" />
@if(auth()->user()->role==='ADMIN')<x-select name="person_id" label="บุคลากร" :options="$lookups['people']->pluck('full_name','id')" :value="$filters['person_id']??null" empty="ทุกคน" />@endif
<x-select name="category" label="ประเภทการพัฒนา" :options="config('skills.categories')" :value="$filters['category']??null" empty="ทุกประเภท" />
<x-select name="strategy_id" label="ยุทธศาสตร์" :options="$lookups['strategies']->pluck('name','id')" :value="$filters['strategy_id']??null" empty="ทุกยุทธศาสตร์" />
<x-select name="status" label="สถานะการอบรม" :options="['planned'=>'วางแผนเข้าร่วม','completed'=>'อบรมสำเร็จ','cancelled'=>'ยกเลิก']" :value="$filters['status']??null" empty="ทุกสถานะ" />
<x-select name="review_status" label="สถานะผลการนำไปใช้" :options="['missing'=>'รอกรอกผลการนำไปใช้','pending'=>'รอตรวจ','verified'=>'ผ่านการตรวจยืนยัน','changes_requested'=>'ขอให้แก้ไข']" :value="$filters['review_status']??null" empty="ทุกสถานะ" />
<div class="wide actions"><button type="submit" class="button small">แสดงข้อมูล</button><a href="{{ request()->url() }}" class="button secondary small">ล้างตัวกรอง</a><p data-date-error class="error" role="alert"></p></div>
</form></details>
