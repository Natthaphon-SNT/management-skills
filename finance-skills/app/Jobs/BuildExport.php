<?php
namespace App\Jobs;

use App\Models\User;
use App\Services\{ReportService, ExportService, Records};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

final class BuildExport implements ShouldQueue
{
    use Queueable;
    public int $tries=3; public int $timeout=180;
    public function __construct(public int $exportId) {}
    public function backoff(): array { return [10,60,180]; }

    public function handle(ReportService $reports,ExportService $exports): void
    {
        DB::transaction(function () use($reports,$exports) {
            $job=DB::table('export_jobs')->where('id',$this->exportId)->lockForUpdate()->first(); if(!$job || $job->status==='completed') return;
            $user=User::find($job->user_id); if(!$user?->active || !$user?->approved_at) throw new \RuntimeException('บัญชีไม่มีสิทธิ์ส่งออกแล้ว');
            $year=DB::table('fiscal_years')->where('id',$job->fiscal_year_id)->lockForUpdate()->first();
            if($year->data_version!=$job->data_version) { DB::table('export_jobs')->where('id',$job->id)->update(['status'=>'failed','error'=>'ข้อมูลเปลี่ยนหลังขอส่งออก กรุณาสร้างรายงานใหม่','updated_at'=>now()]); return; }
            $report=$reports->build($user,json_decode($job->filters,true));
            $file=$exports->create($report,$job->kind,$job->format);
            DB::table('export_jobs')->where('id',$job->id)->update([...$file,'status'=>'completed','updated_at'=>now()]);
            Records::audit('export_completed','export_jobs',$job->id,year:$year->id,changes:['row_count'=>$file['row_count'],'sha256'=>$file['sha256']],actor:$user->id);
        });
    }

    public function failed(?\Throwable $e): void
    {
        DB::table('export_jobs')->where('id',$this->exportId)->update(['status'=>'failed','error'=>'สร้างรายงานไม่สำเร็จ กรุณาตรวจ worker และพื้นที่จัดเก็บ แล้วขอส่งออกใหม่','updated_at'=>now()]);
    }
}
