<?php
namespace App\Http\Controllers;

use App\Models\User;
use App\Services\{FiscalCalendar, Records, ReportService};
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\{Rule, ValidationException};

final class AdminController extends Controller
{
    public function index()
    {
        return view('admin.index',[
            'departments'=>DB::table('departments')->get(),'people'=>DB::table('personnel')->orderBy('full_name')->get(),
            'assignments'=>DB::table('personnel_assignments as a')->join('departments as d','d.id','=','a.department_id')->select('a.*','d.name')->orderByDesc('starts_on')->get()->groupBy('person_id'),
            'years'=>DB::table('fiscal_years')->orderByDesc('year')->get(),'strategies'=>DB::table('strategies')->get(),
            'accounts'=>User::orderBy('approved_at')->get(),'kpis'=>DB::table('kpi_definitions as d')->leftJoin('kpi_targets as t','t.kpi_definition_id','=','d.id')->select('d.*','t.value')->orderByDesc('d.id')->get(),
            'scopes'=>DB::table('annual_personnel_scopes as s')->join('personnel as p','p.id','=','s.person_id')->join('departments as d','d.id','=','s.department_id')->join('fiscal_years as y','y.id','=','s.fiscal_year_id')->select('s.*','p.full_name','d.name as department_name','y.year')->orderByDesc('y.year')->get(),
        ]);
    }

    public function year(Request $request)
    {
        $data=$request->validate(['year'=>'required|integer|between:2500,2700|unique:fiscal_years,year']);
        DB::transaction(function () use ($data) {
            [$start,$end]=FiscalCalendar::bounds($data['year']);
            $id=DB::table('fiscal_years')->insertGetId(['year'=>$data['year'],'starts_on'=>$start,'ends_on'=>$end,'created_at'=>now(),'updated_at'=>now()]);
            $this->snapshot($id,$start,$end);
            DB::table('retention_policies')->insert(['fiscal_year_id'=>$id,'notice_days'=>json_encode([30,7,1]),'legal_hold'=>true,'auto_delete'=>false,'created_at'=>now(),'updated_at'=>now()]);
            Records::audit('create','fiscal_years',$id,year:$id,changes:$data);
        }); return back()->with('success','เพิ่มปีงบประมาณและสร้างฐานบุคลากรแล้ว กรุณาตรวจขอบเขตประเมิน');
    }

    private function snapshot(int $id,string $start,string $end): void
    {
        $people=DB::table('personnel')->where('hired_on','<=',$end)->where(fn($q)=>$q->whereNull('left_on')->orWhere('left_on','>=',$start))->get();
        foreach($people as $person) {
            $assignment=DB::table('personnel_assignments')->where('person_id',$person->id)->where('starts_on','<=',$end)->where(fn($q)=>$q->whereNull('ends_on')->orWhere('ends_on','>=',$start))->orderBy('starts_on')->first();
            if(!$assignment) continue;
            DB::table('annual_personnel_scopes')->insertOrIgnore(['fiscal_year_id'=>$id,'person_id'=>$person->id,'department_id'=>$assignment->department_id,'included'=>true,'basis'=>'snapshot ฝ่ายแรกที่มีผลในปี; ผู้เข้าระหว่างปีรวมในฐานประเมิน (ค่าเริ่มต้น ปรับได้)','snapshotted_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
        }
    }

    public function addScope(Request $request,int $id)
    {
        DB::transaction(function () use ($id) {
            $year=Records::year($id); $this->snapshot($id,$year->starts_on,$year->ends_on); Records::touch($id); Records::audit('add_missing_scopes','fiscal_years',$id,year:$id);
        }); return back()->with('success','เพิ่มบุคลากรที่ยังไม่มีในฐานปีนี้ โดยเก็บ snapshot เดิมไว้');
    }

    public function scope(Request $request,int $id)
    {
        $row=DB::table('annual_personnel_scopes')->find($id); abort_unless($row,404);
        $data=$request->validate(['department_id'=>'required|integer|exists:departments,id','included'=>'required|boolean','basis'=>'required|string|max:1000']);
        DB::transaction(function () use ($row,$data,$id) {
            Records::year($row->fiscal_year_id); DB::table('annual_personnel_scopes')->where('id',$id)->update([...$data,'updated_at'=>now()]);
            Records::touch($row->fiscal_year_id); Records::audit('revise_scope','annual_personnel_scopes',$id,$row->person_id,$row->fiscal_year_id,['before'=>(array)$row,'after'=>$data]);
        }); return back()->with('success','แก้ฐานประเมินพร้อมบันทึกเหตุผลแล้ว');
    }

    public function person(Request $request,?int $id=null)
    {
        if($id) abort_unless(DB::table('personnel')->find($id),404);
        $data=$request->validate(['code'=>['required','string','max:100',Rule::unique('personnel','code')->ignore($id)],'full_name'=>'required|string|max:255',
            'personnel_type'=>'nullable|string|max:255','position'=>'nullable|string|max:255','hired_on'=>'required|date_format:Y-m-d',
            'left_on'=>'nullable|date_format:Y-m-d|after_or_equal:hired_on','active'=>'required|boolean','department_id'=>'required|integer|exists:departments,id','effective_on'=>'required|date_format:Y-m-d|after_or_equal:hired_on']);
        DB::transaction(function () use ($id,$data) {
            $values=collect($data)->except(['department_id','effective_on'])->all(); $values['updated_at']=now();
            $old=$id ? DB::table('personnel')->where('id',$id)->lockForUpdate()->first() : null;
            if($id) DB::table('personnel')->where('id',$id)->update($values);
            else $id=DB::table('personnel')->insertGetId([...$values,'created_at'=>now()]);
            $latest=DB::table('personnel_assignments')->where('person_id',$id)->orderByDesc('starts_on')->first();
            if(!$latest || $latest->department_id != $data['department_id']) {
                if($latest && $data['effective_on'] <= $latest->starts_on) throw ValidationException::withMessages(['effective_on'=>'วันย้ายฝ่ายต้องหลังวันเริ่มประวัติฝ่ายล่าสุด']);
                if($latest) DB::table('personnel_assignments')->where('id',$latest->id)->update(['ends_on'=>CarbonImmutable::parse($data['effective_on'])->subDay()->toDateString(),'updated_at'=>now()]);
                DB::table('personnel_assignments')->insert(['person_id'=>$id,'department_id'=>$data['department_id'],'starts_on'=>$data['effective_on'],'created_at'=>now(),'updated_at'=>now()]);
            }
            DB::table('fiscal_years')->increment('data_version'); // ทะเบียนหลักมีผลกับรายงานย้อนหลังและ backup
            Records::audit($old?'update':'create','personnel',$id,$id,changes:['before'=>$old?(array)$old:null,'after'=>$data]);
        }); return back()->with('success','บันทึกทะเบียนแล้ว ฐานประเมินเก่ายังคงฝ่ายตาม snapshot; เพิ่มเข้าฐานรายปีได้จากเมนูปีงบประมาณ');
    }

    public function account(Request $request,int $id)
    {
        $account=User::findOrFail($id);
        $data=$request->validate(['person_id'=>['required','integer','exists:personnel,id',Rule::unique('users','person_id')->ignore($id)],'role'=>'required|in:USER,ADMIN','active'=>'required|boolean','email'=>['nullable','email','max:255',Rule::unique('users','email')->ignore($id)]]);
        DB::transaction(function () use ($account,$data,$request) {
            // ล็อกแอดมินทุกบัญชีเพื่อป้องกันการถอนแอดมินคนสุดท้ายพร้อมกัน
            $admins=User::where('role','ADMIN')->orderBy('id')->lockForUpdate()->get();
            if($account->role==='ADMIN' && ($data['role']!=='ADMIN' || !$data['active']) && $admins->where('active',true)->whereNotNull('approved_at')->count()<=1) throw ValidationException::withMessages(['role'=>'ต้องเหลือ ADMIN ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี']);
            if($account->person_id && (int)$account->person_id !== (int)$data['person_id']) throw ValidationException::withMessages(['person_id'=>'บัญชีที่เชื่อมแล้วไม่สามารถย้ายเจ้าของได้']);
            $account->person_id=$data['person_id']; $account->role=$data['role']; $account->active=(bool)$data['active']; $account->email=$data['email']??null; $account->approved_at??=now(); $account->save();
            Records::audit('approve_or_update_account','users',$account->id,$account->person_id,changes:collect($data)->except('email')->all());
            DB::table('fiscal_years')->increment('data_version');
        }); return back()->with('success','บันทึกบัญชีและสิทธิ์แล้ว');
    }

    public function department(Request $request,?int $id=null)
    {
        $data=$request->validate(['name'=>['required','string','max:255',Rule::unique('departments','name')->ignore($id)],'active'=>'required|boolean']);
        DB::transaction(function () use ($data,$id) {
            if($id) { abort_unless(DB::table('departments')->find($id),404); DB::table('departments')->where('id',$id)->update([...$data,'updated_at'=>now()]); }
            else $id=DB::table('departments')->insertGetId([...$data,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('fiscal_years')->increment('data_version'); Records::audit('save','departments',$id,changes:$data);
        }); return back()->with('success','บันทึกฝ่ายแล้ว');
    }

    public function strategy(Request $request,?int $id=null)
    {
        $data=$request->validate(['name'=>'required|string|max:255','level'=>'required|in:institution,department','active'=>'required|boolean']);
        DB::transaction(function () use ($id,$data) {
            if($id) { $old=DB::table('strategies')->find($id); abort_unless($old,404); if($old->level!==$data['level']) throw ValidationException::withMessages(['level'=>'กรุณาสร้างยุทธศาสตร์ใหม่หากต้องการเปลี่ยนระดับ']); DB::table('strategies')->where('id',$id)->update([...$data,'updated_at'=>now()]); }
            else $id=DB::table('strategies')->insertGetId([...$data,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('fiscal_years')->increment('data_version'); Records::audit('save','strategies',$id,changes:$data);
        }); return back()->with('success','บันทึกยุทธศาสตร์แล้ว');
    }

    public function kpi(Request $request)
    {
        $data=$request->validate(['fiscal_year_id'=>'required|integer|exists:fiscal_years,id','department_id'=>'nullable|integer|exists:departments,id','person_id'=>'nullable|integer|exists:personnel,id',
            'code'=>'required|in:A,B,C,D,E,F','name'=>'required|string|max:255','description'=>'required|string|max:5000','direction'=>'required|in:at_least,at_most',
            'target'=>'nullable|numeric|min:0|max:100000','evidence_required'=>'nullable|boolean','verified_required'=>'nullable|boolean','idp_status'=>'required|in:approved,submitted,draft',
            'effective_on'=>'required|date_format:Y-m-d']);
        if($data['code']!=='F' && !empty($data['person_id'])) throw ValidationException::withMessages(['person_id'=>'เป้าหมายรายบุคคลใช้เฉพาะ KPI F']);
        if($data['code']!=='F' && isset($data['target']) && $data['target']>100) throw ValidationException::withMessages(['target'=>'KPI ร้อยละกำหนดเป้าหมายได้ไม่เกิน 100']);
        DB::transaction(function () use ($data,$request) {
            $year=Records::year($data['fiscal_year_id']);
            if($data['effective_on']<$year->starts_on || $data['effective_on']>$year->ends_on) throw ValidationException::withMessages(['effective_on'=>'วันที่มีผลต้องอยู่ในปีงบประมาณ']);
            $version=(DB::table('kpi_definitions')->where('fiscal_year_id',$year->id)->where('department_id',$data['department_id']??null)->where('person_id',$data['person_id']??null)->where('code',$data['code'])->max('version')??0)+1;
            $id=DB::table('kpi_definitions')->insertGetId([...collect($data)->except('target')->all(),'department_id'=>$data['department_id']??null,
                'evidence_required'=>$data['evidence_required']??false,'verified_required'=>$data['verified_required']??false,'formula'=>ReportService::FORMULAS[$data['code']],
                'unit'=>$data['code']==='F'?'ชั่วโมง/คน':'%','version'=>$version,'defined_by'=>$request->user()->id,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('kpi_targets')->insert(['kpi_definition_id'=>$id,'value'=>$data['target']??null,'created_at'=>now(),'updated_at'=>now()]);
            Records::touch($year->id); Records::audit('version_kpi','kpi_definitions',$id,year:$year->id,changes:$data);
        }); return back()->with('success','บันทึกนิยามและเป้าหมายรุ่นใหม่แล้ว เก็บประวัติรุ่นเดิมไว้');
    }

    public function audit(Request $request)
    {
        return view('admin.audit',['logs'=>DB::table('audit_logs')->when($request->integer('fiscal_year_id'),fn($q)=>$q->where('fiscal_year_id',$request->integer('fiscal_year_id')))->orderByDesc('id')->paginate(50)]);
    }
}
