INSERT INTO "strategies" ("id", "name", "level", "active")
VALUES ('rmutt-strategy-4', 'ยุทธศาสตร์ที่ 4', 'institution', true)
ON CONFLICT ("id") DO UPDATE SET "name"='ยุทธศาสตร์ที่ 4', "level"='institution', "active"=true;
UPDATE "training_activities" SET "strategyId"='rmutt-strategy-4';
UPDATE "plan_items" SET "institutionStrategyId"='rmutt-strategy-4', "departmentStrategyId"=NULL;
UPDATE "strategies" SET "active"=false WHERE "id"<>'rmutt-strategy-4';
UPDATE "fiscal_years" SET "dataVersion"="dataVersion"+1;
