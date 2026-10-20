<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $t) {
            $t->id(); $t->string('name')->unique(); $t->boolean('active')->default(true); $t->timestampsTz();
        });
        Schema::create('personnel', function (Blueprint $t) {
            $t->id(); $t->string('code')->unique(); $t->string('full_name'); $t->string('personnel_type')->nullable();
            $t->string('position')->nullable(); $t->date('hired_on'); $t->date('left_on')->nullable(); $t->boolean('active')->default(true); $t->timestampsTz();
        });
        Schema::create('personnel_assignments', function (Blueprint $t) {
            $t->id(); $t->foreignId('person_id')->constrained('personnel')->restrictOnDelete();
            $t->foreignId('department_id')->constrained()->restrictOnDelete(); $t->date('starts_on'); $t->date('ends_on')->nullable();
            $t->unique(['person_id', 'starts_on']); $t->timestampsTz();
        });
        Schema::table('users', function (Blueprint $t) {
            $t->string('username')->unique()->nullable(); $t->foreignId('person_id')->nullable()->unique()->constrained('personnel')->restrictOnDelete();
            $t->string('role')->default('USER'); $t->boolean('active')->default(true); $t->timestampTz('approved_at')->nullable();
            $t->string('auth_provider')->default('local'); $t->string('provider_subject')->nullable();
            $t->foreignId('registration_department_id')->nullable()->constrained('departments')->restrictOnDelete();
        });
        Schema::create('fiscal_years', function (Blueprint $t) {
            $t->id(); $t->unsignedSmallInteger('year')->unique(); $t->date('starts_on'); $t->date('ends_on');
            $t->string('state')->default('open'); $t->unsignedBigInteger('data_version')->default(1); $t->timestampsTz();
        });
        Schema::create('annual_personnel_scopes', function (Blueprint $t) {
            $t->id(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete(); $t->foreignId('person_id')->constrained('personnel')->restrictOnDelete();
            $t->foreignId('department_id')->constrained()->restrictOnDelete(); $t->boolean('included')->default(true);
            $t->string('basis')->default('ทะเบียนบุคลากร ณ วันที่จัดทำฐานประเมิน'); $t->timestampTz('snapshotted_at');
            $t->unique(['fiscal_year_id', 'person_id']); $t->timestampsTz();
        });
        Schema::create('strategies', function (Blueprint $t) {
            $t->id(); $t->string('name'); $t->string('level'); $t->boolean('active')->default(true); $t->timestampsTz();
        });
        Schema::create('development_plans', function (Blueprint $t) {
            $t->id(); $t->foreignId('person_id')->constrained('personnel')->restrictOnDelete(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete();
            $t->string('title'); $t->string('status')->default('draft'); $t->text('source_reference')->nullable(); $t->text('notes')->nullable();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('plan_items', function (Blueprint $t) {
            $t->id(); $t->foreignId('development_plan_id')->constrained()->cascadeOnDelete(); $t->string('category'); $t->string('topic');
            $t->string('degree')->nullable(); $t->string('higher_position')->nullable(); $t->text('planned_application')->nullable();
            $t->foreignId('institution_strategy_id')->nullable()->constrained('strategies')->restrictOnDelete();
            $t->foreignId('department_strategy_id')->nullable()->constrained('strategies')->restrictOnDelete();
            $t->text('notes')->nullable(); $t->boolean('needs_source_review')->default(false); $t->timestampsTz();
        });
        Schema::create('plan_schedules', function (Blueprint $t) {
            $t->id(); $t->foreignId('plan_item_id')->constrained()->cascadeOnDelete(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete();
            $t->unsignedTinyInteger('quarter'); $t->unique(['plan_item_id', 'fiscal_year_id', 'quarter']);
        });
        Schema::create('training_activities', function (Blueprint $t) {
            $t->id(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete(); $t->unsignedTinyInteger('quarter');
            $t->date('starts_on'); $t->date('ends_on'); $t->string('organizer'); $t->string('category'); $t->string('other_category')->nullable();
            $t->string('title'); $t->string('location'); $t->decimal('hours', 9, 2)->nullable();
            $t->foreignId('strategy_id')->nullable()->constrained('strategies')->restrictOnDelete();
            $t->text('exception_reason')->nullable(); $t->foreignId('exception_reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('training_participations', function (Blueprint $t) {
            $t->id(); $t->foreignId('training_activity_id')->constrained()->cascadeOnDelete(); $t->foreignId('person_id')->constrained('personnel')->restrictOnDelete();
            $t->foreignId('department_id')->constrained()->restrictOnDelete(); $t->foreignId('plan_item_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('status')->default('planned'); $t->date('report_due_on'); $t->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $t->unique(['training_activity_id', 'person_id']); $t->timestampsTz();
        });
        Schema::create('application_results', function (Blueprint $t) {
            $t->id(); $t->foreignId('training_participation_id')->unique()->constrained()->cascadeOnDelete();
            $t->text('explanation'); $t->text('outcome'); $t->date('reported_on'); $t->string('review_status')->default('pending');
            $t->unsignedInteger('version')->default(1); $t->foreignId('recorded_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('reviews', function (Blueprint $t) {
            $t->id(); $t->foreignId('application_result_id')->constrained()->cascadeOnDelete(); $t->unsignedInteger('result_version');
            $t->foreignId('reviewer_id')->constrained('users')->restrictOnDelete(); $t->string('decision'); $t->text('comment'); $t->timestampTz('reviewed_at');
        });
        Schema::create('attachments', function (Blueprint $t) {
            $t->id(); $t->foreignId('training_participation_id')->constrained()->cascadeOnDelete(); $t->string('path')->unique();
            $t->string('original_name'); $t->string('mime'); $t->unsignedBigInteger('size'); $t->string('sha256', 64);
            $t->foreignId('uploaded_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('kpi_definitions', function (Blueprint $t) {
            $t->id(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete(); $t->foreignId('department_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('code', 1); $t->string('name'); $t->text('description'); $t->text('formula'); $t->string('unit');
            $t->string('direction')->default('at_least'); $t->boolean('evidence_required')->default(false);
            $t->boolean('verified_required')->default(false); $t->string('idp_status')->default('approved');
            $t->unsignedInteger('version'); $t->date('effective_on'); $t->foreignId('defined_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('kpi_targets', function (Blueprint $t) {
            $t->id(); $t->foreignId('kpi_definition_id')->unique()->constrained()->cascadeOnDelete(); $t->decimal('value', 12, 2)->nullable(); $t->timestampsTz();
        });
        Schema::create('export_jobs', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->restrictOnDelete(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete();
            $t->string('kind'); $t->string('format'); $t->json('filters'); $t->string('status')->default('pending');
            $t->string('path')->nullable(); $t->string('sha256', 64)->nullable(); $t->unsignedInteger('row_count')->default(0);
            $t->unsignedBigInteger('data_version'); $t->text('error')->nullable(); $t->timestampsTz();
        });
        Schema::create('notifications', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->nullable()->constrained()->restrictOnDelete(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete();
            $t->string('idempotency_key')->unique(); $t->string('channel'); $t->string('status')->default('pending'); $t->text('message');
            $t->unsignedInteger('attempts')->default(0); $t->text('error')->nullable(); $t->timestampTz('sent_at')->nullable(); $t->timestampTz('read_at')->nullable(); $t->timestampsTz();
        });
        Schema::create('retention_policies', function (Blueprint $t) {
            $t->id(); $t->foreignId('fiscal_year_id')->unique()->constrained()->restrictOnDelete();
            $t->date('due_on')->nullable(); $t->json('type_due_dates')->nullable(); $t->unsignedInteger('grace_days')->default(30); $t->json('notice_days');
            $t->boolean('auto_delete')->default(false); $t->boolean('legal_hold')->default(true);
            $t->unsignedInteger('backup_retention_days')->nullable(); $t->unsignedInteger('archive_retention_days')->nullable();
            $t->text('policy_reference')->nullable(); $t->foreignId('approved_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->timestampTz('approved_at')->nullable(); $t->timestampsTz();
        });
        Schema::create('archive_manifests', function (Blueprint $t) {
            $t->id(); $t->foreignId('fiscal_year_id')->constrained()->restrictOnDelete(); $t->unsignedBigInteger('data_version');
            $t->string('schema_version'); $t->string('path'); $t->string('sha256', 64); $t->json('counts');
            $t->string('state')->default('created'); $t->json('reports'); $t->timestampTz('restore_tested_at')->nullable();
            $t->text('restore_evidence')->nullable(); $t->foreignId('received_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->timestampTz('received_at')->nullable(); $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestampsTz();
        });
        Schema::create('deletion_approvals', function (Blueprint $t) {
            $t->id(); $t->foreignId('archive_manifest_id')->unique()->constrained()->restrictOnDelete();
            $t->unsignedBigInteger('data_version'); $t->foreignId('approved_by')->constrained('users')->restrictOnDelete();
            $t->timestampTz('approved_at'); $t->text('comment'); $t->timestampsTz();
        });
        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id(); $t->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('owner_id')->nullable()->constrained('personnel')->restrictOnDelete();
            $t->foreignId('fiscal_year_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('action'); $t->string('entity'); $t->unsignedBigInteger('entity_id')->nullable();
            $t->json('changes')->nullable(); $t->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        foreach (['audit_logs','deletion_approvals','archive_manifests','retention_policies','notifications','export_jobs','kpi_targets','kpi_definitions','attachments','reviews','application_results','training_participations','training_activities','plan_schedules','plan_items','development_plans','strategies','annual_personnel_scopes','fiscal_years'] as $table) Schema::dropIfExists($table);
        Schema::table('users', function (Blueprint $t) { $t->dropConstrainedForeignId('person_id'); $t->dropConstrainedForeignId('registration_department_id'); $t->dropColumn(['username','role','active','approved_at','auth_provider','provider_subject']); });
        foreach (['personnel_assignments','personnel','departments'] as $table) Schema::dropIfExists($table);
    }
};
