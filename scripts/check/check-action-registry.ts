#!/usr/bin/env tsx

import {
  ACTION_REGISTRY,
  ACTION_REGISTRY_BY_KEY,
  PERMISSION_ACTION_REGISTRY,
  PERMISSION_ACTION_REGISTRY_KEYS,
} from "../../packages/platform/action-registry";
import type { ActionRegistryDefinition } from "../../packages/platform/action-registry";

type CheckableActionDefinition = ActionRegistryDefinition & { key: string };
const ACTIONS = ACTION_REGISTRY as readonly CheckableActionDefinition[];

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function assertNoDuplicates(values: readonly string[], label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  if (duplicates.size > 0) {
    fail(`${label} contains duplicates: ${[...duplicates].sort().join(", ")}`);
  }
}

function main() {
  const allActionKeys = ACTIONS.map((action) => action.key);
  const permissionActionKeys = PERMISSION_ACTION_REGISTRY.map((action) => action.key);
  const permissionIconKeys = PERMISSION_ACTION_REGISTRY.map((action) => action.icon);
  const permissionActionKeySet = new Set<string>(PERMISSION_ACTION_REGISTRY_KEYS);

  assertNoDuplicates(allActionKeys, "Action registry keys");
  assertNoDuplicates(permissionIconKeys, "Permission action icons");

  for (const action of ACTIONS) {
    if (!action.implies.includes(action.key)) {
      fail(`Action ${action.key} must imply itself.`);
    }

    for (const impliedActionKey of action.implies) {
      if (!(impliedActionKey in ACTION_REGISTRY_BY_KEY)) {
        fail(`Action ${action.key} implies unknown action ${impliedActionKey}.`);
      }
    }

    if (action.isPermissionAction && ["access", "write", "admin", "withdraw"].includes(action.key)) {
      fail(`Legacy permission action ${action.key} must not be registered as a permission action.`);
    }

    if (!action.isPermissionAction && permissionActionKeySet.has(action.key)) {
      fail(`Non-permission action ${action.key} is present in permission registry keys.`);
    }
  }

  process.stdout.write(
    `Action registry OK: ${ACTIONS.length} actions, ${permissionActionKeys.length} permission actions, no legacy permission bundles.\n`,
  );
}

main();
