#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const policyPath = path.join(repoRoot, "docs/planning/short-term/2026-07-01-short-permission-resource-action-policy.candidate.json");
const registryPath = path.join(repoRoot, "packages/platform/module-registry.ts");

const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const registrySource = fs.readFileSync(registryPath, "utf8");

const resourceKeys = new Set();
const resourceKeyPattern = /resourceKey:\s*"([^"]+)"/g;
const capabilityPattern = /\{[^{}]*key:\s*"([^"]+)"[^{}]*kind:\s*"capability"[^{}]*\}/g;

for (const match of registrySource.matchAll(resourceKeyPattern)) {
  resourceKeys.add(match[1]);
}

for (const match of registrySource.matchAll(capabilityPattern)) {
  resourceKeys.add(match[1]);
}

const actionKeys = new Set(policy.actionKeys);
const policyKeys = new Set();
const errors = [];

for (const entry of policy.policies) {
  if (policyKeys.has(entry.resourceKey)) {
    errors.push(`duplicate policy entry: ${entry.resourceKey}`);
  }
  policyKeys.add(entry.resourceKey);

  for (const field of ["supportedActions", "ancestorInheritedActions", "explicitOnlyActions"]) {
    for (const actionKey of entry[field] ?? []) {
      if (!actionKeys.has(actionKey)) {
        errors.push(`${entry.resourceKey}.${field} contains unknown action: ${actionKey}`);
      }
    }
  }

  for (const actionKey of entry.ancestorInheritedActions ?? []) {
    if (!entry.supportedActions.includes(actionKey)) {
      errors.push(`${entry.resourceKey}.ancestorInheritedActions contains unsupported action: ${actionKey}`);
    }
  }

  for (const actionKey of entry.explicitOnlyActions ?? []) {
    if (!entry.supportedActions.includes(actionKey)) {
      errors.push(`${entry.resourceKey}.explicitOnlyActions contains unsupported action: ${actionKey}`);
    }
  }
}

for (const resourceKey of [...resourceKeys].sort()) {
  if (!policyKeys.has(resourceKey)) {
    errors.push(`missing policy entry for registered resource: ${resourceKey}`);
  }
}

for (const resourceKey of [...policyKeys].sort()) {
  if (!resourceKeys.has(resourceKey)) {
    errors.push(`policy entry has no registered resource: ${resourceKey}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`permission resource action policy draft ok: ${policyKeys.size} resources`);
