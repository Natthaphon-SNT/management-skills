@props(['name','label','options'=>[],'value'=>null,'required'=>false,'empty'=>'กรุณาเลือก'])
@php($uid=$attributes->get('id') ?? 'field-'.\Illuminate\Support\Str::random(8))
<div class="field"><label for="{{ $uid }}">{{ $label }} @if($required)<span class="required" aria-hidden="true">*</span>@endif</label>
<select id="{{ $uid }}" name="{{ $name }}" @required($required) {{ $attributes->except('id') }}>
@if($empty!==false)<option value="">{{ $empty }}</option>@endif
@foreach($options as $key=>$text)<option value="{{ $key }}" @selected((string)old($name,$value)===(string)$key)>{{ $text }}</option>@endforeach
{{ $slot }}</select>@error($name)<p class="error">{{ $message }}</p>@enderror</div>
