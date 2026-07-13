-- Repair SQLite foreign-key metadata rewritten by prior table rebuild migrations.
-- SQLite rewrites existing FK targets when a referenced table is renamed. The
-- production schema ended up pointing some FKs at transient old_* tables that
-- were dropped later, which makes ordinary inserts fail with "no such table".
PRAGMA writable_schema=ON;

UPDATE sqlite_schema
SET sql = replace(
  replace(
    replace(
      replace(
        sql,
        'REFERENCES "old_MeetingActionCandidate"',
        'REFERENCES "MeetingActionCandidate"'
      ),
      'REFERENCES "old_WorkItem"',
      'REFERENCES "WorkItem"'
    ),
    'REFERENCES "old_WorkPlan"',
    'REFERENCES "WorkPlan"'
  ),
  'REFERENCES "old_Project"',
  'REFERENCES "Project"'
)
WHERE type = 'table'
  AND sql IS NOT NULL
  AND (
    sql LIKE '%REFERENCES "old_MeetingActionCandidate"%'
    OR sql LIKE '%REFERENCES "old_WorkItem"%'
    OR sql LIKE '%REFERENCES "old_WorkPlan"%'
    OR sql LIKE '%REFERENCES "old_Project"%'
  );

PRAGMA writable_schema=OFF;
