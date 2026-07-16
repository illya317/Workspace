-- workspace:migration-mode=maintenance
-- Split the restricted Agent management center from the ordinary toolbar/API
-- capability without leaving legacy grants on the new management resource.
DO $$
DECLARE
  agent_id INTEGER;
  assistant_id INTEGER;
  management_id INTEGER;
BEGIN
  LOCK TABLE "Resource", "UserResourceActionGrant", "PositionResourceActionGrant",
    "DepartmentResourceActionGrant", "PermissionGrantLedgerEvent", "ApprovalRequest"
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT id INTO agent_id FROM "Resource" WHERE key = 'agent';
  SELECT id INTO assistant_id FROM "Resource" WHERE key = 'agent.assistant';
  SELECT id INTO management_id FROM "Resource" WHERE key = 'agent.management';

  IF assistant_id IS NULL AND agent_id IS NOT NULL THEN
    -- Normal existing-database path: preserve the old Resource id so every
    -- FK-backed grant remains attached to the toolbar/API capability.
    UPDATE "ApprovalRequest"
    SET "resourceKey" = 'agent.assistant'
    WHERE "resourceKey" = 'agent';

    UPDATE "PermissionGrantLedgerEvent"
    SET "resourceKey" = 'agent.assistant'
    WHERE "resourceKey" = 'agent';

    UPDATE "Resource"
    SET key = 'agent.assistant',
        name = 'Agent 助手调用',
        "parentId" = NULL,
        "sortOrder" = 0
    WHERE id = agent_id;

    assistant_id := agent_id;
    agent_id := NULL;
  ELSIF assistant_id IS NOT NULL AND agent_id IS NOT NULL THEN
    -- A resource seed may have run before this migration and created the new
    -- capability while the old `agent` row still carries ordinary-user grants.
    -- Merge each fact table with NULL-safe deduplication, then clear the legacy
    -- row before it becomes the restricted management resource.
    INSERT INTO "UserResourceActionGrant" ("userId", "resourceId", "actionKey", "scopeId")
    SELECT legacy."userId", assistant_id, legacy."actionKey", legacy."scopeId"
    FROM (
      SELECT DISTINCT ON ("userId", "actionKey", "scopeId")
        "userId", "actionKey", "scopeId"
      FROM "UserResourceActionGrant"
      WHERE "resourceId" = agent_id
      ORDER BY "userId", "actionKey", "scopeId", id
    ) AS legacy
    WHERE TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM "UserResourceActionGrant" AS target
        WHERE target."userId" = legacy."userId"
          AND target."resourceId" = assistant_id
          AND target."actionKey" = legacy."actionKey"
          AND target."scopeId" IS NOT DISTINCT FROM legacy."scopeId"
      );
    DELETE FROM "UserResourceActionGrant" WHERE "resourceId" = agent_id;

    INSERT INTO "PositionResourceActionGrant" ("positionId", "resourceId", "actionKey", "scopeId")
    SELECT legacy."positionId", assistant_id, legacy."actionKey", legacy."scopeId"
    FROM (
      SELECT DISTINCT ON ("positionId", "actionKey", "scopeId")
        "positionId", "actionKey", "scopeId"
      FROM "PositionResourceActionGrant"
      WHERE "resourceId" = agent_id
      ORDER BY "positionId", "actionKey", "scopeId", id
    ) AS legacy
    WHERE TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM "PositionResourceActionGrant" AS target
        WHERE target."positionId" = legacy."positionId"
          AND target."resourceId" = assistant_id
          AND target."actionKey" = legacy."actionKey"
          AND target."scopeId" IS NOT DISTINCT FROM legacy."scopeId"
      );
    DELETE FROM "PositionResourceActionGrant" WHERE "resourceId" = agent_id;

    INSERT INTO "DepartmentResourceActionGrant" ("departmentId", "resourceId", "actionKey", "scopeId")
    SELECT legacy."departmentId", assistant_id, legacy."actionKey", legacy."scopeId"
    FROM (
      SELECT DISTINCT ON ("departmentId", "actionKey", "scopeId")
        "departmentId", "actionKey", "scopeId"
      FROM "DepartmentResourceActionGrant"
      WHERE "resourceId" = agent_id
      ORDER BY "departmentId", "actionKey", "scopeId", id
    ) AS legacy
    WHERE TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM "DepartmentResourceActionGrant" AS target
        WHERE target."departmentId" = legacy."departmentId"
          AND target."resourceId" = assistant_id
          AND target."actionKey" = legacy."actionKey"
          AND target."scopeId" IS NOT DISTINCT FROM legacy."scopeId"
      );
    DELETE FROM "DepartmentResourceActionGrant" WHERE "resourceId" = agent_id;

    UPDATE "ApprovalRequest"
    SET "resourceKey" = 'agent.assistant'
    WHERE "resourceKey" = 'agent';

    UPDATE "PermissionGrantLedgerEvent"
    SET "resourceId" = assistant_id,
        "resourceKey" = 'agent.assistant'
    WHERE "resourceId" = agent_id
       OR ("resourceId" IS NULL AND "resourceKey" = 'agent');

    -- When the temporary management row exists, keep that row and its grants;
    -- otherwise the cleared legacy row can become the management container.
    IF management_id IS NOT NULL THEN
      UPDATE "Resource" SET "parentId" = management_id WHERE "parentId" = agent_id;
      DELETE FROM "Resource" WHERE id = agent_id;
      agent_id := NULL;
    END IF;
  END IF;

  IF management_id IS NOT NULL THEN
    UPDATE "ApprovalRequest"
    SET "resourceKey" = 'agent'
    WHERE "resourceKey" = 'agent.management';

    UPDATE "PermissionGrantLedgerEvent"
    SET "resourceKey" = 'agent'
    WHERE "resourceId" = management_id
       OR ("resourceId" IS NULL AND "resourceKey" = 'agent.management');

    UPDATE "Resource"
    SET key = 'agent',
        name = '智能体',
        "parentId" = NULL,
        "sortOrder" = 90
    WHERE id = management_id;

    agent_id := management_id;
  END IF;

  INSERT INTO "Resource" (key, name, level, "sortOrder", "scopeInheritanceMode")
  SELECT 'agent.assistant', 'Agent 助手调用', 1, 0, 'inherit'
  WHERE NOT EXISTS (SELECT 1 FROM "Resource" WHERE key = 'agent.assistant')
  RETURNING id INTO assistant_id;

  INSERT INTO "Resource" (key, name, level, "sortOrder", "scopeInheritanceMode")
  SELECT 'agent', '智能体', 1, 90, 'inherit'
  WHERE NOT EXISTS (SELECT 1 FROM "Resource" WHERE key = 'agent')
  RETURNING id INTO agent_id;

  SELECT id INTO assistant_id FROM "Resource" WHERE key = 'agent.assistant';
  SELECT id INTO agent_id FROM "Resource" WHERE key = 'agent';

  UPDATE "Resource"
  SET name = 'Agent 助手调用',
      level = 1,
      "parentId" = NULL,
      "sortOrder" = 0,
      "scopeTypes" = NULL,
      "scopeInheritanceMode" = 'inherit'
  WHERE id = assistant_id;

  UPDATE "Resource"
  SET name = '智能体',
      level = 1,
      "parentId" = NULL,
      "sortOrder" = 90,
      "scopeTypes" = NULL,
      "scopeInheritanceMode" = 'inherit'
  WHERE id = agent_id;

  UPDATE "Resource"
  SET level = 2,
      "parentId" = agent_id
  WHERE key IN ('agent.config', 'agent.usage', 'agent.reports');
END $$;
