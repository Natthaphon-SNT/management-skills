<?php
namespace Database\Seeders;
use App\Models\User;
use App\Services\FiscalCalendar;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

final class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if(!app()->environment(['local','testing'])) throw new \RuntimeException('ห้าม seed บัญชีทดลองใน staging/production');
        if(User::whereIn('username',['admin','user'])->exists()) return;
        DB::transaction(function() {
            $year=DB::table('fiscal_years')->orderByDesc('year')->first(); $date=$year->starts_on;
            $ids=[];
            foreach([['DEMO-001','ผู้ดูแล ตัวอย่าง','ผู้อำนวยการ'],['DEMO-002','พัฒนา ตัวอย่าง','บัญชี'],['DEMO-003','เรียนรู้ ตัวอย่าง','การเงิน']] as [$code,$name,$deptName]) {
                $dept=DB::table('departments')->where('name',$deptName)->value('id');
                $id=DB::table('personnel')->insertGetId(['code'=>$code,'full_name'=>$name,'personnel_type'=>'ข้อมูลสมมติ','position'=>'เจ้าหน้าที่ (ตัวอย่าง)','hired_on'=>$date,'active'=>true,'created_at'=>now(),'updated_at'=>now()]); $ids[]=$id;
                DB::table('personnel_assignments')->insert(['person_id'=>$id,'department_id'=>$dept,'starts_on'=>$date,'created_at'=>now(),'updated_at'=>now()]);
                DB::table('annual_personnel_scopes')->insert(['fiscal_year_id'=>$year->id,'person_id'=>$id,'department_id'=>$dept,'included'=>true,'basis'=>'ชุดข้อมูลสมมติสำหรับตรวจสูตร','snapshotted_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
            }
            foreach([['admin','ADMIN',$ids[0]],['user','USER',$ids[1]]] as [$username,$role,$pid]) {
                $u=new User; $u->name=DB::table('personnel')->where('id',$pid)->value('full_name'); $u->username=$username; $u->password=$username; $u->role=$role; $u->person_id=$pid; $u->approved_at=now(); $u->save();
            }
            $admin=User::where('username','admin')->first();
            $strategy=DB::table('strategies')->insertGetId(['name'=>'ยุทธศาสตร์ตัวอย่างสำหรับทดสอบ (ยังไม่ใช่ยุทธศาสตร์หน่วยงาน)','level'=>'institution','created_at'=>now(),'updated_at'=>now()]);
            $plan=DB::table('development_plans')->insertGetId(['person_id'=>$ids[1],'fiscal_year_id'=>$year->id,'title'=>'แผนพัฒนาทักษะตัวอย่าง','status'=>'approved','source_reference'=>'ข้อมูลสมมติ ไม่ใช่การถอดข้อมูลจาก PDF','created_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
            $items=[];
            foreach(['AI Skills for All','Microsoft 365'] as $topic) {
                $item=DB::table('plan_items')->insertGetId(['development_plan_id'=>$plan,'category'=>'training','topic'=>$topic,'planned_application'=>'วางแผนใช้เพื่อปรับปรุงงาน (ยังไม่ใช่ผลจริง)','institution_strategy_id'=>$strategy,'created_at'=>now(),'updated_at'=>now()]); $items[]=$item;
                DB::table('plan_schedules')->insert(['plan_item_id'=>$item,'fiscal_year_id'=>$year->id,'quarter'=>1]);
            }
            foreach([['AI กับงานสำนักงาน',6,5],['AI สำหรับจัดการเอกสาร',4,6]] as $index=>[$title,$hours,$offset]) {
                $start=\Carbon\CarbonImmutable::parse($date)->addDays($offset); $finished=$start->lte(today());
                $activity=DB::table('training_activities')->insertGetId(['fiscal_year_id'=>$year->id,'quarter'=>1,'starts_on'=>$start->toDateString(),'ends_on'=>$start->toDateString(),'organizer'=>'หน่วยงานตัวอย่าง','category'=>'professional','title'=>$title,'location'=>'ห้องอบรมตัวอย่าง','hours'=>$hours,'strategy_id'=>$strategy,'created_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
                $part=DB::table('training_participations')->insertGetId(['training_activity_id'=>$activity,'person_id'=>$ids[1],'department_id'=>DB::table('departments')->where('name','บัญชี')->value('id'),'plan_item_id'=>$items[0],'status'=>$finished?'completed':'planned','report_due_on'=>$start->addDays(7)->toDateString(),'recorded_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
                if($index===0 && $finished) {
                    $result=DB::table('application_results')->insertGetId(['training_participation_id'=>$part,'explanation'=>'ตัวอย่าง: ทดลองใช้ช่วยสรุปเอกสารภายใน','outcome'=>'ตัวอย่าง: มีแนวทางตรวจทานเอกสารก่อนใช้งาน','reported_on'=>$start->toDateString(),'review_status'=>'verified','recorded_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
                    DB::table('reviews')->insert(['application_result_id'=>$result,'result_version'=>1,'reviewer_id'=>$admin->id,'decision'=>'verified','comment'=>'ผลสมมติสำหรับทดสอบสูตรเท่านั้น','reviewed_at'=>now()]);
                }
            }
        });
    }
}
