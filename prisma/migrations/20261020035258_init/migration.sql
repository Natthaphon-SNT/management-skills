-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "nextjs";

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "personnelType" TEXT,
    "position" TEXT,
    "hiredOn" DATE NOT NULL,
    "leftOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_assignments" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,

    CONSTRAINT "personnel_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMPTZ(3),
    "personId" TEXT,
    "registrationDepartmentId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'local',
    "providerSubject" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "dataVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_personnel_scopes" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "basis" TEXT NOT NULL,
    "snapshottedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_personnel_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_plans" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceReference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "development_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" TEXT NOT NULL,
    "developmentPlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "degree" TEXT,
    "higherPosition" TEXT,
    "plannedApplication" TEXT,
    "institutionStrategyId" TEXT,
    "departmentStrategyId" TEXT,
    "notes" TEXT,
    "needsSourceReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_schedules" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,

    CONSTRAINT "plan_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_activities" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "organizer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "otherCategory" TEXT,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "hours" DECIMAL(9,2),
    "strategyId" TEXT,
    "exceptionReason" TEXT,
    "exceptionReviewedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_participations" (
    "id" TEXT NOT NULL,
    "trainingActivityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "planItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "reportDueOn" DATE NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "training_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_results" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reportedOn" DATE NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "applicationResultId" TEXT NOT NULL,
    "resultVersion" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_uploads" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "totalSize" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_chunks" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "upload_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "departmentId" TEXT,
    "personId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'at_least',
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "verifiedRequired" BOOLEAN NOT NULL DEFAULT false,
    "idpStatus" TEXT NOT NULL DEFAULT 'approved',
    "version" INTEGER NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "definedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_targets" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value" DECIMAL(12,2),

    CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "data" BYTEA,
    "sha256" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "dataVersion" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fiscalYearId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "dueOn" DATE,
    "typeDueDates" JSONB,
    "graceDays" INTEGER NOT NULL DEFAULT 30,
    "noticeDays" JSONB NOT NULL DEFAULT '[30,7,1]',
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "legalHold" BOOLEAN NOT NULL DEFAULT true,
    "backupRetentionDays" INTEGER,
    "archiveRetentionDays" INTEGER,
    "policyReference" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_manifests" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "dataVersion" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "reports" JSONB NOT NULL,
    "data" BYTEA,
    "state" TEXT NOT NULL DEFAULT 'created',
    "restoreTestedAt" TIMESTAMPTZ(3),
    "restoreEvidence" JSONB,
    "receivedBy" TEXT,
    "receivedAt" TIMESTAMPTZ(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_approvals" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "dataVersion" INTEGER NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT NOT NULL,

    CONSTRAINT "deletion_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "ownerId" TEXT,
    "fiscalYearId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_code_key" ON "personnel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_assignments_personId_startsOn_key" ON "personnel_assignments"("personId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_year_key" ON "fiscal_years"("year");

-- CreateIndex
CREATE UNIQUE INDEX "annual_personnel_scopes_fiscalYearId_personId_key" ON "annual_personnel_scopes"("fiscalYearId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_schedules_planItemId_fiscalYearId_quarter_key" ON "plan_schedules"("planItemId", "fiscalYearId", "quarter");

-- CreateIndex
CREATE INDEX "training_activities_fiscalYearId_startsOn_idx" ON "training_activities"("fiscalYearId", "startsOn");

-- CreateIndex
CREATE INDEX "training_participations_personId_status_idx" ON "training_participations"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_participations_trainingActivityId_personId_key" ON "training_participations"("trainingActivityId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "application_results_participationId_key" ON "application_results"("participationId");

-- CreateIndex
CREATE UNIQUE INDEX "upload_chunks_uploadId_index_key" ON "upload_chunks"("uploadId", "index");

-- CreateIndex
CREATE INDEX "kpi_definitions_fiscalYearId_code_version_idx" ON "kpi_definitions"("fiscalYearId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_targets_definitionId_key" ON "kpi_targets"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotencyKey_key" ON "notifications"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_fiscalYearId_key" ON "retention_policies"("fiscalYearId");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_approvals_manifestId_key" ON "deletion_approvals"("manifestId");

-- CreateIndex
CREATE INDEX "audit_logs_fiscalYearId_createdAt_idx" ON "audit_logs"("fiscalYearId", "createdAt");

-- AddForeignKey
ALTER TABLE "personnel_assignments" ADD CONSTRAINT "personnel_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_assignments" ADD CONSTRAINT "personnel_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_registrationDepartmentId_fkey" FOREIGN KEY ("registrationDepartmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_personnel_scopes" ADD CONSTRAINT "annual_personnel_scopes_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_personnel_scopes" ADD CONSTRAINT "annual_personnel_scopes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_personnel_scopes" ADD CONSTRAINT "annual_personnel_scopes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_developmentPlanId_fkey" FOREIGN KEY ("developmentPlanId") REFERENCES "development_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_institutionStrategyId_fkey" FOREIGN KEY ("institutionStrategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_departmentStrategyId_fkey" FOREIGN KEY ("departmentStrategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_schedules" ADD CONSTRAINT "plan_schedules_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_schedules" ADD CONSTRAINT "plan_schedules_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_trainingActivityId_fkey" FOREIGN KEY ("trainingActivityId") REFERENCES "training_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "plan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participations" ADD CONSTRAINT "training_participations_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "training_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_applicationResultId_fkey" FOREIGN KEY ("applicationResultId") REFERENCES "application_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "training_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_chunks" ADD CONSTRAINT "upload_chunks_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "pending_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_definedBy_fkey" FOREIGN KEY ("definedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_manifests" ADD CONSTRAINT "archive_manifests_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_manifests" ADD CONSTRAINT "archive_manifests_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_approvals" ADD CONSTRAINT "deletion_approvals_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "archive_manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_approvals" ADD CONSTRAINT "deletion_approvals_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
