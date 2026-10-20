@if(app()->environment('local') && config('skills.demo_accounts'))<div class="demo-banner">สภาพแวดล้อมทดลอง · ข้อมูลบุคลากรและผลตรวจทั้งหมดเป็นข้อมูลสมมติ</div>@endif
@if(session('success'))<div class="alert success" role="status">{{ session('success') }}</div>@endif
@if($errors->any())<div class="alert danger" role="alert"><strong>ยังบันทึกไม่ได้ กรุณาตรวจข้อมูล</strong><ul>@foreach($errors->all() as $message)<li>{{ $message }}</li>@endforeach</ul></div>@endif
