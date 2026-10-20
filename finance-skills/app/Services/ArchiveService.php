<?php
namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\{Artisan, DB, Storage};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use ZipArchive;

final class ArchiveService
{
    // เรียงตาม foreign keys เพื่อกู้ข้อมูลบนฐานว่างได้โดยไม่ปิด constraint
    public const TABLES=['departments','personnel','personnel_assignments','users','fiscal_years','annual_personnel_scopes','strategies','development_plans','plan_items','plan_schedules',
        'training_activities','training_participations','application_results','reviews','attachments','kpi_definitions','kpi_targets','export_jobs','notifications','retention_policies','archive_manifests','deletion_approvals','audit_logs'];

    public function create(int $yearId,User $actor): int
    {
        Records::admin($actor);
        return DB::transaction(function () use($yearId,$actor) {
            $years=DB::table('fiscal_years')->orderBy('id')->lockForUpdate()->get(); $year=$years->firstWhere('id',$yearId); abort_unless($year,404);
            if($year->state==='purged') throw ValidationException::withMessages(['year'=>'ปีนี้ลบข้อมูลไปแล้ว']);
            $report=app(ReportService::class)->build($actor,['fiscal_year_id'=>$yearId]);
            $reports=[]; foreach(['normal','dashboard','idp'] as $kind) $reports[$kind]=app(ExportService::class)->create($report,$kind,'xlsx');
            $data=[]; $counts=[]; foreach(self::TABLES as $table) { $data[$table]=DB::table($table)->orderBy('id')->get()->map(fn($r)=>(array)$r)->all(); $counts[$table]=count($data[$table]); }
            $files=DB::table('attachments')->pluck('sha256','path')->all();
            foreach(DB::table('export_jobs')->where('status','completed')->whereNotNull('path')->get() as $job) $files[$job->path]=$job->sha256;
            foreach($reports as $file) $files[$file['path']]=$file['sha256'];
            $manifest=['schema_version'=>$this->schemaVersion(),'created_at'=>now()->toIso8601String(),'year_id'=>$yearId,'data_version'=>$year->data_version,'counts'=>$counts,'files'=>$files,
                'backup_scope'=>'full-domain-database-and-evidence-and-reports; sessions/cache/queue are rebuilt; previous archive binaries require the separate backup repository'];
            $path='archives/'.Str::uuid().'.zip'; Storage::disk('local')->makeDirectory('archives');
            $zip=new ZipArchive(); if($zip->open(Storage::disk('local')->path($path),ZipArchive::CREATE)!==true) throw new \RuntimeException('สร้างชุดสำรองไม่ได้');
            $zip->addFromString('data.json',json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
            $manifest['data_sha256']=hash('sha256',json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
            $zip->addFromString('manifest.json',json_encode($manifest,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
            foreach($files as $file=>$hash) {
                $this->safePath($file);
                if(!Storage::disk('local')->exists($file) || hash_file('sha256',Storage::disk('local')->path($file))!==$hash) throw new \RuntimeException('ไฟล์ประกอบไม่ครบหรือ checksum ไม่ตรง ห้ามใช้ชุดสำรองนี้');
                $zip->addFile(Storage::disk('local')->path($file),'files/'.$file);
            }
            $zip->close();
            $id=DB::table('archive_manifests')->insertGetId(['fiscal_year_id'=>$yearId,'data_version'=>$year->data_version,'schema_version'=>$manifest['schema_version'],'path'=>$path,
                'sha256'=>hash_file('sha256',Storage::disk('local')->path($path)),'counts'=>json_encode($counts),'reports'=>json_encode($reports),'created_by'=>$actor->id,'created_at'=>now(),'updated_at'=>now()]);
            Records::audit('archive_created','archive_manifests',$id,year:$yearId,actor:$actor->id); return $id;
        },3);
    }

    public function schemaVersion(): string { return hash('sha256',implode('|',DB::table('migrations')->orderBy('migration')->pluck('migration')->all())); }
    private function safePath(string $path): void {
        if(!preg_match('#^(evidence|exports)/[a-zA-Z0-9._/-]+$#',$path) || str_contains($path,'..')) throw new \RuntimeException('เส้นทางไฟล์สำรองไม่ถูกต้อง');
    }

    public function verifyAndRestore(int $id): void
    {
        $archive=DB::table('archive_manifests')->find($id); abort_unless($archive,404);
        $restoreConfig=config('database.connections.restore'); $main=config('database.connections.'.config('database.default'));
        if(!$restoreConfig || empty($restoreConfig['database']) || $restoreConfig['database']===$main['database']) throw new \RuntimeException('ต้องกำหนด RESTORE_DB_DATABASE เป็นฐานว่างแยกจากฐานหลัก');
        $restore=DB::connection('restore');
        if($restore->getSchemaBuilder()->getTableListing()!==[]) throw new \RuntimeException('ฐานทดสอบกู้คืนต้องว่าง ระบบจะไม่ล้างฐานที่มีข้อมูล');
        $file=Storage::disk('local')->path($archive->path);
        if(!is_file($file) || hash_file('sha256',$file)!==$archive->sha256) throw new \RuntimeException('Checksum ของชุดสำรองไม่ตรง');
        $zip=new ZipArchive(); if($zip->open($file)!==true) throw new \RuntimeException('เปิดชุดสำรองไม่ได้');
        $manifest=json_decode($zip->getFromName('manifest.json'),true,flags:JSON_THROW_ON_ERROR); $raw=$zip->getFromName('data.json');
        if(hash('sha256',$raw)!==$manifest['data_sha256'] || $manifest['schema_version']!==$this->schemaVersion()) throw new \RuntimeException('ข้อมูลหรือ schema ไม่ตรงกับชุดสำรอง');
        $data=json_decode($raw,true,flags:JSON_THROW_ON_ERROR);
        if(array_keys($data)!==self::TABLES) throw new \RuntimeException('รายการตารางในชุดสำรองไม่ถูกต้อง');
        $checkRoot='restore-checks/'.Str::uuid(); Storage::disk('local')->makeDirectory($checkRoot);
        foreach($manifest['files'] as $path=>$hash) {
            $this->safePath($path); $contents=$zip->getFromName('files/'.$path);
            if($contents===false || hash('sha256',$contents)!==$hash) throw new \RuntimeException('ไฟล์แนบในชุดสำรองไม่ครบ');
            Storage::disk('local')->put($checkRoot.'/'.$path,$contents);
            if(hash_file('sha256',Storage::disk('local')->path($checkRoot.'/'.$path))!==$hash) throw new \RuntimeException('เขียนไฟล์ทดสอบกู้คืนไม่สำเร็จ');
        }
        $zip->close();
        if(Artisan::call('migrate',['--database'=>'restore','--force'=>true])!==0) throw new \RuntimeException('Migration ของฐานทดสอบล้มเหลว');
        $restore->transaction(function() use($restore,$data,$manifest) {
            foreach(self::TABLES as $table) {
                foreach(array_chunk($data[$table],100) as $chunk) $restore->table($table)->insert($chunk);
                if($restore->table($table)->count()!==$manifest['counts'][$table]) throw new \RuntimeException('จำนวนแถวกู้คืนไม่ตรง: '.$table);
                $restored=$restore->table($table)->orderBy('id')->get()->map(fn($r)=>(array)$r)->all();
                if($restored!=$data[$table]) throw new \RuntimeException('ค่าข้อมูลกู้คืนไม่ตรง: '.$table);
                if($restore->getDriverName()==='pgsql') $restore->select("SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE((SELECT MAX(id) FROM {$table}),1), EXISTS(SELECT 1 FROM {$table}))",[$table]);
            }
            // ยกเลิกใบอนุมัติลบในฐานที่กู้คืน เพื่อให้ต้องรับรองข้อมูลชุดใหม่
            $restore->table('deletion_approvals')->delete(); $restore->table('archive_manifests')->update(['restore_tested_at'=>null,'received_at'=>null,'received_by'=>null,'state'=>'created']);
        });
        DB::table('archive_manifests')->where('id',$id)->update(['state'=>'restore_verified','restore_tested_at'=>now(),'restore_evidence'=>json_encode(['connection'=>'restore','counts'=>$manifest['counts'],'data_sha256'=>$manifest['data_sha256'],'file_count'=>count($manifest['files']),'restored_files'=>$checkRoot]),'updated_at'=>now()]);
        Records::audit('restore_test_passed','archive_manifests',$id,year:$archive->fiscal_year_id);
    }
}
