import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { RESOURCE_DEFS } from "../packages/platform/resources";
import { PERMISSION_ACTION_KEYS } from "../packages/platform/permission-actions";
import {
  getPermissionResourceActionPolicy,
  serializePermissionScopeTypes,
} from "../packages/platform/permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "../packages/platform/space-registry";
import { getWorkflowActionForManagementResource } from "../packages/platform/workflow-management-resources";

const outputPath = process.argv[2] ?? ".next/standalone/resource-defs.json";

const resources = RESOURCE_DEFS.map((resource) => {
  const workflowAction = getWorkflowActionForManagementResource(resource.key);
  return {
    key: resource.key,
    name: resource.name,
    parentKey: resource.parentKey ?? null,
    supportedActions: getPermissionResourceActionPolicy(resource.key)?.supportedActions ?? [],
    spaceEntryOnly: isRegisteredSpaceResourceKey(resource.key),
    scopeTypes: serializePermissionScopeTypes(getPermissionResourceActionPolicy(resource.key)?.scopeTypes),
    scopeInheritanceMode: getPermissionResourceActionPolicy(resource.key)?.scopeInheritanceMode ?? "inherit",
    sortOrder: resource.sortOrder ?? 0,
    workflowBusinessActionKey: workflowAction?.key ?? null,
    workflowBusinessResourceKey: workflowAction?.resourceKey ?? null,
  };
});

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ permissionActions: PERMISSION_ACTION_KEYS, resources }, null, 2)}\n`);
console.log(`Resource manifest written: ${outputPath} (${resources.length} resources)`);
