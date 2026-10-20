<?php
namespace Tests\Feature;

use App\Models\User;
use App\Services\{ArchiveService, RetentionService, Records};
use Carbon\{Carbon, CarbonImmutable};
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Tests\TestCase;

class PostgresLifecycleTest extends TestCase
{
    use DatabaseMigrations;
    public function test_real_postgres_restore_checks_all_rows_and_files_then_purge_preserves_other_year(): void
    {
        if(DB::getDriverName()!=='pgsql') $this->markTestSkipped('ทดสอบกู้คืนจริงเมื่อรันบน PostgreSQL test database');
        $restoreName=config('database.connections.restore.database');
        if(!$restoreName || !str_ends_with($restoreName,'_restore_test')) $this->markTestSkipped('ต้องกำหนดฐานแยกที่ลงท้าย _restore_test เท่านั้น');
        Carbon::setTestNow('2026-10-20 12:00:00'); CarbonImmutable::setTestNow('2026-10-20 12:00:00');
        try {
            config(['skills.demo_accounts'=>true]); $this->seed(); Storage::fake('local');
            $admin=User::where('username','admin')->firstOrFail(); $this->actingAs($admin);
            $year=DB::table('fiscal_years')->orderByDesc('year')->first();
            $this->post('/trainings/1/attachments',['file'=>UploadedFile::fake()->image('evidence.png')])->assertSessionHasNoErrors();
            $attachment=DB::table('attachments')->first();
            $this->post('/admin/years',['year'=>2571])->assertSessionHasNoErrors(); $future=DB::table('fiscal_years')->where('year',2571)->first();
            DB::table('plan_schedules')->insert(['plan_item_id'=>2,'fiscal_year_id'=>$future->id,'quarter'=>1]);
            $futureActivity=DB::table('training_activities')->insertGetId(['fiscal_year_id'=>$future->id,'quarter'=>1,'starts_on'=>'2027-10-05','ends_on'=>'2027-10-05','organizer'=>'ทดสอบ','title'=>'กิจกรรมปีถัดไป','category'=>'professional','location'=>'ทดสอบ','created_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('training_participations')->insert(['training_activity_id'=>$futureActivity,'person_id'=>2,'department_id'=>6,'plan_item_id'=>2,'status'=>'planned','report_due_on'=>'2027-11-01','recorded_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
            $this->post('/admin/retention/'.$year->id.'/state',['state'=>'closed'])->assertSessionHasNoErrors();
            $this->post('/admin/retention/'.$year->id.'/policy',['type_due_dates'=>array_fill_keys(['plans','training','results','attachments'],'2027-09-30'),'grace_days'=>0,'notice_days'=>'30,7,1','auto_delete'=>0,'legal_hold'=>0,'backup_retention_days'=>30,'archive_retention_days'=>30,'policy_reference'=>'นโยบายสมมติสำหรับทดสอบเท่านั้น'])->assertSessionHasNoErrors();
            $archives=app(ArchiveService::class); $retention=app(RetentionService::class);
            $verify=function(int $manifest) use($archives) {
                // ชื่อนี้ตรวจแล้วว่าเป็นฐานทดสอบเฉพาะ การล้างไม่แตะฐานหลักหรือฐาน restore จริง
                DB::connection('restore')->getSchemaBuilder()->dropAllTables();
                $archives->verifyAndRestore($manifest);
                $this->post('/admin/archives/'.$manifest.'/receive',['confirmation'=>1])->assertSessionHasNoErrors();
                $this->post('/admin/archives/'.$manifest.'/approve',['confirmation'=>1,'comment'=>'รับและตรวจชุดสำรองทดสอบแล้ว'])->assertSessionHasNoErrors();
            };
            $id=$archives->create($year->id,$admin); $verify($id);
            $this->assertSame(DB::table('training_activities')->count(),DB::connection('restore')->table('training_activities')->count());
            $manifest=DB::table('archive_manifests')->find($id); $evidence=json_decode($manifest->restore_evidence,true);
            $restoredFile=$evidence['restored_files'].'/'.$attachment->path;
            Storage::disk('local')->assertExists($restoredFile); $this->assertSame($attachment->sha256,hash_file('sha256',Storage::disk('local')->path($restoredFile)));
            $this->assertTrue($retention->preview($year->id,'2040-01-01')['ready']);
            DB::table('training_activities')->where('id',1)->update(['title'=>'ข้อมูลเปลี่ยนหลังอนุมัติ']); Records::touch($year->id);
            $stale=$retention->preview($year->id,'2040-01-01'); $this->assertFalse($stale['ready']); $this->assertContains('ข้อมูลเปลี่ยนหลังสำรอง ต้องสร้างและทดสอบชุดใหม่',$stale['reasons']);
            $id=$archives->create($year->id,$admin); $verify($id);
            $preview=$retention->execute($year->id,true,'2040-01-01'); $this->assertSame(1,$preview['counts']['preserved_shared_plans']);
            $retention->execute($year->id,false,'2040-01-01',$admin->id);
            $this->assertDatabaseHas('training_activities',['id'=>$futureActivity,'title'=>'กิจกรรมปีถัดไป']);
            $this->assertSame(0,DB::table('training_activities')->where('fiscal_year_id',$year->id)->count());
            $this->assertDatabaseHas('plan_items',['id'=>2]); $this->assertDatabaseHas('plan_schedules',['fiscal_year_id'=>$future->id,'plan_item_id'=>2]);
            $this->assertDatabaseCount('personnel',3); $this->assertDatabaseCount('users',2); $this->assertSame(3,DB::table('annual_personnel_scopes')->where('fiscal_year_id',$future->id)->count());
            $this->assertDatabaseHas('fiscal_years',['id'=>$year->id,'state'=>'purged']);
            $this->assertNotEmpty($retention->expireArtifacts(true,'2040-02-15'));
        } finally {
            DB::connection('restore')->getSchemaBuilder()->dropAllTables(); Carbon::setTestNow(); CarbonImmutable::setTestNow();
        }
    }
}
