<?php
namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;

final class RetentionService
{
    public function preview(int $yearId,?string $at=null): array
    {
        $year=DB::table('fiscal_years')->find($yearId); abort_unless($year,404);
        $policy=DB::table('retention_policies')->where('fiscal_year_id',$yearId)->first();
        $archive=DB::table('archive_manifests')->where('fiscal_year_id',$yearId)->orderByDesc('id')->first();
        $approval=$archive ? DB::table('deletion_approvals')->where('archive_manifest_id',$archive->id)->first() : null;
        $now=$at ? CarbonImmutable::parse($at,'Asia/Bangkok') : CarbonImmutable::now('Asia/Bangkok'); $reasons=[];
        if(!in_array($year->state,['closed','archived'],true)) $reasons[]='ต้องปิดปีหรือย้ายเข้า archive ก่อนลบ';
        if(!$policy || !$policy->due_on || !$policy->approved_at || !$policy->policy_reference || !$policy->type_due_dates) $reasons[]='นโยบายระยะเก็บรักษายังไม่ครบหรือยังไม่อนุมัติ';
        if($policy && ($policy->legal_hold || !$policy->backup_retention_days || !$policy->archive_retention_days)) $reasons[]='มีการพักลบหรือยังไม่กำหนดอายุ backup/archive';
        if($policy?->due_on && $now->lte(CarbonImmutable::parse($policy->due_on,'Asia/Bangkok')->endOfDay()->addDays($policy->grace_days))) $reasons[]='ยังไม่พ้นวันครบกำหนดและระยะผ่อนผัน';
        if(!$archive || !$archive->restore_tested_at || !$archive->received_at || !$archive->received_by) $reasons[]='ต้องสำรอง ทดสอบกู้คืน และยืนยันรับไฟล์';
        if($archive && $archive->data_version!=$year->data_version) $reasons[]='ข้อมูลเปลี่ยนหลังสำรอง ต้องสร้างและทดสอบชุดใหม่';
        if(!$approval || $approval->data_version!=$year->data_version) $reasons[]='ยังไม่มีใบอนุมัติลบที่ตรงกับรุ่นข้อมูลปัจจุบัน';
        if($approval && !DB::table('users')->where('id',$approval->approved_by)->where('role','ADMIN')->where('active',true)->whereNotNull('approved_at')->exists()) $reasons[]='ผู้อนุมัติไม่มีสิทธิ์ ADMIN ที่ใช้งานอยู่';
        if(!DB::table('users')->where('role','ADMIN')->where('active',true)->whereNotNull('approved_at')->whereNotNull('person_id')->exists()) $reasons[]='ไม่มี ADMIN ที่รับผิดชอบ';
        if(DB::table('notifications')->where('fiscal_year_id',$yearId)->where('status','failed')->exists()) $reasons[]='มีการแจ้งเตือนส่งไม่สำเร็จ ต้องตรวจแก้ก่อน';
        if($archive) {
            if(!Storage::disk('local')->exists($archive->path) || hash_file('sha256',Storage::disk('local')->path($archive->path))!==$archive->sha256) $reasons[]='ไม่พบชุดสำรองหรือ checksum ไม่ตรง';
            foreach(json_decode($archive->reports,true) as $file) if(!Storage::disk('local')->exists($file['path']) || hash_file('sha256',Storage::disk('local')->path($file['path']))!==$file['sha256']) $reasons[]='รายงานก่อนลบไม่ครบ';
        }
        $activities=DB::table('training_activities')->where('fiscal_year_id',$yearId)->pluck('id');
        $participants=DB::table('training_participations')->whereIn('training_activity_id',$activities)->pluck('id');
        $plans=DB::table('development_plans')->where('fiscal_year_id',$yearId)->pluck('id');
        $preserved=[]; $deletePlans=[];
        foreach($plans as $plan) {
            $items=DB::table('plan_items')->where('development_plan_id',$plan)->pluck('id');
            $shared=DB::table('plan_schedules')->whereIn('plan_item_id',$items)->where('fiscal_year_id','!=',$yearId)->exists()
                || DB::table('training_participations')->whereIn('plan_item_id',$items)->whereNotIn('training_activity_id',$activities)->exists();
            $shared ? $preserved[]=$plan : $deletePlans[]=$plan;
        }
        return ['year'=>$year,'policy'=>$policy,'archive'=>$archive,'approval'=>$approval,'reasons'=>array_values(array_unique($reasons)),'ready'=>count($reasons)===0,
            'counts'=>['training_activities'=>$activities->count(),'training_participations'=>$participants->count(),'application_results'=>DB::table('application_results')->whereIn('training_participation_id',$participants)->count(),
                'attachments'=>DB::table('attachments')->whereIn('training_participation_id',$participants)->count(),'development_plans'=>count($deletePlans),'preserved_shared_plans'=>count($preserved),'annual_scopes'=>DB::table('annual_personnel_scopes')->where('fiscal_year_id',$yearId)->count()],
            'delete_plan_ids'=>$deletePlans,'preserved_plan_ids'=>$preserved,'activity_ids'=>$activities->all(),'participation_ids'=>$participants->all()];
    }

    public function execute(int $yearId,bool $dryRun=true,?string $at=null,?int $actor=null): array
    {
        if($dryRun) return $this->preview($yearId,$at);
        return DB::transaction(function() use($yearId,$at,$actor) {
            DB::table('fiscal_years')->where('id',$yearId)->lockForUpdate()->first(); $preview=$this->preview($yearId,$at);
            if(!$preview['ready']) throw ValidationException::withMessages(['retention'=>implode(' / ',$preview['reasons'])]);
            $files=DB::table('attachments')->whereIn('training_participation_id',$preview['participation_ids'])->pluck('path');
            $exports=DB::table('export_jobs')->where('fiscal_year_id',$yearId)->whereNotNull('path')->pluck('path');
            DB::table('training_activities')->whereIn('id',$preview['activity_ids'])->delete();
            // ลบเฉพาะกำหนดการปีนี้ คงเป้าหมาย/แผนที่มีปีอื่นใช้อยู่
            DB::table('plan_schedules')->where('fiscal_year_id',$yearId)->delete();
            DB::table('development_plans')->whereIn('id',$preview['delete_plan_ids'])->delete();
            DB::table('annual_personnel_scopes')->where('fiscal_year_id',$yearId)->delete();
            DB::table('kpi_definitions')->where('fiscal_year_id',$yearId)->delete();
            DB::table('export_jobs')->where('fiscal_year_id',$yearId)->delete();
            DB::table('notifications')->where('fiscal_year_id',$yearId)->delete();
            DB::table('audit_logs')->where('fiscal_year_id',$yearId)->update(['changes'=>null]);
            DB::table('fiscal_years')->where('id',$yearId)->update(['state'=>'purged','data_version'=>DB::raw('data_version + 1'),'updated_at'=>now()]);
            Records::audit('purged','fiscal_years',$yearId,year:$yearId,changes:['counts'=>$preview['counts'],'manifest_id'=>$preview['archive']->id],actor:$actor);
            // ให้ job ล้างไฟล์หลัง commit; ถ้าล้มเหลว retry ได้โดยไม่ย้อนธุรกรรมข้อมูล
            \App\Jobs\ErasePrivateFiles::dispatch($files->merge($exports)->unique()->all())->afterCommit();
            return $preview;
        },3);
    }

    public function expireArtifacts(bool $dryRun=true,?string $at=null): array
    {
        $now=$at ? CarbonImmutable::parse($at,'Asia/Bangkok') : CarbonImmutable::now('Asia/Bangkok'); $expired=[];
        foreach(DB::table('archive_manifests')->where('state','!=','expired')->get() as $archive) {
            $year=DB::table('fiscal_years')->find($archive->fiscal_year_id); $policy=DB::table('retention_policies')->where('fiscal_year_id',$year->id)->first();
            if($year->state!=='purged' || !$policy || $policy->legal_hold || !$policy->backup_retention_days || !$policy->archive_retention_days) continue;
            // อายุเริ่มจากวันลบจริง จึงมีเวลาสำรองหลังการลบครบตามนโยบาย
            $purged=DB::table('audit_logs')->where('action','purged')->where('fiscal_year_id',$year->id)->max('created_at'); if(!$purged) continue;
            $backupDue=CarbonImmutable::parse($purged)->addDays($policy->backup_retention_days); $reportDue=CarbonImmutable::parse($purged)->addDays($policy->archive_retention_days);
            if($now->gt($backupDue)) { $expired[]=$archive->path; if(!$dryRun) Storage::disk('local')->delete($archive->path); }
            if($now->gt($reportDue)) foreach(json_decode($archive->reports,true) as $file) { $expired[]=$file['path']; if(!$dryRun) Storage::disk('local')->delete($file['path']); }
            if(!$dryRun && $now->gt($backupDue) && $now->gt($reportDue)) { DB::table('archive_manifests')->where('id',$archive->id)->update(['state'=>'expired','updated_at'=>now()]); Records::audit('archive_expired','archive_manifests',$archive->id,year:$year->id); }
        }
        return $expired;
    }
}
