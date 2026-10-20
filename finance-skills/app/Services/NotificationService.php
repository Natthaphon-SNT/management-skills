<?php
namespace App\Services;

use App\Jobs\DeliverNotice;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class NotificationService
{
    public function schedule(?string $date=null,bool $dryRun=false): array
    {
        $today=$date ? CarbonImmutable::parse($date,'Asia/Bangkok')->startOfDay() : CarbonImmutable::now('Asia/Bangkok')->startOfDay();
        $admins=User::where('role','ADMIN')->where('active',true)->whereNotNull('approved_at')->whereNotNull('person_id')->get(); $actions=[];
        foreach(DB::table('fiscal_years')->where('state','!=','purged')->get() as $year) {
            $policy=DB::table('retention_policies')->where('fiscal_year_id',$year->id)->first();
            $days=(int)$today->diffInDays(CarbonImmutable::parse($year->ends_on,'Asia/Bangkok')->startOfDay(),false);
            $noticeDays=$policy ? json_decode($policy->notice_days,true) : [30,7,1];
            if(!in_array($days,$noticeDays,true)) continue;
            $count=DB::table('training_activities')->where('fiscal_year_id',$year->id)->count();
            $message='ปีงบประมาณ '.$year->year.' สิ้นสุด '.$year->ends_on.' เวลา 23:59:59 Asia/Bangkok เหลือ '.$days.' วัน มี '.$count.' กิจกรรม กรุณาตรวจรายงาน ปิดปี สำรองและทดสอบกู้คืน การสิ้นปีไม่ใช่คำสั่งลบข้อมูล';
            if($admins->isEmpty()) {
                $actions[]=['year'=>$year->year,'problem'=>'ไม่มี ADMIN ที่รับผิดชอบ'];
                if(!$dryRun) DB::table('notifications')->insertOrIgnore(['user_id'=>null,'fiscal_year_id'=>$year->id,'idempotency_key'=>'no-admin:'.$year->id.':'.$days,'channel'=>'system','status'=>'failed','message'=>$message,'error'=>'ไม่มี ADMIN ที่รับผิดชอบ ห้ามดำเนินการลบ','created_at'=>now(),'updated_at'=>now()]);
            }
            foreach($admins as $admin) foreach(['in_app','email'] as $channel) {
                $key=implode(':',[$year->id,$days,$admin->id,$channel]); $actions[]=['key'=>$key,'channel'=>$channel,'user_id'=>$admin->id];
                if($dryRun) continue;
                DB::table('notifications')->insertOrIgnore(['user_id'=>$admin->id,'fiscal_year_id'=>$year->id,'idempotency_key'=>$key,'channel'=>$channel,'message'=>$message,'created_at'=>now(),'updated_at'=>now()]);
                $notice=DB::table('notifications')->where('idempotency_key',$key)->first();
                if(in_array($notice->status,['pending','failed'],true)) DeliverNotice::dispatch($notice->id);
            }
        }
        // Retry ที่พ้นวันแจ้งเตือนแล้วก็ยังดำเนินต่อ ไม่ขึ้นกับการเปิดเว็บ
        if(!$dryRun) DB::table('notifications')->whereIn('status',['pending','failed'])->where('channel','!=','system')->where('attempts','<',10)->orderBy('id')->limit(100)->get()->each(fn($n)=>DeliverNotice::dispatch($n->id));
        return $actions;
    }
}
