<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\{DB, Schedule, Cache};
use App\Services\{Records, ArchiveService, RetentionService, NotificationService};
use App\Models\User;

Artisan::command('skills:admin', function () {
    $username=$this->ask('Username สำหรับแอดมินแรก'); $personId=$this->ask('ID บุคลากรที่มีอยู่ในทะเบียน (สร้างผ่าน seed หรือ import ที่ตรวจทานแล้ว)');
    $password=$this->secret('รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)');
    $validator=validator(compact('username','personId','password'),['username'=>'required|alpha_dash:ascii|min:3|max:100|unique:users,username','personId'=>'required|integer|exists:personnel,id|unique:users,person_id','password'=>'required|string|min:12']);
    if($validator->fails()) { $this->error($validator->errors()->first()); return 1; }
    $user=new User; $user->username=$username; $user->name=DB::table('personnel')->where('id',$personId)->value('full_name'); $user->person_id=$personId;
    $user->password=$password; $user->role='ADMIN'; $user->approved_at=now(); $user->save(); Records::audit('create_admin','users',$user->id,actor:$user->id); $this->info('สร้าง ADMIN แล้ว');
})->purpose('สร้างแอดมินโดยรับรหัสผ่านผ่าน prompt ที่ซ่อน');

Artisan::command('skills:personnel', function () {
    $data=['code'=>$this->ask('รหัสบุคลากร'),'full_name'=>$this->ask('ชื่อ-นามสกุล'),'hired_on'=>$this->ask('วันเริ่มงาน YYYY-MM-DD'),'department_id'=>$this->ask('ID ฝ่าย 1–7 (ดูจาก departments)')];
    $validator=validator($data,['code'=>'required|string|max:100|unique:personnel,code','full_name'=>'required|string|max:255','hired_on'=>'required|date_format:Y-m-d','department_id'=>'required|integer|exists:departments,id']);
    if($validator->fails()) { $this->error($validator->errors()->first()); return 1; }
    $id=DB::transaction(function() use($data) {
        $id=DB::table('personnel')->insertGetId([...collect($data)->except('department_id')->all(),'active'=>true,'created_at'=>now(),'updated_at'=>now()]);
        DB::table('personnel_assignments')->insert(['person_id'=>$id,'department_id'=>$data['department_id'],'starts_on'=>$data['hired_on'],'created_at'=>now(),'updated_at'=>now()]); DB::table('fiscal_years')->increment('data_version'); return $id;
    }); $this->info('สร้างบุคลากร ID '.$id);
});

Artisan::command('skills:notify {--at=} {--dry-run}',function(NotificationService $notices) {
    if($this->option('at') && !$this->option('dry-run') && app()->environment('production')) { $this->error('production ไม่อนุญาตส่งแจ้งเตือนด้วยเวลาจำลอง'); return 1; }
    $this->line(json_encode($notices->schedule($this->option('at'),(bool)$this->option('dry-run')),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
});
Artisan::command('skills:archive {yearId} {actorId}',function(ArchiveService $archives) { $this->info('Manifest ID '.$archives->create((int)$this->argument('yearId'),User::findOrFail($this->argument('actorId')))); });
Artisan::command('skills:restore-check {manifestId}',function(ArchiveService $archives) { $archives->verifyAndRestore((int)$this->argument('manifestId')); $this->info('Restore verified'); });
Artisan::command('skills:retention {yearId} {--execute} {--at=}',function(RetentionService $retention) {
    if($this->option('execute') && $this->option('at') && app()->environment('production')) { $this->error('production ไม่อนุญาตลบด้วยเวลาจำลอง'); return 1; }
    $preview=$retention->execute((int)$this->argument('yearId'),!$this->option('execute'),$this->option('at')); $this->line(json_encode(['ready'=>$preview['ready'],'reasons'=>$preview['reasons'],'counts'=>$preview['counts']],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
});
Artisan::command('skills:expire-artifacts {--execute}',function(RetentionService $retention) { $this->line(json_encode($retention->expireArtifacts(!$this->option('execute')),JSON_PRETTY_PRINT)); });
Artisan::command('skills:health',function() {
    DB::select('SELECT 1'); $this->line('Database: OK'); $this->line('Failed queue jobs: '.DB::table('failed_jobs')->count());
    $this->line('Failed notices: '.DB::table('notifications')->where('status','failed')->count()); $this->line('Scheduler heartbeat: '.(Cache::get('scheduler_heartbeat')??'not seen'));
});
Schedule::command('skills:notify')->hourly()->timezone('Asia/Bangkok')->withoutOverlapping();
Schedule::job(new \App\Jobs\ProcessRetention)->dailyAt('02:10')->timezone('Asia/Bangkok')->withoutOverlapping();
Schedule::call(fn()=>Cache::put('scheduler_heartbeat',now()->toIso8601String(),now()->addMinutes(10)))->everyMinute();
