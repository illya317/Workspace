-- Agent is now a normal L1 page and owns the same entry/read/submit semantics
-- that were previously duplicated under agent.assistant. Preserve every
-- explicit grant before the resource seed removes the stale capability.
DO $$
DECLARE
  source_resource_id INTEGER;
  target_resource_id INTEGER;
BEGIN
  SELECT "id" INTO source_resource_id
  FROM "Resource"
  WHERE "key" = 'agent.assistant';

  IF source_resource_id IS NULL THEN
    RETURN;
  END IF;

  SELECT "id" INTO target_resource_id
  FROM "Resource"
  WHERE "key" = 'agent';

  IF target_resource_id IS NULL THEN
    UPDATE "Resource"
    SET "key" = 'agent',
        "name" = '智能体',
        "parentId" = NULL,
        "scopeTypes" = NULL,
        "scopeInheritanceMode" = 'inherit'
    WHERE "id" = source_resource_id;
    RETURN;
  END IF;

  DELETE FROM "UserResourceActionGrant" AS source
  USING "UserResourceActionGrant" AS target
  WHERE source."resourceId" = source_resource_id
    AND target."resourceId" = target_resource_id
    AND target."userId" = source."userId"
    AND target."actionKey" = source."actionKey"
    AND target."scopeId" IS NOT DISTINCT FROM source."scopeId";

  DELETE FROM "PositionResourceActionGrant" AS source
  USING "PositionResourceActionGrant" AS target
  WHERE source."resourceId" = source_resource_id
    AND target."resourceId" = target_resource_id
    AND target."positionId" = source."positionId"
    AND target."actionKey" = source."actionKey"
    AND target."scopeId" IS NOT DISTINCT FROM source."scopeId";

  DELETE FROM "DepartmentResourceActionGrant" AS source
  USING "DepartmentResourceActionGrant" AS target
  WHERE source."resourceId" = source_resource_id
    AND target."resourceId" = target_resource_id
    AND target."departmentId" = source."departmentId"
    AND target."actionKey" = source."actionKey"
    AND target."scopeId" IS NOT DISTINCT FROM source."scopeId";

  UPDATE "UserResourceActionGrant"
  SET "resourceId" = target_resource_id
  WHERE "resourceId" = source_resource_id;

  UPDATE "PositionResourceActionGrant"
  SET "resourceId" = target_resource_id
  WHERE "resourceId" = source_resource_id;

  UPDATE "DepartmentResourceActionGrant"
  SET "resourceId" = target_resource_id
  WHERE "resourceId" = source_resource_id;

  DELETE FROM "Resource"
  WHERE "id" = source_resource_id;
END $$;
