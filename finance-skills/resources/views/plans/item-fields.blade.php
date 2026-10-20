@php($currentItem=$item??null)
<div class="form-grid">
<x-select name="category" label="หมวดแผน" :options="config('skills.plan_categories')" :value="$currentItem?->category??'training'" :empty="false" :required="true" />
<x-input name="topic" label="หัวข้อ / เป้าหมาย" :value="$currentItem?->topic" maxlength="255" :required="true" />
<x-select name="degree" label="ระดับศึกษาต่อ (เฉพาะหมวดศึกษาต่อ)" :options="['master'=>'ปริญญาโท','doctorate'=>'ปริญญาเอก']" :value="$currentItem?->degree" empty="ไม่เกี่ยวข้อง" />
<x-input name="higher_position" label="ตำแหน่งที่สูงขึ้น (เฉพาะหมวดขอตำแหน่ง)" :value="$currentItem?->higher_position" maxlength="255" />
<x-select name="institution_strategy_id" label="ยุทธศาสตร์สถาบัน" :options="$strategies->where('level','institution')->pluck('name','id')" :value="$currentItem?->institution_strategy_id" empty="ยังไม่ระบุ" />
<x-select name="department_strategy_id" label="ยุทธศาสตร์หน่วยงาน" :options="$strategies->where('level','department')->pluck('name','id')" :value="$currentItem?->department_strategy_id" empty="ยังไม่ระบุ" />
<x-textarea name="planned_application" label="ข้อความการนำความรู้ไปใช้ในแผน / เอกสารต้นทาง (ยังไม่ใช่ผลจริง)" :value="$currentItem?->planned_application" maxlength="10000" />
<x-textarea name="notes" label="หมายเหตุเป้าหมาย" :value="$currentItem?->notes" maxlength="5000" />
</div><fieldset style="border:0;padding:0;margin:22px 0"><legend style="font-size:12px;margin-bottom:10px">ปีงบประมาณและไตรมาสที่วางแผน (เลือกได้หลายปี/ไตรมาส)</legend><div class="check-grid">
@foreach($years as $fy)@for($quarter=1;$quarter<=4;$quarter++)@php($isChecked=$currentItem && ($schedules[$currentItem->id]??collect())->contains(fn($s)=>$s->fiscal_year_id==$fy->id&&$s->quarter==$quarter))
<label class="check-option"><input type="checkbox" name="schedules[]" value="{{ $fy->id }}:{{ $quarter }}" @checked(in_array($fy->id.':'.$quarter,old('schedules',[]))||$isChecked)>{{ $fy->year }} / Q{{ $quarter }}</label>
@endfor @endforeach</div></fieldset>
<label class="check-option"><input type="checkbox" name="needs_source_review" value="1" @checked(old('needs_source_review',$currentItem?->needs_source_review))> ข้อความหรือเครื่องหมายจากเอกสารไม่ชัดเจน ต้องตรวจทานต้นฉบับ</label>
