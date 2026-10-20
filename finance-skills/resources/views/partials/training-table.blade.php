@if($rows->isEmpty())<div class="empty"><h3>ยังไม่มีรายการในช่วงที่เลือก</h3><p>ปรับตัวกรอง หรือเริ่มบันทึกการอบรมรายการแรก</p><a class="button secondary small" href="/trainings/create" style="margin-top:15px">เพิ่มการอบรม</a></div>
@else<div class="table-wrap" tabindex="0" role="region" aria-label="ตารางการอบรม เลื่อนแนวนอนเพื่อดูข้อมูลเพิ่มเติม"><table><thead><tr>
<th>ไตรมาส / ระยะเวลา</th>@if(auth()->user()->role==='ADMIN')<th>บุคลากร / ฝ่าย</th>@endif<th>หลักสูตร / หน่วยงานที่จัด</th><th>ประเภท / สถานที่</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
@foreach($rows as $row)<tr><td><span class="badge">Q{{ $row->quarter }}</span><small>{{ $row->starts_on }}<br>ถึง {{ $row->ends_on }}</small></td>
@if(auth()->user()->role==='ADMIN')<td>{{ $row->full_name }}<small>{{ $row->department_name }}</small></td>@endif
<td class="course"><strong>{{ $row->title }}</strong><small>{{ $row->organizer }}</small></td>
<td>{{ config('skills.categories.'.$row->category) }}<small>{{ $row->location }}</small></td>
<td><span @class(['badge','success'=>$row->status==='completed','neutral'=>$row->status!=='completed'])>{{ config('skills.states.'.$row->status) }}</span><small><span @class(['badge','warning'=>!$row->review_status,'success'=>$row->review_status==='verified'])>{{ $row->review_status?config('skills.states.'.$row->review_status):'รอกรอกผลการนำไปใช้' }}</span></small></td>
<td><div class="actions"><a href="/trainings/{{ $row->id }}">ดู</a><a href="/trainings/{{ $row->id }}/edit">แก้ไข</a></div></td></tr>@endforeach
</tbody></table></div>@endif
