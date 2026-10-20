@props(['name','label','type'=>'text','value'=>null,'required'=>false])
@php($uid=$attributes->get('id') ?? 'field-'.\Illuminate\Support\Str::random(8))
<div class="field">
<label for="{{ $uid }}">{{ $label }} @if($required)<span class="required" aria-hidden="true">*</span>@endif</label>
<input id="{{ $uid }}" name="{{ $name }}" type="{{ $type }}" value="{{ $type==='password' ? '' : old($name,$value) }}" @required($required) {{ $attributes->except('id') }} @error($name) aria-invalid="true" aria-describedby="{{ $uid }}-error" @enderror>
@error($name)<p class="error" id="{{ $uid }}-error">{{ $message }}</p>@enderror
</div>
