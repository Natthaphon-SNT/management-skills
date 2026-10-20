<?php
namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Collection;

final class ReportService
{
    public const NAMES = ['A'=>'ความครอบคลุมการจัดทำ IDP','B'=>'ความครอบคลุมการได้รับการพัฒนา','C'=>'ความสำเร็จตามแผน','D'=>'อัตราการรายงานการนำไปใช้','E'=>'อัตราการนำไปใช้ที่ผ่านการตรวจยืนยัน','F'=>'ชั่วโมงพัฒนาต่อคน'];
    public const FORMULAS = ['A'=>'บุคลากรไม่ซ้ำที่มี IDP ตามสถานะ ÷ บุคลากรในฐานประเมิน × 100','B'=>'บุคลากรไม่ซ้ำที่อบรมสำเร็จตามเงื่อนไข ÷ บุคลากรในฐานประเมิน × 100','C'=>'เป้าหมายไม่ซ้ำที่มีกิจกรรมสำเร็จตามเงื่อนไข ÷ เป้าหมายที่มีกำหนดในช่วงประเมิน × 100','D'=>'รายการที่รายงานผลแล้วและถึงกำหนด ÷ รายการสำเร็จที่ถึงกำหนดรายงาน × 100','E'=>'รายการสำเร็จที่ตรวจยืนยันและผ่านเงื่อนไข ÷ รายการสำเร็จที่มีสิทธิ์ประเมิน × 100','F'=>'ผลรวมชั่วโมงกิจกรรมสำเร็จตามเงื่อนไข ÷ บุคลากรในฐานประเมิน (รวมคนไม่มีชั่วโมง)'];

    public function build(User $user, array $input): array
    {
        $filters=Validator::make($input,[
            'fiscal_year_id'=>'nullable|integer|exists:fiscal_years,id','quarter'=>'nullable|integer|between:1,4',
            'from'=>'nullable|date_format:Y-m-d','to'=>'nullable|date_format:Y-m-d|after_or_equal:from',
            'department_id'=>'nullable|integer|exists:departments,id','person_id'=>'nullable|integer|exists:personnel,id',
            'category'=>'nullable|in:professional,teaching,other','strategy_id'=>'nullable|integer|exists:strategies,id',
            'status'=>'nullable|in:planned,completed,cancelled','review_status'=>'nullable|in:missing,pending,verified,changes_requested',
        ])->validate();
        $filters=array_filter($filters,fn($v)=>$v!==null && $v!=='');
        if ($user->role!=='ADMIN') {
            if (isset($filters['person_id'])) Records::own($user,(int)$filters['person_id']);
            $filters['person_id']=$user->person_id;
        }
        $year=DB::table('fiscal_years')->when(isset($filters['fiscal_year_id']),fn($q)=>$q->where('id',$filters['fiscal_year_id']))->orderByDesc('year')->first();
        abort_unless($year,422,'กรุณาให้ ADMIN สร้างปีงบประมาณก่อน'); $filters['fiscal_year_id']=$year->id;
        [$periodStart,$periodEnd]=FiscalCalendar::bounds($year->year,isset($filters['quarter'])?(int)$filters['quarter']:null);
        $periodStart=max($periodStart,$filters['from']??$periodStart); $periodEnd=min($periodEnd,$filters['to']??$periodEnd);
        $scopes=DB::table('annual_personnel_scopes as s')->join('personnel as p','p.id','=','s.person_id')->join('departments as d','d.id','=','s.department_id')
            ->where('s.fiscal_year_id',$year->id)->where('s.included',true)
            ->when(isset($filters['department_id']),fn($q)=>$q->where('s.department_id',$filters['department_id']))
            ->when(isset($filters['person_id']),fn($q)=>$q->where('s.person_id',$filters['person_id']))
            ->select('s.*','p.full_name','p.code','p.personnel_type','p.position','d.name as department_name')->get();
        $people=$scopes->pluck('person_id');
        $rows=DB::table('training_participations as p')->join('training_activities as a','a.id','=','p.training_activity_id')
            ->join('personnel as n','n.id','=','p.person_id')->join('departments as d','d.id','=','p.department_id')
            ->leftJoin('strategies as st','st.id','=','a.strategy_id')->leftJoin('application_results as r','r.training_participation_id','=','p.id')
            ->where('a.fiscal_year_id',$year->id)->whereIn('p.person_id',$people)->whereBetween('a.starts_on',[$periodStart,$periodEnd])
            ->when(isset($filters['category']),fn($q)=>$q->where('a.category',$filters['category']))
            ->when(isset($filters['strategy_id']),fn($q)=>$q->where('a.strategy_id',$filters['strategy_id']))
            ->when(isset($filters['status']),fn($q)=>$q->where('p.status',$filters['status']))
            ->when(isset($filters['review_status']),function($q) use ($filters) {
                $filters['review_status']==='missing' ? $q->whereNull('r.id') : $q->where('r.review_status',$filters['review_status']);
            })
            ->select('p.*','a.fiscal_year_id','a.quarter','a.starts_on','a.ends_on','a.title','a.organizer','a.category','a.other_category','a.location','a.hours','a.strategy_id','a.exception_reason','a.exception_reviewed_by',
                'n.full_name','n.code','d.name as department_name','st.name as strategy_name','r.explanation','r.outcome','r.reported_on','r.review_status','r.version as result_version')
            ->selectSub(DB::table('attachments')->selectRaw('count(*)')->whereColumn('training_participation_id','p.id'),'evidence_count')
            ->orderByDesc('a.starts_on')->orderByDesc('p.id')->get();
        $plans=DB::table('development_plans')->where('fiscal_year_id',$year->id)->whereIn('person_id',$people)->get();
        $items=DB::table('plan_items as i')->join('development_plans as p','p.id','=','i.development_plan_id')
            ->join('plan_schedules as s','s.plan_item_id','=','i.id')->where('s.fiscal_year_id',$year->id)->whereIn('p.person_id',$people)
            ->when(isset($filters['quarter']),fn($q)=>$q->where('s.quarter',$filters['quarter']))
            ->when(isset($filters['strategy_id']),fn($q)=>$q->where(fn($w)=>$w->where('i.institution_strategy_id',$filters['strategy_id'])->orWhere('i.department_strategy_id',$filters['strategy_id'])))
            ->select('i.*','p.person_id','p.status as plan_status','p.title as plan_title','p.fiscal_year_id as plan_origin_year_id','s.quarter','s.fiscal_year_id as schedule_year_id')->get()
            ->filter(function($item) use($year,$periodStart,$periodEnd) { [$lo,$hi]=FiscalCalendar::bounds($year->year,$item->quarter); return $lo<=$periodEnd && $hi>=$periodStart; });
        $effectiveDepartment=$filters['department_id']??(isset($filters['person_id'])?$scopes->first()?->department_id:null);
        $allDefinitions=DB::table('kpi_definitions as d')->leftJoin('kpi_targets as t','t.kpi_definition_id','=','d.id')
            ->where('d.fiscal_year_id',$year->id)
            ->where('d.effective_on','<=',min(today()->toDateString(),$periodEnd))
            ->select('d.*','t.value as target')->orderByRaw('CASE WHEN d.person_id IS NULL THEN 0 ELSE 1 END DESC')->orderByRaw('CASE WHEN d.department_id IS NULL THEN 0 ELSE 1 END DESC')->orderByDesc('d.version')->get();
        $definitions=$allDefinitions->filter(fn($d)=>(!$d->department_id || $d->department_id==$effectiveDepartment) && (!$d->person_id || $d->person_id==($filters['person_id']??null)))->unique('code')->keyBy('code');
        $complete=$rows->filter(fn($r)=>$r->status==='completed' && (!$r->exception_reason || $r->exception_reviewed_by));
        $kpis=[];
        foreach (self::NAMES as $code=>$name) {
            $def=$definitions->get($code);
            $eligible=$complete->filter(fn($r)=>(!($def?->evidence_required) || $r->evidence_count>0) && (!($def?->verified_required) || $r->review_status==='verified'));
            $planItems=$items->where('plan_status',$def?->idp_status ?? 'approved')->unique('id');
            $due=$complete->where('report_due_on','<=',today()->toDateString());
            [$num,$den]=match($code) {
                'A'=>[$plans->where('status',$def?->idp_status ?? 'approved')->pluck('person_id')->unique()->count(),$scopes->count()],
                'B'=>[$eligible->pluck('person_id')->unique()->count(),$scopes->count()],
                'C'=>[$eligible->whereIn('plan_item_id',$planItems->pluck('id'))->pluck('plan_item_id')->filter()->unique()->count(),$planItems->count()],
                'D'=>[$due->filter(fn($r)=>filled($r->explanation) && filled($r->outcome))->count(),$due->count()],
                'E'=>[$eligible->where('review_status','verified')->count(),$complete->count()],
                'F'=>[$eligible->sum('hours'),$scopes->count()],
            };
            $actual=$den>0 ? round($num/$den*($code==='F'?1:100),2) : null;
            $target=$def && $def->target!==null ? (float)$def->target : null;
            $passed=$actual!==null && $target!==null ? ($def->direction==='at_most' ? $actual<=$target : $actual>=$target) : null;
            $kpis[]=['code'=>$code,'name'=>$def?->name??$name,'formula'=>$def?->formula??self::FORMULAS[$code], 'definition_id'=>$def?->id,'version'=>$def?->version,
                'numerator'=>$num,'denominator'=>$den,'actual'=>$actual,'target'=>$target,'unit'=>$code==='F'?'ชั่วโมง/คน':'%',
                'gap'=>$actual!==null && $target!==null ? round($def->direction==='at_most' ? $target-$actual : $actual-$target,2) : null,
                'attainment'=>$actual!==null && $target!==null && $target>0 ? round($actual/$target*100,2) : null,
                'status'=>$actual===null?'ไม่มีข้อมูลสำหรับประเมิน':($target===null?'ยังไม่ได้กำหนดเป้าหมาย':($passed?'ผ่านเป้าหมาย':'ยังไม่ผ่านเป้าหมาย')),
                'evidence_required'=>(bool)($def?->evidence_required??false),'verified_required'=>(bool)($def?->verified_required??false)];
        }
        $personHours=$scopes->map(function($p) use($complete,$allDefinitions) {
            $def=$allDefinitions->first(fn($d)=>$d->code==='F' && (!$d->person_id || $d->person_id==$p->person_id) && (!$d->department_id || $d->department_id==$p->department_id));
            $eligible=$complete->where('person_id',$p->person_id)->filter(fn($r)=>(!($def?->evidence_required)||$r->evidence_count>0) && (!($def?->verified_required)||$r->review_status==='verified'));
            $hours=(float)$eligible->sum('hours'); $target=$def && $def->target!==null?(float)$def->target:null;
            return ['person_id'=>$p->person_id,'full_name'=>$p->full_name,'department'=>$p->department_name,'hours'=>$hours,'missing_hours'=>$eligible->whereNull('hours')->count(),
                'target'=>$target,'gap'=>$target===null?null:($def->direction==='at_most'?$target-$hours:$hours-$target)];
        });
        $group=fn(string $column)=>$complete->groupBy($column)->map(fn(Collection $g)=>['participations'=>$g->count(),'people'=>$g->pluck('person_id')->unique()->count(),'hours'=>(float)$g->sum('hours')])->all();
        return ['year'=>$year,'filters'=>$filters,'periodStart'=>$periodStart,'periodEnd'=>$periodEnd,'scopes'=>$scopes,'rows'=>$rows,'plans'=>$plans,'items'=>$items->values(), 'kpis'=>$kpis,
            'personHours'=>$personHours,'charts'=>['department'=>$group('department_name'),'quarter'=>$group('quarter'),'category'=>$group('category'),'strategy'=>$group('strategy_name')],
            'summary'=>['population'=>$scopes->count(),'idp_people'=>$plans->pluck('person_id')->unique()->count(),'plans'=>$plans->count(),'plan_items'=>$items->unique('id')->count(),'completed'=>$complete->count(),
                'developed_people'=>$complete->pluck('person_id')->unique()->count(),'missing_result'=>$rows->whereNull('explanation')->count(),'pending'=>$rows->where('review_status','pending')->count(),
                'verified'=>$rows->where('review_status','verified')->count(),'hours'=>(float)$complete->sum('hours'),'missing_hours'=>$complete->whereNull('hours')->count()],
            'lookups'=>['years'=>DB::table('fiscal_years')->orderByDesc('year')->get(),'departments'=>DB::table('departments')->get(),
                'people'=>DB::table('personnel')->when($user->role!=='ADMIN',fn($q)=>$q->where('id',$user->person_id))->orderBy('full_name')->get(),'strategies'=>DB::table('strategies')->get()],
            'scopeNote'=>'ฐานบุคลากรใช้ snapshot ประจำปีและฝ่ายใน snapshot; กิจกรรมจริงนับตามวันที่เริ่ม ไตรมาสหลักมาจากวันที่เริ่ม รวมคนไม่มีบัญชี/ไม่มีอบรมในตัวหาร; ช่วงวันของแผนนับกำหนดไตรมาสที่ทับซ้อน; ตัวกรองประเภท/สถานะกิจกรรมไม่ลดฐานบุคลากร; กิจกรรมข้ามไตรมาสต้องผ่าน ADMIN จึงนับผลสำเร็จ'];
    }
}
