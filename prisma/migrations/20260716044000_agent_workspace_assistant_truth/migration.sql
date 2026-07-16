-- workspace:migration-mode=expand
-- Correct the original AI0004 seed wording without taking ownership away from
-- HR or Agent administrators. Each compare-and-set only replaces the exact
-- former canonical value, so later human edits survive deployment.
BEGIN;

UPDATE "Employee"
SET name = 'Workspace 提案助理',
    version = version + 1,
    "editedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "employeeId" = 'AI0004'
  AND name = 'Workspace 业务助理';

UPDATE "Position"
SET name = 'AI查询与变更提案助理',
    version = version + 1,
    "editedAt" = CURRENT_TIMESTAMP
WHERE code = 'GW-FUN103-07'
  AND name = 'AI业务操作与知识助理';

UPDATE "AgentProfile"
SET "displayName" = CASE
      WHEN "displayName" = 'Workspace 业务助理' THEN 'Workspace 提案助理'
      ELSE "displayName"
    END,
    "roleName" = CASE
      WHEN "roleName" = 'AI业务操作与知识助理' THEN 'AI查询与变更提案助理'
      ELSE "roleName"
    END,
    responsibilities = CASE
      WHEN responsibilities = '负责 Workspace 内授权数据的只读查询、受控操作、知识答疑与变更提案；不承担本地代码开发、直接提交或部署。'
        THEN '负责 Workspace 内已接入能力的只读查询与变更提案；当前接入源码检索与 PR 提案，不承担本地代码开发、直接提交或部署。'
      ELSE responsibilities
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'workspace.business-assistant'
  AND (
    "displayName" = 'Workspace 业务助理'
    OR "roleName" = 'AI业务操作与知识助理'
    OR responsibilities = '负责 Workspace 内授权数据的只读查询、受控操作、知识答疑与变更提案；不承担本地代码开发、直接提交或部署。'
  );

UPDATE "AgentRuntimeBinding" AS binding
SET instructions = '仅在 Workspace 页面助手中按请求人与本虚拟员工权限交集执行。当前只允许源码检索与 PR 提案；写操作必须先形成提案并由请求人确认，不承担本地代码开发、直接提交或部署。',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "AgentProfile" AS profile
WHERE binding."agentProfileId" = profile.id
  AND profile.key = 'workspace.business-assistant'
  AND binding."runtimeKind" = 'workspace'
  AND binding.instructions = '仅在 Workspace 页面助手中按请求人与本虚拟员工权限交集执行。写操作必须先形成提案并由请求人确认；可以查询和提出 PR，不承担本地代码开发、直接提交或部署。';

COMMIT;
