<?php
namespace App\Http\Controllers;

use App\Services\{FiscalCalendar, Records, ReportService};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\{Rule, ValidationException};

final class TrainingController extends Controller
{
    public function index(Request $request, ReportService $reports)
    {
        $report=$reports->build($request->user(),$request->query());
        return $request->expectsJson() || $request->is('api/*') ? response()->json($report) : view('training.index',$report);
    }

    public function form(Request $request, ?int $id=null)
    {
        $record=$id ? Records::participation($id,$request->user()) : null;
        $activity=$record ? DB::table('training_activities')->find($record->training_activity_id) : null;
        $personId=(int)($record?->person_id ?? $request->user()->person_id);
        return view('training.form', ['record'=>$record, 'activity'=>$activity,'personId'=>$personId,
            'people'=>DB::table('personnel')->when($request->user()->role!=='ADMIN',fn($q)=>$q->where('id',$personId))->orderBy('full_name')->get(),
            'years'=>DB::table('fiscal_years')->orderByDesc('year')->get(), 'strategies'=>DB::table('strategies')->where('active',true)->get(),
            'planItems'=>DB::table('plan_items as i')->join('development_plans as p','p.id','=','i.development_plan_id')
                ->when($request->user()->role!=='ADMIN',fn($q)=>$q->where('p.person_id',$personId))->select('i.id','i.topic','p.person_id')->get()]);
    }

    public function save(Request $request, ?int $id=null)
    {
        $old=$id ? Records::participation($id,$request->user()) : null;
        $data=$request->validate(['person_id'=>'required|integer|exists:personnel,id','fiscal_year_id'=>'required|integer|exists:fiscal_years,id',
            'quarter'=>'required|integer|between:1,4','starts_on'=>'required|date_format:Y-m-d','ends_on'=>'required|date_format:Y-m-d|after_or_equal:starts_on',
            'organizer'=>'required|string|max:255','title'=>'required|string|max:255','location'=>'required|string|max:255',
            'category'=>['required',Rule::in(array_keys(config('skills.categories')))], 'other_category'=>'nullable|required_if:category,other|string|max:255',
            'hours'=>'nullable|numeric|min:0|max:10000','strategy_id'=>'nullable|integer|exists:strategies,id','plan_item_id'=>'nullable|integer|exists:plan_items,id',
            'status'=>['required',Rule::in(['planned','completed','cancelled'])],'report_due_on'=>'required|date_format:Y-m-d|after_or_equal:ends_on',
            'exception_reason'=>'nullable|string|max:3000','version'=>'nullable|integer']);
        Records::own($request->user(),(int)$data['person_id']);
        if ($old && $old->person_id != $data['person_id']) throw ValidationException::withMessages(['person_id'=>'ไม่สามารถเปลี่ยนเจ้าของรายการเดิมได้']);
        DB::transaction(function () use ($request,$old,$data,&$id) {
            $yearIds=collect([$old?->fiscal_year_id,$data['fiscal_year_id']])->filter()->unique()->sort();
            foreach ($yearIds as $yearId) Records::year($yearId);
            $year=DB::table('fiscal_years')->find($data['fiscal_year_id']);
            FiscalCalendar::validate($year,(int)$data['quarter'],$data['starts_on'],$data['ends_on'],filled($data['exception_reason']??null));
            if ($data['status']==='completed' && $data['ends_on']>today()->toDateString()) throw ValidationException::withMessages(['status'=>'ยังไม่ถึงวันสิ้นสุดกิจกรรม จึงบันทึกว่าสำเร็จไม่ได้']);
            if (filled($data['plan_item_id']??null)) {
                $plan=DB::table('plan_items as i')->join('development_plans as p','p.id','=','i.development_plan_id')->where('i.id',$data['plan_item_id'])->first();
                if ((int)$plan->person_id !== (int)$data['person_id']) throw ValidationException::withMessages(['plan_item_id'=>'เป้าหมาย IDP ต้องเป็นของเจ้าของกิจกรรม']);
            }
            $assignment=Records::assignment((int)$data['person_id'],$data['starts_on']);
            $activity=collect($data)->only(['fiscal_year_id','quarter','starts_on','ends_on','organizer','title','location','category','other_category','hours','strategy_id','exception_reason'])->all();
            $activity['other_category']=$data['category']==='other' ? $data['other_category'] : null;
            $activity['exception_reviewed_by']=filled($data['exception_reason']??null) && $request->user()->role==='ADMIN' ? $request->user()->id : null;
            $activity['updated_at']=now();
            if ($old) {
                DB::table('training_activities')->where('id',$old->training_activity_id)->update($activity);
                DB::table('training_participations')->where('id',$old->id)->update(['department_id'=>$assignment->department_id,'plan_item_id'=>$data['plan_item_id']??null,'status'=>$data['status'],'report_due_on'=>$data['report_due_on'],'recorded_by'=>$request->user()->id,'updated_at'=>now()]);
                // การเปลี่ยนข้อมูลกิจกรรมถือเป็นสาระสำคัญ ต้องตรวจผลใหม่
                DB::table('application_results')->where('training_participation_id',$old->id)->update(['review_status'=>'pending','version'=>DB::raw('version + 1'),'updated_at'=>now()]);
            } else {
                $activityId=DB::table('training_activities')->insertGetId([...$activity,'created_by'=>$request->user()->id,'created_at'=>now()]);
                $id=DB::table('training_participations')->insertGetId(['training_activity_id'=>$activityId,'person_id'=>$data['person_id'],'department_id'=>$assignment->department_id,'plan_item_id'=>$data['plan_item_id']??null,'status'=>$data['status'],'report_due_on'=>$data['report_due_on'],'recorded_by'=>$request->user()->id,'created_at'=>now(),'updated_at'=>now()]);
            }
            foreach ($yearIds as $yearId) Records::touch($yearId);
            Records::audit($old?'update':'create','training_participations',$id,(int)$data['person_id'],(int)$data['fiscal_year_id'],['before'=>$old ? (array)$old : null,'after'=>$data]);
        });
        return $request->expectsJson() ? response()->json(['id'=>$id],$old?200:201) : redirect('/trainings/'.$id)->with('success','บันทึกการอบรมแล้ว');
    }

    public function show(Request $request,int $id)
    {
        $record=Records::participation($id,$request->user());
        $activity=DB::table('training_activities')->find($record->training_activity_id);
        $result=DB::table('application_results')->where('training_participation_id',$id)->first();
        $data=['record'=>$record,'activity'=>$activity,'result'=>$result,'person'=>DB::table('personnel')->find($record->person_id),
            'department'=>DB::table('departments')->find($record->department_id),
            'attachments'=>DB::table('attachments')->where('training_participation_id',$id)->get(),
            'reviews'=>$result ? DB::table('reviews')->where('application_result_id',$result->id)->orderByDesc('id')->get() : collect()];
        return $request->expectsJson() || $request->is('api/*') ? response()->json($data) : view('training.show',$data);
    }

    public function result(Request $request,int $id)
    {
        $record=Records::participation($id,$request->user());
        $data=$request->validate(['explanation'=>'required|string|max:15000','outcome'=>'required|string|max:15000','reported_on'=>'required|date_format:Y-m-d|before_or_equal:today']);
        if ($data['reported_on'] < $record->ends_on) throw ValidationException::withMessages(['reported_on'=>'วันที่รายงานต้องไม่ก่อนวันสิ้นสุดกิจกรรม']);
        DB::transaction(function () use ($record,$request,$data,$id) {
            Records::year($record->fiscal_year_id);
            $old=DB::table('application_results')->where('training_participation_id',$id)->lockForUpdate()->first();
            $values=[...$data,'review_status'=>'pending','version'=>($old?->version??0)+1,'recorded_by'=>$request->user()->id,'updated_at'=>now()];
            if ($old) DB::table('application_results')->where('id',$old->id)->update($values);
            else DB::table('application_results')->insert([...$values,'training_participation_id'=>$id,'created_at'=>now()]);
            Records::touch($record->fiscal_year_id); Records::audit('report_result','training_participations',$id,$record->person_id,$record->fiscal_year_id,['before'=>$old ? (array)$old : null,'after'=>$values]);
        });
        return back()->with('success','ส่งผลการนำความรู้ไปใช้แล้ว รอ ADMIN ตรวจทาน');
    }

    public function review(Request $request,int $id)
    {
        Records::admin($request->user()); $record=Records::participation($id,$request->user());
        $data=$request->validate(['decision'=>'required|in:verified,changes_requested','comment'=>'required|string|max:5000','result_version'=>'required|integer']);
        DB::transaction(function () use ($record,$request,$data,$id) {
            Records::year($record->fiscal_year_id);
            $result=DB::table('application_results')->where('training_participation_id',$id)->lockForUpdate()->first(); abort_unless($result,404);
            if ($data['result_version'] != $result->version) throw ValidationException::withMessages(['result_version'=>'ผลรายงานเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด']);
            if ($data['decision']==='verified' && $record->status!=='completed') throw ValidationException::withMessages(['decision'=>'ต้องบันทึกการอบรมสำเร็จก่อนตรวจยืนยันผล']);
            DB::table('reviews')->insert(['application_result_id'=>$result->id,'result_version'=>$result->version,'reviewer_id'=>$request->user()->id,'decision'=>$data['decision'],'comment'=>$data['comment'],'reviewed_at'=>now()]);
            DB::table('application_results')->where('id',$result->id)->update(['review_status'=>$data['decision'],'updated_at'=>now()]);
            Records::touch($record->fiscal_year_id); Records::audit('review','application_results',$result->id,$record->person_id,$record->fiscal_year_id,$data);
        });
        return back()->with('success','บันทึกผลการตรวจทานแล้ว');
    }

    public function upload(Request $request,int $id)
    {
        $record=Records::participation($id,$request->user());
        $request->validate(['file'=>'required|file|mimes:pdf,jpg,jpeg,png|max:10240']);
        $file=$request->file('file'); $path=null;
        try {
            DB::transaction(function () use ($record,$file,$request,$id,&$path) {
                Records::year($record->fiscal_year_id); $path=$file->store('evidence','local');
                DB::table('attachments')->insert(['training_participation_id'=>$id,'path'=>$path,'original_name'=>basename($file->getClientOriginalName()),'mime'=>$file->getMimeType(),'size'=>$file->getSize(),'sha256'=>hash_file('sha256',Storage::disk('local')->path($path)),'uploaded_by'=>$request->user()->id,'created_at'=>now(),'updated_at'=>now()]);
                DB::table('application_results')->where('training_participation_id',$id)->update(['review_status'=>'pending','version'=>DB::raw('version + 1'),'updated_at'=>now()]);
                Records::touch($record->fiscal_year_id); Records::audit('upload','training_participations',$id,$record->person_id,$record->fiscal_year_id);
            });
        } catch (\Throwable $e) { if ($path) Storage::disk('local')->delete($path); throw $e; }
        return back()->with('success','แนบหลักฐานแล้ว หากเคยผ่านตรวจ ผลจะกลับไปรอตรวจใหม่');
    }

    public function download(Request $request,int $id)
    {
        $file=DB::table('attachments')->find($id); abort_unless($file,404); Records::participation($file->training_participation_id,$request->user());
        return Storage::disk('local')->download($file->path,$file->original_name,['X-Content-Type-Options'=>'nosniff','Cache-Control'=>'no-store']);
    }
}
