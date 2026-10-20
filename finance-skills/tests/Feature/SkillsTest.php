<?php
namespace Tests\Feature;

use App\Jobs\{BuildExport, DeliverNotice};
use App\Models\User;
use App\Services\{ArchiveService, ExportService, FiscalCalendar, NotificationService, Records, ReportService, RetentionService};
use Carbon\{Carbon, CarbonImmutable};
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Bus, DB, Mail, Storage};
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class SkillsTest extends TestCase
{
    use DatabaseMigrations;
    protected User $admin;
    protected User $member;
    protected object $year;
    protected function setUp(): void
    {
        parent::setUp(); Carbon::setTestNow('2026-10-20 12:00:00'); CarbonImmutable::setTestNow('2026-10-20 12:00:00');
        config(['skills.demo_accounts'=>true,'skills.registration_approval'=>true]); $this->seed();
        $this->admin=User::where('username','admin')->firstOrFail(); $this->member=User::where('username','user')->firstOrFail();
        $this->year=DB::table('fiscal_years')->orderByDesc('year')->first();
    }
    protected function tearDown(): void { Carbon::setTestNow(); CarbonImmutable::setTestNow(); parent::tearDown(); }
    protected function payload(array $overrides=[]): array
    {
        return array_replace(['person_id'=>$this->member->person_id,'fiscal_year_id'=>$this->year->id,'quarter'=>1,'starts_on'=>'2026-10-10','ends_on'=>'2026-10-11','organizer'=>'หน่วยงานสมมติ','title'=>'กิจกรรมทดสอบ','location'=>'ห้องอบรม','category'=>'professional','hours'=>3,'status'=>'completed','report_due_on'=>'2026-10-19'],$overrides);
    }
    protected function report(array $filters=[]): array { return app(ReportService::class)->build($this->admin,['fiscal_year_id'=>$this->year->id,...$filters]); }

    public function test_login_registration_hashes_password_and_rejects_privilege_escalation(): void
    {
        $this->get('/login')->assertOk()->assertSee('Username');
        $this->post('/login',['username'=>'user','password'=>'user'])->assertRedirect('/dashboard'); $this->assertAuthenticatedAs($this->member);
        $this->post('/logout')->assertRedirect('/login'); $this->assertGuest();
        $registration=['name'=>'สมาชิกทดสอบ','department_id'=>6,'username'=>'newmember','password'=>'long-password-123','password_confirmation'=>'long-password-123'];
        $this->postJson('/register',[...$registration,'role'=>'ADMIN'])->assertUnprocessable()->assertJsonValidationErrors('role');
        $before=DB::table('personnel')->count(); $this->post('/register',$registration)->assertRedirect('/login');
        $new=User::where('username','newmember')->firstOrFail(); $this->assertSame('USER',$new->role); $this->assertNull($new->person_id); $this->assertNull($new->approved_at);
        $this->assertTrue(password_verify('long-password-123',$new->password)); $this->assertSame($before,DB::table('personnel')->count());
        $this->post('/login',['username'=>'newmember','password'=>'long-password-123'])->assertSessionHasErrors('username');
    }

    public function test_login_is_rate_limited(): void
    {
        for($i=0;$i<5;$i++) $this->postJson('/login',['username'=>'missing-rate-test','password'=>'wrong'])->assertUnprocessable();
        $this->postJson('/login',['username'=>'missing-rate-test','password'=>'wrong'])->assertUnprocessable()->assertSee('60');
    }

    public function test_member_cannot_read_or_write_another_person_through_web_or_api(): void
    {
        $this->actingAs($this->admin)->postJson('/api/trainings',$this->payload(['person_id'=>$this->admin->person_id]))->assertCreated();
        $id=DB::table('training_participations')->max('id');
        $this->actingAs($this->member)->get('/trainings/'.$id)->assertForbidden();
        $this->getJson('/api/trainings/'.$id)->assertForbidden(); $this->get('/trainings/'.$id.'/edit')->assertForbidden();
        $this->putJson('/api/trainings/'.$id,$this->payload())->assertForbidden();
        $this->postJson('/api/trainings',$this->payload(['person_id'=>$this->admin->person_id]))->assertForbidden();
        $this->getJson('/api/dashboard?person_id='.$this->admin->person_id)->assertForbidden();
        $this->get('/admin')->assertForbidden(); $this->postJson('/admin/years',['year'=>2571])->assertForbidden();
        $response=$this->getJson('/api/trainings')->assertOk(); $this->assertSame([$this->member->person_id],collect($response->json('rows'))->pluck('person_id')->unique()->values()->all());
    }

    public function test_admin_can_record_for_self_and_others_and_audit_preserves_actor_and_owner(): void
    {
        foreach([$this->admin->person_id,$this->member->person_id] as $personId) {
            $id=$this->actingAs($this->admin)->postJson('/api/trainings',$this->payload(['person_id'=>$personId]))->assertCreated()->json('id');
            $this->assertDatabaseHas('audit_logs',['entity_id'=>$id,'entity'=>'training_participations','actor_id'=>$this->admin->id,'owner_id'=>$personId,'action'=>'create']);
            $this->assertDatabaseHas('training_participations',['id'=>$id,'person_id'=>$personId,'recorded_by'=>$this->admin->id]);
        }
        foreach(['/dashboard','/trainings','/trainings/create','/plans','/plans/1','/admin','/admin/retention','/admin/audit','/admin/notices','/exports'] as $path) $this->get($path)->assertOk();
    }

    public function test_backend_validates_all_quarters_end_order_other_category_and_cross_quarter_review(): void
    {
        $this->actingAs($this->member)->postJson('/api/trainings',$this->payload(['ends_on'=>'2026-10-09']))->assertUnprocessable()->assertJsonPath('errors.ends_on.0','วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
        foreach([1=>'2026-10-15',2=>'2027-02-01',3=>'2027-04-01',4=>'2027-07-01'] as $q=>$date) $this->postJson('/api/trainings',$this->payload(['quarter'=>$q,'starts_on'=>$date,'ends_on'=>$date,'report_due_on'=>$date,'status'=>'planned']))->assertCreated();
        $this->postJson('/api/trainings',$this->payload(['quarter'=>2]))->assertUnprocessable()->assertJsonValidationErrors('starts_on');
        $this->postJson('/api/trainings',$this->payload(['category'=>'other']))->assertUnprocessable()->assertJsonValidationErrors('other_category');
        $this->postJson('/api/trainings',$this->payload(['starts_on'=>'2026-12-31','ends_on'=>'2027-01-02','status'=>'planned','report_due_on'=>'2027-01-31']))->assertUnprocessable();
        $this->postJson('/api/trainings',$this->payload(['exception_reason'=>'นำเข้ากิจกรรมข้ามไตรมาส','starts_on'=>'2026-12-31','ends_on'=>'2027-01-02','status'=>'planned','report_due_on'=>'2027-01-31']))->assertCreated();
        $this->assertNull(DB::table('training_activities')->orderByDesc('id')->value('exception_reviewed_by'));
    }

    public function test_fiscal_calendar_handles_new_year_quarters_and_leap_day(): void
    {
        $this->assertSame(['2025-10-01','2026-09-30'],FiscalCalendar::bounds(2569));
        foreach(['2025-12-31'=>1,'2026-01-01'=>2,'2026-04-01'=>3,'2026-07-01'=>4] as $date=>$q) $this->assertSame(['year'=>2569,'quarter'=>$q],FiscalCalendar::identify($date));
        $this->assertSame(['2024-01-01','2024-03-31'],FiscalCalendar::bounds(2567,2));
        $this->assertSame(['year'=>2567,'quarter'=>2],FiscalCalendar::identify('2024-02-29'));
        $this->actingAs($this->admin)->post('/admin/years',['year'=>2572])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('fiscal_years',['year'=>2572,'starts_on'=>'2028-10-01','ends_on'=>'2029-09-30']);
    }

    public function test_kpi_formulas_match_manual_calculation_without_duplicate_people_or_goals(): void
    {
        $report=$this->report(); $kpis=collect($report['kpis'])->keyBy('code');
        $this->assertSame(3,$report['summary']['population']); // คนไม่มีบัญชีและไม่เคยอบรมอยู่ในตัวหาร
        $this->assertSame(1,$report['summary']['developed_people']); $this->assertSame(2,$report['summary']['completed']);
        foreach(['A'=>33.33,'B'=>33.33,'C'=>50.0,'D'=>50.0,'E'=>50.0,'F'=>3.33] as $code=>$expected) $this->assertEquals($expected,$kpis[$code]['actual'],$code);
        $this->assertSame(1,$kpis['C']['numerator']); $this->assertSame(2,$kpis['C']['denominator']);
        $this->assertSame('ยังไม่ได้กำหนดเป้าหมาย',$kpis['B']['status']);
        $empty=$this->report(['department_id'=>2]); foreach($empty['kpis'] as $k) { $this->assertNull($k['actual']); $this->assertSame('ไม่มีข้อมูลสำหรับประเมิน',$k['status']); }
        DB::table('training_participations')->update(['status'=>'planned']); $this->assertSame(0,$this->report()['summary']['completed']);
    }

    public function test_plan_only_never_counts_as_completed_and_multiyear_schedule_is_distinct(): void
    {
        $this->actingAs($this->admin)->post('/admin/years',['year'=>2571])->assertSessionHasNoErrors(); $future=DB::table('fiscal_years')->where('year',2571)->first();
        $this->post('/plans/1/items',['category'=>'training','topic'=>'หัวข้อหลายปี','schedules'=>[$this->year->id.':1',$this->year->id.':2',$future->id.':1']])->assertSessionHasNoErrors();
        $report=$this->report(); $this->assertSame(3,$report['summary']['plan_items']); $this->assertSame(2,$report['summary']['completed']);
        $futureReport=$this->report(['fiscal_year_id'=>$future->id]); $this->assertSame(1,$futureReport['summary']['plan_items']); $this->assertSame(0,$futureReport['summary']['completed']);
    }

    public function test_kpi_revisions_evidence_and_year_specific_targets(): void
    {
        $definition=['fiscal_year_id'=>$this->year->id,'code'=>'B','name'=>'ความครอบคลุม','description'=>'เกณฑ์สมมติทดสอบ','direction'=>'at_least','target'=>50,'idp_status'=>'approved','effective_on'=>'2026-10-01','evidence_required'=>1];
        $this->actingAs($this->admin)->post('/admin/kpis',$definition)->assertSessionHasNoErrors();
        $k=collect($this->report()['kpis'])->firstWhere('code','B'); $this->assertSame(0.0,$k['actual']); $this->assertSame(50.0,$k['target']);
        $this->post('/admin/kpis',[...$definition,'target'=>60,'evidence_required'=>0])->assertSessionHasNoErrors();
        $this->assertDatabaseCount('kpi_definitions',2); $k=collect($this->report()['kpis'])->firstWhere('code','B'); $this->assertSame(2,$k['version']); $this->assertSame(60.0,$k['target']);
        $old=DB::table('fiscal_years')->where('year',2569)->first(); $this->assertNull(collect($this->report(['fiscal_year_id'=>$old->id])['kpis'])->firstWhere('code','B')['target']);
    }

    public function test_department_transfer_keeps_historical_assignments_and_annual_denominator(): void
    {
        $person=DB::table('personnel')->find($this->member->person_id);
        $this->actingAs($this->admin)->put('/admin/personnel/'.$person->id,['code'=>$person->code,'full_name'=>$person->full_name,'hired_on'=>$person->hired_on,'active'=>1,'department_id'=>7,'effective_on'=>'2026-10-15'])->assertSessionHasNoErrors();
        $this->assertSame(6,Records::assignment($person->id,'2026-10-14')->department_id); $this->assertSame(7,Records::assignment($person->id,'2026-10-15')->department_id);
        $this->assertSame(6,DB::table('annual_personnel_scopes')->where('person_id',$person->id)->value('department_id'));
        $this->assertSame(1,$this->report(['department_id'=>6])['summary']['population']);
        $this->postJson('/api/trainings',$this->payload(['starts_on'=>'2026-10-16','ends_on'=>'2026-10-16']))->assertCreated(); $this->assertSame(7,DB::table('training_participations')->orderByDesc('id')->value('department_id'));
    }

    public function test_changing_verified_result_requeues_review_and_preserves_old_text_in_audit(): void
    {
        $this->actingAs($this->member)->post('/trainings/1/result',['explanation'=>'ความรู้ที่นำไปใช้ฉบับใหม่','outcome'=>'ผลที่ตรวจสอบต่อได้','reported_on'=>'2026-10-20'])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('application_results',['training_participation_id'=>1,'version'=>2,'review_status'=>'pending']);
        $this->assertDatabaseHas('reviews',['application_result_id'=>1,'result_version'=>1,'decision'=>'verified']);
        $this->actingAs($this->admin)->postJson('/trainings/1/review',['decision'=>'verified','comment'=>'ผ่าน','result_version'=>1])->assertUnprocessable();
        $this->post('/trainings/1/review',['decision'=>'verified','comment'=>'ผ่าน','result_version'=>2])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('reviews',['application_result_id'=>1,'result_version'=>2]);
    }

    public function test_evidence_files_are_private_and_downloads_check_ownership(): void
    {
        Storage::fake('local');
        $this->actingAs($this->member)->post('/trainings/1/attachments',['file'=>UploadedFile::fake()->image('หลักฐาน.png')])->assertSessionHasNoErrors();
        $file=DB::table('attachments')->first(); $this->assertNotNull($file); Storage::disk('local')->assertExists($file->path);
        $this->get('/attachments/'.$file->id)->assertOk();
        $other=new User; $other->name='คนอื่น'; $other->username='other'; $other->password='test-password-long'; $other->person_id=DB::table('personnel')->whereNotIn('id',[$this->member->person_id,$this->admin->person_id])->value('id'); $other->approved_at=now(); $other->save();
        $this->actingAs($other)->get('/attachments/'.$file->id)->assertForbidden();
        $this->actingAs($this->member)->postJson('/trainings/1/attachments',['file'=>UploadedFile::fake()->create('payload.php',1,'application/x-php')])->assertUnprocessable();
    }

    public function test_filters_csv_and_xlsx_match_dashboard_and_prevent_formula_injection(): void
    {
        Storage::fake('local'); DB::table('training_activities')->where('id',1)->update(['title'=>"=SUM(1,2), \"ตัวอย่าง\"\nภาษาไทย"]);
        $report=$this->report(['person_id'=>$this->member->person_id,'quarter'=>1,'from'=>'2026-10-06','to'=>'2026-10-06','category'=>'professional','strategy_id'=>1,'status'=>'completed']);
        $this->assertCount(1,$report['rows']); $export=app(ExportService::class)->create($report,'normal','csv'); $contents=Storage::disk('local')->get($export['path']);
        $this->assertStringStartsWith("\xEF\xBB\xBF",$contents); $stream=fopen('php://memory','r+'); fwrite($stream,substr($contents,3)); rewind($stream); fgetcsv($stream,escape:''); $row=fgetcsv($stream,escape:''); fclose($stream);
        $this->assertSame("'=SUM(1,2), \"ตัวอย่าง\"\nภาษาไทย",$row[9]); $this->assertSame(1,$export['row_count']);
        $xlsx=app(ExportService::class)->create($report,'dashboard','xlsx');
        $reader=IOFactory::createReader('Xlsx'); $reader->setIncludeCharts(true); $book=$reader->load(Storage::disk('local')->path($xlsx['path']));
        $detail=$book->getSheetByName('รายละเอียดอบรม'); $this->assertSame('A2',$detail->getFreezePane()); $this->assertCount(1,$detail->getTableCollection());
        $this->assertSame($report['rows']->first()->title,$detail->getCell('J2')->getValue()); $this->assertTrue($detail->getStyle('J2')->getAlignment()->getWrapText());
        $this->assertGreaterThan(14,$detail->getColumnDimension('J')->getWidth()); $this->assertSame(1,$book->getSheetByName('ภาพรวม KPI')->getChartCount());
        $this->assertEquals($report['kpis'][1]['actual'],$book->getSheetByName('ภาพรวม KPI')->getCell('E3')->getValue()); $book->disconnectWorksheets();
    }

    public function test_export_job_is_private_and_stale_snapshot_is_rejected(): void
    {
        Storage::fake('local'); Bus::fake();
        $this->actingAs($this->admin)->post('/exports',['kind'=>'normal','format'=>'xlsx','fiscal_year_id'=>$this->year->id,'data_version'=>$this->year->data_version])->assertRedirect('/exports');
        Bus::assertDispatched(BuildExport::class); $job=DB::table('export_jobs')->first();
        (new BuildExport($job->id))->handle(app(ReportService::class),app(ExportService::class));
        $this->get('/exports/'.$job->id)->assertOk(); $this->actingAs($this->member)->get('/exports/'.$job->id)->assertNotFound();
        DB::table('fiscal_years')->where('id',$this->year->id)->increment('data_version');
        $this->actingAs($this->admin)->postJson('/exports',['kind'=>'normal','format'=>'csv','fiscal_year_id'=>$this->year->id,'data_version'=>$this->year->data_version])->assertUnprocessable();
    }

    public function test_scheduler_notices_are_idempotent_and_retry_status_is_recorded(): void
    {
        Bus::fake(); Mail::fake(); $service=app(NotificationService::class);
        $service->schedule('2027-09-23'); $service->schedule('2027-09-23'); $this->assertDatabaseCount('notifications',2);
        $notice=DB::table('notifications')->where('channel','in_app')->first(); (new DeliverNotice($notice->id))->handle(); (new DeliverNotice($notice->id))->handle();
        $this->assertDatabaseHas('notifications',['id'=>$notice->id,'status'=>'sent','attempts'=>1]);
        $email=DB::table('notifications')->where('channel','email')->first();
        try { (new DeliverNotice($email->id))->handle(); $this->fail('missing email must fail'); } catch(\RuntimeException $e) { $this->assertDatabaseHas('notifications',['id'=>$email->id,'status'=>'failed','attempts'=>1]); }
        $before=DB::table('notifications')->count(); $service->schedule('2027-09-29',true); $this->assertSame($before,DB::table('notifications')->count());
    }

    public function test_retention_blocks_missing_backup_or_stale_approval_and_dry_run_never_deletes(): void
    {
        $retention=app(RetentionService::class); $before=DB::table('training_activities')->count();
        $preview=$retention->execute($this->year->id,true,'2040-01-01'); $this->assertFalse($preview['ready']); $this->assertSame($before,DB::table('training_activities')->count());
        try { $retention->execute($this->year->id,false,'2040-01-01'); $this->fail('must be blocked'); } catch(ValidationException $e) { $this->assertSame($before,DB::table('training_activities')->count()); }
        config(['skills.retention_enabled'=>false]); (new \App\Jobs\ProcessRetention)->handle($retention); $this->assertSame($before,DB::table('training_activities')->count());
    }

    public function test_demo_seed_refuses_production(): void
    {
        $this->app->instance('env','production');
        $this->expectException(\RuntimeException::class);
        try { (new \Database\Seeders\DemoSeeder)->run(); } finally { $this->app->instance('env','testing'); }
    }
}
