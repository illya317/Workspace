#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findApiContract, type ApiMethod } from "../../packages/platform/api-registry";
import {
  listBusinessActionRegistrations,
  listWorkflowEligibleBusinessActions,
} from "../../packages/platform/business-action-registry";
import { assertBusinessActionRegistryValid } from "../../packages/platform/business-action-registry-validation";
import {
  listUnknownWorkflowReadinessKeys,
  listWorkflowReadinessWarnings,
} from "../../packages/platform/workflow-action-readiness";

const ROOT = path.resolve(import.meta.dirname, "../..");
const APP_ROOT = path.join(ROOT, "app");
const API_MODULES_ROOT = path.join(APP_ROOT, "api", "modules");
const WRITE_METHODS = new Set<ApiMethod>(["POST", "PUT", "PATCH", "DELETE"]);

type NonBusinessWriteRouteKind = "permission_delegation" | "workflow_request_lifecycle" | "internal_cache" | "non_mutating_command";

interface NonBusinessWriteRouteClassification {
  kind: NonBusinessWriteRouteKind;
  reason: string;
}

const workflowLifecycle = (reason: string): NonBusinessWriteRouteClassification => ({ kind: "workflow_request_lifecycle", reason });

const EXPLICIT_NON_BUSINESS_WRITE_ROUTES = new Map<string, NonBusinessWriteRouteClassification>([
  ["PUT /api/modules/docs/editor/spaces/:spaceId/permissions", { kind: "permission_delegation", reason: "Manages scoped Docs grants, not document content." }],
  ["POST /api/modules/docs/editor/submissions", workflowLifecycle("Creates a Docs approval request; its selected BusinessAction owns the eventual mutation.")],
  ["PUT /api/modules/docs/editor/submissions/:id", workflowLifecycle("Revises a Docs approval request payload.")],
  ["POST /api/modules/docs/editor/submissions/:id/submit", workflowLifecycle("Submits a Docs approval request.")],
  ["POST /api/modules/docs/editor/submissions/:id/withdraw", workflowLifecycle("Withdraws a Docs approval request.")],
  ["POST /api/modules/docs/editor/submissions/:id/approve", workflowLifecycle("Approves and dispatches a Docs request through its BusinessAction adapter.")],
  ["POST /api/modules/docs/editor/submissions/:id/reject", workflowLifecycle("Rejects a Docs approval request.")],
  ["POST /api/modules/docs/editor/submissions/:id/cancel", workflowLifecycle("Cancels a Docs approval request.")],
  ["POST /api/modules/docs/editor/submissions/:id/comment", workflowLifecycle("Adds Docs workflow discussion without committing document content.")],
  ["POST /api/modules/hr/performance/submissions", workflowLifecycle("Creates an HR performance request; its BusinessAction owns the eventual mutation.")],
  ["PUT /api/modules/hr/performance/submissions/:id", workflowLifecycle("Revises an HR performance request payload.")],
  ["POST /api/modules/hr/performance/submissions/:id/submit", workflowLifecycle("Submits an HR performance request.")],
  ["POST /api/modules/hr/performance/submissions/:id/withdraw", workflowLifecycle("Withdraws an HR performance request.")],
  ["POST /api/modules/hr/performance/submissions/:id/approve", workflowLifecycle("Approves and dispatches an HR performance request through its BusinessAction adapter.")],
  ["POST /api/modules/hr/performance/submissions/:id/reject", workflowLifecycle("Rejects an HR performance request.")],
  ["POST /api/modules/hr/performance/submissions/:id/cancel", workflowLifecycle("Cancels an HR performance request.")],
  ["POST /api/modules/hr/performance/submissions/:id/comment", workflowLifecycle("Adds HR performance workflow discussion without committing the review.")],
  ["POST /api/modules/hr/roster/submissions", workflowLifecycle("Creates an HR roster request; its BusinessAction owns the eventual mutation.")],
  ["PUT /api/modules/hr/roster/submissions/:id", workflowLifecycle("Revises an HR roster request payload.")],
  ["POST /api/modules/hr/roster/submissions/:id/submit", workflowLifecycle("Submits an HR roster request.")],
  ["POST /api/modules/hr/roster/submissions/:id/withdraw", workflowLifecycle("Withdraws an HR roster request.")],
  ["POST /api/modules/hr/roster/submissions/:id/approve", workflowLifecycle("Approves and dispatches an HR roster request through its BusinessAction adapter.")],
  ["POST /api/modules/hr/roster/submissions/:id/reject", workflowLifecycle("Rejects an HR roster request.")],
  ["POST /api/modules/hr/roster/submissions/:id/cancel", workflowLifecycle("Cancels an HR roster request.")],
  ["POST /api/modules/hr/roster/submissions/:id/comment", workflowLifecycle("Adds HR roster workflow discussion without committing roster data.")],
  ["POST /api/modules/production/qc/cache", { kind: "internal_cache", reason: "Refreshes derived QC cache state, not a domain business command." }],
  ["PUT /api/modules/work/projects/spaces/:targetType/:targetId/permissions", { kind: "permission_delegation", reason: "Manages scoped project grants, not project data." }],
  ["PUT /api/modules/work/tasks/spaces/:targetType/:targetId/permissions", { kind: "permission_delegation", reason: "Manages scoped task grants, not task data." }],
  ["POST /api/modules/work/tasks/submissions", workflowLifecycle("Creates a Work request; its selected BusinessAction owns the eventual mutation.")],
  ["PUT /api/modules/work/tasks/submissions/:id", workflowLifecycle("Revises a Work request payload.")],
  ["POST /api/modules/work/tasks/submissions/:id/submit", workflowLifecycle("Submits a Work request.")],
  ["POST /api/modules/work/tasks/submissions/:id/withdraw", workflowLifecycle("Withdraws a Work request.")],
  ["POST /api/modules/work/tasks/submissions/:id/approve", workflowLifecycle("Approves and dispatches a Work request through its BusinessAction adapter.")],
  ["POST /api/modules/work/tasks/submissions/:id/reject", workflowLifecycle("Rejects a Work request.")],
  ["POST /api/modules/work/tasks/submissions/:id/cancel", workflowLifecycle("Cancels a Work request.")],
  ["POST /api/modules/work/tasks/submissions/:id/comment", workflowLifecycle("Adds Work workflow discussion without committing the selected record.")],
  ["POST /api/modules/finance/import/preview", { kind: "non_mutating_command", reason: "Parses and validates an upload preview without persisting Finance data." }],
  ["DELETE /api/modules/hr/roster/employments/:id", { kind: "non_mutating_command", reason: "Rejects unsupported deletion and performs no mutation." }],
]);

const EXPLICIT_MULTI_ACTION_ROUTE_DISPATCHERS = new Map<string, string>([
  ["PATCH /api/modules/library/basic-info/documents/:id", "executeUpdateLibraryDocumentCommand selects metadata versus confidentiality from the validated patch fields."],
  ["PATCH /api/modules/production/qc/:batchId", "buildQcBatchPatchCommand requires action=save_precheck|save_inspection and executeQcBatchPatchCommand dispatches that discriminant."],
  ["POST /api/modules/work/tasks/submissions", "buildCreateWorkTaskSubmissionRouteCommand derives the registered BusinessAction from the typed entity and payload."],
  ["POST /api/modules/work/tasks/submissions/:id/submit", "The stored request payload owns the BusinessAction identity dispatched by the submission lifecycle."],
  ["PUT /api/modules/work/tasks/reports", "workReportBusinessActionKey derives report-save versus target-specific submit behavior from target, stage, and period."],
]);

interface RouteHandler {
  method: ApiMethod;
  apiPath: string;
  file: string;
  line: number;
}

function gitFiles(paths: string[]) {
  const tracked = execFileSync("git", ["ls-files", ...paths], { cwd: ROOT, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", ...paths], { cwd: ROOT, encoding: "utf8" });
  return `${tracked}\n${untracked}`
    .split("\n")
    .map((file) => file.trim())
    .filter((file, index, files) => file && files.indexOf(file) === index)
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

function stripComments(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function lineForIndex(text: string, index: number) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function normalizeDynamicApiPath(apiPath: string) {
  return apiPath
    .replace(/\[\.\.\.[^\]]+\]/g, ":*")
    .replace(/\[([^\]]+)\]/g, ":$1");
}

function routeFileToApiPath(file: string) {
  const absoluteFile = path.join(ROOT, file);
  const relativeToApp = path.relative(APP_ROOT, absoluteFile).replace(/\\/g, "/");
  return normalizeDynamicApiPath(`/${relativeToApp.replace(/\/route\.ts$/, "")}`);
}

function collectRouteHandlers() {
  const handlers: RouteHandler[] = [];
  for (const file of gitFiles(["app/api/modules"])) {
    if (!file.endsWith("/route.ts")) continue;
    if (!file.startsWith("app/api/modules/")) continue;
    const text = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const apiPath = routeFileToApiPath(file);
    for (const match of text.matchAll(/\bexport\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      handlers.push({
        method: match[1] as ApiMethod,
        apiPath,
        file,
        line: lineForIndex(text, match.index ?? 0),
      });
    }
  }
  return handlers;
}

function routeKey(method: ApiMethod, apiPath: string) {
  return `${method} ${apiPath}`;
}

function isIgnoredWriteRoute(handler: RouteHandler) {
  return EXPLICIT_NON_BUSINESS_WRITE_ROUTES.has(routeKey(handler.method, handler.apiPath));
}

function describeContract(handler: RouteHandler) {
  const contract = findApiContract(handler.method, handler.apiPath);
  if (!contract) return "contract=unregistered";
  return `resource=${contract.resourceKey ?? "none"} requiredActions=${contract.requiredActions.join("+") || "none"}`;
}

function main() {
  assert.throws(
    () => assertBusinessActionRegistryValid([{
      key: "space.department.tasks.example.submit",
      eligibility: "workflow_optional",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      workflowCategoryKey: "assessment",
    }]),
    /must use a base businessActionKey/,
    "space-derived workflow identities must stay retired",
  );
  const registrations = listBusinessActionRegistrations();
  const workflowEligible = listWorkflowEligibleBusinessActions();
  const readinessWarnings = listWorkflowReadinessWarnings(registrations);
  const highReadinessWarnings = readinessWarnings.filter((warning) => warning.severity === "high");
  const infoReadinessWarnings = readinessWarnings.filter((warning) => warning.severity === "info");
  const unknownReadinessKeys = listUnknownWorkflowReadinessKeys(registrations);
  const registeredRouteKeys = new Set<string>();
  const routesWithMultipleActions = new Map<string, string[]>();

  for (const registration of registrations) {
    for (const apiRoute of registration.apiRoutes ?? []) {
      const key = routeKey(apiRoute.method, apiRoute.path);
      registeredRouteKeys.add(key);
      routesWithMultipleActions.set(key, [...routesWithMultipleActions.get(key) ?? [], registration.key]);
    }
  }

  const writeHandlers = collectRouteHandlers()
    .filter((handler) => WRITE_METHODS.has(handler.method))
    .sort((left, right) => routeKey(left.method, left.apiPath).localeCompare(routeKey(right.method, right.apiPath)));

  const ignored = writeHandlers.filter(isIgnoredWriteRoute);
  const candidates = writeHandlers.filter((handler) => !isIgnoredWriteRoute(handler));
  const missing = candidates.filter((handler) => !registeredRouteKeys.has(routeKey(handler.method, handler.apiPath)));
  const multiMapped = [...routesWithMultipleActions.entries()]
    .filter(([, actionKeys]) => actionKeys.length > 1)
    .sort(([left], [right]) => left.localeCompare(right));
  const unclassifiedMultiMapped = multiMapped.filter(([key]) => !EXPLICIT_MULTI_ACTION_ROUTE_DISPATCHERS.has(key));
  const staleMultiActionDispatchers = [...EXPLICIT_MULTI_ACTION_ROUTE_DISPATCHERS.keys()]
    .filter((key) => !routesWithMultipleActions.has(key) || (routesWithMultipleActions.get(key)?.length ?? 0) < 2)
    .sort();
  const liveWriteRouteKeys = new Set(writeHandlers.map((handler) => routeKey(handler.method, handler.apiPath)));
  const staleClassifications = [...EXPLICIT_NON_BUSINESS_WRITE_ROUTES.keys()]
    .filter((key) => !liveWriteRouteKeys.has(key))
    .sort();

  process.stdout.write("Business action registry coverage report\n");
  process.stdout.write(`- registered actions: ${registrations.length}\n`);
  process.stdout.write(`- workflow-eligible actions: ${workflowEligible.length}\n`);
  process.stdout.write(`- write API candidates scanned: ${candidates.length}\n`);
  process.stdout.write(`- ignored non-business/system write routes: ${ignored.length}\n`);
  const ignoredKinds = new Map<NonBusinessWriteRouteKind, number>();
  for (const handler of ignored) {
    const classification = EXPLICIT_NON_BUSINESS_WRITE_ROUTES.get(routeKey(handler.method, handler.apiPath));
    if (classification) ignoredKinds.set(classification.kind, (ignoredKinds.get(classification.kind) ?? 0) + 1);
  }
  for (const [kind, count] of [...ignoredKinds].sort(([left], [right]) => left.localeCompare(right))) {
    process.stdout.write(`  - ${kind}: ${count}\n`);
  }

  if (staleClassifications.length > 0) {
    process.stdout.write("\nStale explicit non-business route classifications:\n");
    for (const key of staleClassifications) process.stdout.write(`  - ${key}\n`);
  }

  process.stdout.write("\nWorkflow readiness report\n");
  process.stdout.write(`- default-flow actions not ready: ${highReadinessWarnings.length}\n`);
  process.stdout.write(`- opt-in actions not ready: ${infoReadinessWarnings.length}\n`);
  process.stdout.write(`- readiness evidence unknown keys: ${unknownReadinessKeys.length}\n`);
  if (highReadinessWarnings.length > 0) {
    process.stdout.write("\nDefault-flow workflow readiness warnings:\n");
    for (const warning of highReadinessWarnings) {
      process.stdout.write(`  - ${warning.actionKey}: ${warning.message} state=${warning.state}\n`);
    }
  }
  if (infoReadinessWarnings.length > 0) {
    process.stdout.write("\nOpt-in workflow readiness gaps:\n");
    for (const warning of infoReadinessWarnings) {
      process.stdout.write(`  - ${warning.actionKey}: ${warning.message} state=${warning.state}\n`);
    }
  }
  if (unknownReadinessKeys.length > 0) {
    process.stdout.write("\nReadiness evidence references missing business actions:\n");
    for (const key of unknownReadinessKeys) {
      process.stdout.write(`  - ${key}\n`);
    }
  }

  if (multiMapped.length > 0) {
    process.stdout.write("\nRegistered routes with multiple business behaviors:\n");
    for (const [key, actionKeys] of multiMapped) {
      process.stdout.write(`  - ${key}: ${actionKeys.join(", ")}\n`);
    }
  }
  if (unclassifiedMultiMapped.length > 0) {
    process.stdout.write("\nMulti-action routes without an explicit typed dispatcher classification:\n");
    for (const [key] of unclassifiedMultiMapped) process.stdout.write(`  - ${key}\n`);
  }
  if (staleMultiActionDispatchers.length > 0) {
    process.stdout.write("\nStale multi-action dispatcher classifications:\n");
    for (const key of staleMultiActionDispatchers) process.stdout.write(`  - ${key}\n`);
  }

  if (missing.length === 0) {
    process.stdout.write("\nNo unregistered write API candidates found.\n");
  } else {
    process.stdout.write("\nUnregistered write API candidates:\n");
    for (const handler of missing) {
      process.stdout.write(`  - ${routeKey(handler.method, handler.apiPath)} (${describeContract(handler)}) at ${handler.file}:${handler.line}\n`);
    }
  }

  const gapCount = highReadinessWarnings.length + infoReadinessWarnings.length + unknownReadinessKeys.length
    + missing.length + staleClassifications.length + unclassifiedMultiMapped.length + staleMultiActionDispatchers.length;
  if (gapCount > 0) {
    throw new Error(`Business action registry coverage failed with ${gapCount} unresolved gap(s).`);
  }
}

main();
