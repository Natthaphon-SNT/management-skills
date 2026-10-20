<?php
namespace App\Http\Controllers;

use App\Jobs\BuildExport;
use App\Services\{ReportService, Records};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;

final class ExportController extends Controller
{
    public function index(Request $request) { return view('exports',['jobs'=>DB::table('export_jobs')->where('user_id',$request->user()->id)->orderByDesc('id')->paginate(30)]); }
    public function create(Request $request,ReportService $reports)
    {
        $data=$request->validate(['kind'=>'required|in:normal,dashboard,idp','format'=>'required|in:xlsx,csv','data_version'=>'required|integer']);
        if($data['format']==='csv' && $data['kind']==='dashboard') throw ValidationException::withMessages(['format'=>'Dashboard พร้อมกราฟต้องใช้ XLSX; CSV ใช้สำหรับรายการรายละเอียด']);
        $report=$reports->build($request->user(),$request->all());
        $id=DB::transaction(function () use ($report,$request,$data) {
            $year=DB::table('fiscal_years')->where('id',$report['year']->id)->lockForUpdate()->first();
            if($year->data_version!=$data['data_version']) throw ValidationException::withMessages(['data_version'=>'ข้อมูลเปลี่ยนแล้ว กรุณารีเฟรช Dashboard ก่อนส่งออก']);
            $id=DB::table('export_jobs')->insertGetId(['user_id'=>$request->user()->id,'fiscal_year_id'=>$year->id,'kind'=>$data['kind'],'format'=>$data['format'],'filters'=>json_encode($report['filters']),
                'data_version'=>$year->data_version,'created_at'=>now(),'updated_at'=>now()]);
            Records::audit('export_requested','export_jobs',$id,year:$year->id,changes:$data); return $id;
        });
        BuildExport::dispatch($id); return redirect('/exports')->with('success','ส่งคำขอแล้ว ระบบจะสร้างไฟล์ด้วย worker; รีเฟรชหน้านี้เพื่อตรวจสถานะ');
    }
    public function download(Request $request,int $id)
    {
        $job=DB::table('export_jobs')->where('id',$id)->where('user_id',$request->user()->id)->first(); abort_unless($job && $job->status==='completed',404);
        return Storage::disk('local')->download($job->path,'รายงาน-'.$job->kind.'-'.$job->id.'.'.$job->format,['Cache-Control'=>'no-store','X-Content-Type-Options'=>'nosniff']);
    }
}
