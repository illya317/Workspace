UPDATE "DepartmentDescription"
SET "details" = json_remove(
  "details",
  '$."基本信息"."负责人"',
  '$."基本信息"."主管领导"',
  '$."基本信息"."岗位编制"',
  '$."基本信息"."定编岗位"'
)
WHERE "details" IS NOT NULL
  AND json_valid("details")
  AND (
    "details" LIKE '%负责人%'
    OR "details" LIKE '%主管领导%'
    OR "details" LIKE '%岗位编制%'
    OR "details" LIKE '%定编岗位%'
  );
