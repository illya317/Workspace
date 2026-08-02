-- workspace:migration-mode=maintenance
-- Department.managerPositionId is the sole responsibility fact.
-- Named responsible people are derived from current Employment + EDP occupancy;
-- fail closed unless every legacy named-person row is derivable from the
-- already-authoritative manager position and today's effective assignments.
DO $$
DECLARE
  conflict_count INTEGER;
  conflict_detail TEXT;
BEGIN
  WITH explicit_authority AS (
    SELECT DISTINCT mapping."departmentId", mapping."employeeId"
    FROM "DepartmentManagerEmployee" mapping
  ),
  current_employees AS (
    SELECT DISTINCT employment."employeeId"
    FROM "Employment" employment
    WHERE employment."isActive" = true
      AND (NULLIF(trim(employment."joinDate"), '') IS NULL OR employment."joinDate" <= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
      AND (NULLIF(trim(employment."leaveDate"), '') IS NULL OR employment."leaveDate" >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
  ),
  derived_authority AS (
    SELECT DISTINCT department."id" AS "departmentId", assignment."employeeId"
    FROM "Department" department
    JOIN "EmployeePosition" assignment
      ON assignment."positionId" = department."managerPositionId"
    JOIN current_employees current_employee
      ON current_employee."employeeId" = assignment."employeeId"
    WHERE department."managerPositionId" IS NOT NULL
      AND (NULLIF(trim(assignment."startDate"), '') IS NULL OR assignment."startDate" <= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
      AND (NULLIF(trim(assignment."endDate"), '') IS NULL OR assignment."endDate" >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
  ),
  conflicts AS (
    SELECT explicit."departmentId", explicit."employeeId", 'legacy-only' AS reason
    FROM explicit_authority explicit
    LEFT JOIN derived_authority derived
      ON derived."departmentId" = explicit."departmentId"
      AND derived."employeeId" = explicit."employeeId"
    WHERE derived."employeeId" IS NULL
  ),
  summarized AS (
    SELECT
      count(*) OVER () AS total,
      "departmentId"::text || ':' || "employeeId"::text || ':' || reason AS item
    FROM conflicts
    ORDER BY "departmentId", "employeeId", reason
    LIMIT 50
  )
  SELECT COALESCE(max(total), 0), string_agg(item, ', ' ORDER BY item)
  INTO conflict_count, conflict_detail
  FROM summarized;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Department manager authority migration blocked: % legacy mappings are not derivable', conflict_count
      USING DETAIL = COALESCE(conflict_detail, '(no detail)'),
            HINT = 'Align Department.managerPositionId, current EmployeePosition periods, current Employment periods, and DepartmentManagerEmployee before retrying. No legacy rows were dropped.';
  END IF;
END $$;

DROP TABLE "DepartmentManagerEmployee";
