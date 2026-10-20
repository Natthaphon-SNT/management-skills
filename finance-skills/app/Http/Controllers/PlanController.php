<?php
namespace App\Http\Controllers;

use App\Services\Records;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PlanController extends Controller
{
    public function index(Request $request)
    {
        return view('plans.index',['plans'=>DB::table('development_plans as p')->join('personnel as n','n.id','=','p.person_id')->join('fiscal_years as y','y.id','=','p.fiscal_year_id')
            ->when($request->user()->role!=='ADMIN',fn($q)=>$q->where('p.person_id',$request->user()->person_id))->select('p.*','n.full_name','y.year')->orderByDesc('p.id')->get(),
            'years'=>DB::table('fiscal_years')->orderByDesc('year')->get(),'people'=>DB::table('personnel')->when($request->user()->role!=='ADMIN',fn($q)=>$q->where('id',$request->user()->person_id))->get()]);
    }

    public function create(Request $request)
    {
        $data=$request->validate(['person_id'=>'required|integer|exists:personnel,id','fiscal_year_id'=>'required|integer|exists:fiscal_years,id','title'=>'required|string|max:255','source_reference'=>'nullable|string|max:3000','notes'=>'nullable|string|max:5000']);
        Records::own($request->user(),(int)$data['person_id']);
        $id=DB::transaction(function () use ($request,$data) {
            Records::year($data['fiscal_year_id']);
            $id=DB::table('development_plans')->insertGetId([...$data,'created_by'=>$request->user()->id,'status'=>'draft','created_at'=>now(),'updated_at'=>now()]);
            Records::touch($data['fiscal_year_id']); Records::audit('create','development_plans',$id,$data['person_id'],$data['fiscal_year_id'],$data); return $id;
        });
        return redirect('/plans/'.$id)->with('success','สร้างแผนแล้ว เพิ่มเป้าหมายและกำหนดการได้ด้านล่าง');
    }

    private function plan(Request $request,int $id): object {
        $plan=DB::table('development_plans')->find($id); abort_unless($plan,404); Records::own($request->user(),$plan->person_id); return $plan;
    }

    public function show(Request $request,int $id)
    {
        $plan=$this->plan($request,$id);
        $items=DB::table('plan_items')->where('development_plan_id',$id)->get();
        $schedules=DB::table('plan_schedules as s')->join('fiscal_years as y','y.id','=','s.fiscal_year_id')->whereIn('s.plan_item_id',$items->pluck('id'))->select('s.*','y.year')->get()->groupBy('plan_item_id');
        $data=['plan'=>$plan,'items'=>$items,'schedules'=>$schedules,'person'=>DB::table('personnel')->find($plan->person_id),
            'years'=>DB::table('fiscal_years')->orderByDesc('year')->get(),'strategies'=>DB::table('strategies')->where('active',true)->get()];
        return $request->is('api/*') || $request->expectsJson() ? response()->json($data) : view('plans.show',$data);
    }

    public function update(Request $request,int $id)
    {
        $plan=$this->plan($request,$id);
        $data=$request->validate(['title'=>'required|string|max:255','status'=>'required|in:draft,submitted,approved','notes'=>'nullable|string|max:5000','source_reference'=>'nullable|string|max:3000']);
        if ($request->user()->role!=='ADMIN' && $data['status']==='approved') abort(403);
        DB::transaction(function () use ($data,$plan,$id) {
            $years=$this->affectedYears($id,$plan->fiscal_year_id); foreach($years as $year) Records::year($year);
            DB::table('development_plans')->where('id',$id)->update([...$data,'updated_at'=>now()]);
            foreach($years as $year) Records::touch($year);
            Records::audit('update','development_plans',$id,$plan->person_id,$plan->fiscal_year_id,['before'=>(array)$plan,'after'=>$data]);
        }); return back()->with('success','บันทึกแผนแล้ว');
    }

    private function affectedYears(int $id,int $origin): array
    {
        return DB::table('plan_schedules as s')->join('plan_items as i','i.id','=','s.plan_item_id')->where('i.development_plan_id',$id)->pluck('s.fiscal_year_id')->push($origin)->unique()->sort()->all();
    }

    public function saveItem(Request $request,int $id,?int $itemId=null)
    {
        $plan=$this->plan($request,$id);
        $old=$itemId ? DB::table('plan_items')->where('id',$itemId)->where('development_plan_id',$id)->first() : null; if($itemId) abort_unless($old,404);
        $data=$request->validate(['category'=>'required|in:study,promotion,training','topic'=>'required|string|max:255','degree'=>'nullable|required_if:category,study|in:master,doctorate',
            'higher_position'=>'nullable|required_if:category,promotion|string|max:255','planned_application'=>'nullable|string|max:10000','notes'=>'nullable|string|max:5000',
            'institution_strategy_id'=>'nullable|integer|exists:strategies,id','department_strategy_id'=>'nullable|integer|exists:strategies,id',
            'needs_source_review'=>'nullable|boolean','schedules'=>'required|array|min:1|max:40','schedules.*'=>'required|regex:/^\d+:[1-4]$/']);
        foreach (['institution_strategy_id'=>'institution','department_strategy_id'=>'department'] as $key=>$level) if (!empty($data[$key]) && DB::table('strategies')->where('id',$data[$key])->value('level')!==$level) throw ValidationException::withMessages([$key=>'ระดับยุทธศาสตร์ไม่ถูกต้อง']);
        DB::transaction(function () use ($plan,$data,$id,$itemId,$old) {
            $schedules=collect($data['schedules'])->unique()->map(fn($s)=>explode(':',$s));
            $years=collect($this->affectedYears($id,$plan->fiscal_year_id))->merge($schedules->pluck(0))->unique()->sort();
            foreach($years as $year) Records::year((int)$year);
            $values=collect($data)->except('schedules')->all(); $values['needs_source_review']=$data['needs_source_review']??false;
            if ($old) DB::table('plan_items')->where('id',$itemId)->update([...$values,'updated_at'=>now()]);
            else $itemId=DB::table('plan_items')->insertGetId([...$values,'development_plan_id'=>$id,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('plan_schedules')->where('plan_item_id',$itemId)->delete();
            foreach($schedules as [$year,$q]) DB::table('plan_schedules')->insert(['plan_item_id'=>$itemId,'fiscal_year_id'=>(int)$year,'quarter'=>(int)$q]);
            // แก้เป้าหมายในแผนที่อนุมัติแล้ว ต้องส่งกลับให้อนุมัติใหม่
            if($plan->status==='approved') DB::table('development_plans')->where('id',$id)->update(['status'=>'submitted','updated_at'=>now()]);
            foreach($years as $year) Records::touch((int)$year);
            Records::audit($old?'update':'create','plan_items',$itemId,$plan->person_id,$plan->fiscal_year_id,['before'=>$old?(array)$old:null,'after'=>$data]);
        }); return back()->with('success','บันทึกเป้าหมายแล้ว ข้อความในแผนยังไม่ถือเป็นผลการอบรมจริง');
    }
}
