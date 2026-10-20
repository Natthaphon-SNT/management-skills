@props(['name','label','value'=>null,'required'=>false])
@php($uid='field-'.\Illuminate\Support\Str::random(8))
<div class="field wide"><label for="{{ $uid }}">{{ $label }} @if($required)<span class="required" aria-hidden="true">*</span>@endif</label>
<textarea id="{{ $uid }}" name="{{ $name }}" rows="3" @required($required) {{ $attributes }}>{{ old($name,$value) }}</textarea>
@error($name)<p class="error">{{ $message }}</p>@enderror</div>
