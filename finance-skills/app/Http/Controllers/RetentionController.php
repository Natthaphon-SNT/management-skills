<?php
namespace App\Http\Controllers;

use App\Services\{Records, RetentionService, ArchiveService};
use App\Jobs\BuildArchive;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;

final class RetentionController extends Controller
{
    public function index(Request $request,RetentionService $retention)
    {
        $years=DB::table('fiscal_years')->orderByDesc('year')->get(); $id=$request->integer('fiscal_year_id') ?: $years->first()?->id; abort_unless($id,422);
        return view('admin.retention',['years'=>$years,'preview'=>$retention->preview($id),'archives'=>DB::table('archive_manifests')->where('fiscal_year_id',$id)->orderByDesc('id')->get(),
            'notices'=>DB::table('notifications')->where('fiscal_year_id',$id)->orderByDesc('id')->get(),'failedJobs'=>DB::table('failed_jobs')->count()]);
    }
    public function policy(Request $request,int $id)
    {
        $data=$request->validate(['type_due_dates'=>'required|array','type_due_dates.plans'=>'required|date_format:Y-m-d','type_due_dates.training'=>'required|date_format:Y-m-d',
            'type_due_dates.results'=>'required|date_format:Y-m-d','type_due_dates.attachments'=>'required|date_format:Y-m-d','grace_days'=>'required|integer|between:0,3650',
            'notice_days'=>'required|string|regex:/^\d+(,\d+)*$/','auto_delete'=>'required|boolean','legal_hold'=>'required|boolean','backup_retention_days'=>'required|integer|between:1,36500',
            'archive_retention_days'=>'required|integer|between:1,36500','policy_reference'=>'required|string|max:5000']);
        DB::transaction(function () use($data,$id,$request) {
            $year=DB::table('fiscal_years')->where('id',$id)->lockForUpdate()->first(); abort_unless($year,404);
            foreach($data['type_due_dates'] as $date) if($date<$year->ends_on) throw ValidationException::withMessages(['type_due_dates'=>'กำหนดเก็บรักษาต้องไม่ก่อนสิ้นปี']);
            $values=[...$data,'type_due_dates'=>json_encode($data['type_due_dates']),'due_on'=>max($data['type_due_dates']),
                'notice_days'=>json_encode(array_values(array_unique(array_map('intval',explode(',',$data['notice_days']))))),
                'approved_by'=>$request->user()->id,'approved_at'=>now(),'updated_at'=>now()];
            DB::table('retention_policies')->updateOrInsert(['fiscal_year_id'=>$id],$values); Records::touch($id); Records::audit('approve_policy','retention_policies',$id,year:$id,changes:$data);
        }); return back()->with('success','บันทึกนโยบายแล้ว ระบบเก็บชุดข้อมูลที่สัมพันธ์กันจนพ้นวันครบกำหนดทุกประเภท');
    }
    public function state(Request $request,int $id)
    {
        $data=$request->validate(['state'=>'required|in:open,closed,archived']);
        DB::transaction(function () use($id,$data) {
            $year=DB::table('fiscal_years')->where('id',$id)->lockForUpdate()->first(); abort_unless($year,404);
            if($year->state==='purged') throw ValidationException::withMessages(['state'=>'เปิดปีที่ลบข้อมูลแล้วไม่ได้ ให้กู้จาก backup ในระบบแยก']);
            DB::table('fiscal_years')->where('id',$id)->update([...$data,'data_version'=>$year->data_version+1,'updated_at'=>now()]); Records::audit('change_year_state','fiscal_years',$id,year:$id,changes:$data);
        }); return back()->with('success','เปลี่ยนสถานะปีแล้ว การปิดปี/ย้ายเข้า archive ยังไม่ลบข้อมูล');
    }
    public function create(Request $request,int $id) { BuildArchive::dispatch($id,$request->user()->id); return back()->with('success','ส่งงานสร้างชุดสำรองและรายงานให้ worker แล้ว'); }
    public function download(int $id) {
        $archive=DB::table('archive_manifests')->find($id); abort_unless($archive,404); Records::audit('download_archive','archive_manifests',$id,year:$archive->fiscal_year_id);
        return Storage::disk('local')->download($archive->path,'backup-'.$archive->fiscal_year_id.'-'.$id.'.zip',['Cache-Control'=>'no-store']);
    }
    public function verify(int $id,ArchiveService $archives) {
        try { $archives->verifyAndRestore($id); } catch(\Throwable $e) { report($e); throw ValidationException::withMessages(['restore'=>'ทดสอบกู้คืนไม่สำเร็จ ตรวจ RESTORE_DB_DATABASE ว่าเป็นฐานว่างแยก และตรวจ storage/logs']); }
        return back()->with('success','กู้คืนลงฐานแยกและตรวจทุกแถว/ไฟล์ผ่านแล้ว ต้องล้างเฉพาะฐานทดสอบนี้โดยผู้ดูแลก่อนทดสอบรอบถัดไป');
    }
    public function receive(Request $request,int $id)
    {
        $request->validate(['confirmation'=>'required|accepted']);
        DB::transaction(function () use($id,$request) {
            $archive=DB::table('archive_manifests')->where('id',$id)->lockForUpdate()->first(); abort_unless($archive,404);
            $year=DB::table('fiscal_years')->where('id',$archive->fiscal_year_id)->lockForUpdate()->first();
            if(!$archive->restore_tested_at || $archive->data_version!=$year->data_version) throw ValidationException::withMessages(['backup'=>'ต้องทดสอบกู้คืนชุดที่ตรงกับข้อมูลล่าสุดก่อน']);
            DB::table('archive_manifests')->where('id',$id)->update(['received_by'=>$request->user()->id,'received_at'=>now(),'state'=>'received','updated_at'=>now()]);
            Records::audit('archive_received','archive_manifests',$id,year:$year->id);
        }); return back()->with('success','บันทึกการยืนยันรับและตรวจไฟล์แล้ว');
    }
    public function approve(Request $request,int $id)
    {
        $data=$request->validate(['confirmation'=>'required|accepted','comment'=>'required|string|max:5000']);
        DB::transaction(function () use($id,$request,$data) {
            $archive=DB::table('archive_manifests')->find($id); abort_unless($archive,404);
            $year=DB::table('fiscal_years')->where('id',$archive->fiscal_year_id)->lockForUpdate()->first();
            if(!$archive->restore_tested_at || !$archive->received_at || $year->data_version!=$archive->data_version) throw ValidationException::withMessages(['approval'=>'ชุดสำรองยังไม่ผ่านขั้นตอนหรือล้าสมัย']);
            DB::table('deletion_approvals')->updateOrInsert(['archive_manifest_id'=>$id],['data_version'=>$year->data_version,'approved_by'=>$request->user()->id,'approved_at'=>now(),'comment'=>$data['comment'],'created_at'=>now(),'updated_at'=>now()]);
            Records::audit('approve_deletion','archive_manifests',$id,year:$year->id,changes:['data_version'=>$year->data_version]);
        }); return back()->with('success','อนุมัติชุดข้อมูลนี้แล้ว การลบยังต้องผ่านนโยบาย วันครบกำหนด และเงื่อนไขทั้งหมด');
    }
    public function execute(Request $request,int $id,RetentionService $retention)
    {
        $year=DB::table('fiscal_years')->find($id); abort_unless($year,404);
        $request->validate(['confirmation'=>['required',\Illuminate\Validation\Rule::in(['ลบปี '.$year->year])]]);
        $retention->execute($id,false,actor:$request->user()->id); return back()->with('success','ลบเฉพาะข้อมูลของปีตามรายการที่ตรวจแล้ว งานล้างไฟล์ทำต่อใน worker');
    }
    public function notices(Request $request)
    {
        return view('admin.notices',['notices'=>DB::table('notifications')->where('user_id',$request->user()->id)->orderByDesc('id')->paginate(50)]);
    }
    public function noticesCsv(Request $request)
    {
        $data=$request->validate(['fiscal_year_id'=>'required|integer|exists:fiscal_years,id']);
        Records::audit('export_notifications','fiscal_years',$data['fiscal_year_id'],year:$data['fiscal_year_id']);
        return response()->streamDownload(function() use($data) {
            $f=fopen('php://output','w'); fwrite($f,"\xEF\xBB\xBF"); fputcsv($f,['ช่องทาง','สถานะ','ข้อความ','ครั้งที่ส่ง','เวลาส่ง','ปัญหา'],',','"','');
            foreach(DB::table('notifications')->where('fiscal_year_id',$data['fiscal_year_id'])->orderBy('id')->cursor() as $n) fputcsv($f,array_map([\App\Services\ExportService::class,'safeCell'],[$n->channel,$n->status,$n->message,$n->attempts,$n->sent_at,$n->error]),',','"',''); fclose($f);
        },'notifications-'.$data['fiscal_year_id'].'.csv',['Content-Type'=>'text/csv; charset=UTF-8','Cache-Control'=>'no-store']);
    }
}
