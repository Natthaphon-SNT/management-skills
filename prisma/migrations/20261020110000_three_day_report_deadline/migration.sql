UPDATE "training_participations" AS p
SET "reportDueOn"=a."endsOn"+3
FROM "training_activities" AS a WHERE a.id=p."trainingActivityId";
UPDATE "fiscal_years" SET "dataVersion"="dataVersion"+1;
UPDATE "training_activities" SET "strategyId"=NULL;
UPDATE "plan_items" SET "institutionStrategyId"=NULL, "departmentStrategyId"=NULL;
