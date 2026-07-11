#!/usr/bin/env tsx

import "./action-contract-route-binding-fixtures";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listBusinessActionRegistrations } from "../../packages/platform/business-action-registry";
import { listActionContractMetadata } from "../../packages/platform/action-contract-registry";
import { listActionContractRouteBindingIssues } from "../../packages/platform/action-contract-route-binding";
import {
  resolveActionRuntime,
  type ActionRuntimeAction,
  type ActionRuntimeRequestSnapshot,
} from "../../packages/platform/workflow-action-runtime";
import {
  actionRuntimeCommands,
  actionRuntimeCreateSubmission,
} from "../../packages/platform/ui/workflow/action-runtime-commands";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BUSINESS_ACTION_KEY_PATTERN = "[a-z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z0-9_-]+)+";
const BUSINESS_ACTION_LITERAL_RE = new RegExp(
  `\\bbusinessActionKey\\s*:\\s*["'](${BUSINESS_ACTION_KEY_PATTERN})["']`,
  "g",
);
const CONST_BUSINESS_ACTION_RE = new RegExp(
  `\\bconst\\s+([A-Z0-9_]*BUSINESS_ACTION_KEY[A-Z0-9_]*)\\s*=\\s*["'](${BUSINESS_ACTION_KEY_PATTERN})["']`,
  "g",
);
const BUSINESS_ACTION_CONST_REF_RE = /\bbusinessActionKey\s*:\s*([A-Z0-9_]*BUSINESS_ACTION_KEY[A-Z0-9_]*)\b/g;

interface ContractUsage {
  key: string;
  file: string;
}

interface WorkflowEntryActionReference {
  key: string;
  file: string;
  line: number;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
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

function lineForIndex(text: string, index: number) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function collectActionContracts(): ContractUsage[] {
  return listActionContractMetadata()
    .map((contract) => ({
      key: contract.key,
      file: "packages/platform/action-contract-registry.ts",
    }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.file.localeCompare(right.file));
}

function isWorkflowEntrySource(file: string, text: string) {
  if (file.startsWith("scripts/")) return false;
  if (file.includes("/action-contract-registry")) return false;
  if (file.includes("/business-action-registry")) return false;
  if (file.includes("/workflow-action-readiness")) return false;
  if (/\bApprovalAdapter\b|\bworkflowDefaults\s*:/.test(text)) return true;
  return /(?:approval|approvals|submissions|workflow-actions|workflow-panel)/.test(file);
}

function collectWorkflowEntryActionReferences(): WorkflowEntryActionReference[] {
  const references: WorkflowEntryActionReference[] = [];
  for (const file of gitFiles(["app", "packages"])) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!isWorkflowEntrySource(file, text)) continue;

    const constKeys = new Map<string, string>();
    for (const match of text.matchAll(CONST_BUSINESS_ACTION_RE)) {
      constKeys.set(match[1], match[2]);
    }
    for (const match of text.matchAll(BUSINESS_ACTION_LITERAL_RE)) {
      references.push({ key: match[1], file, line: lineForIndex(text, match.index ?? 0) });
    }
    for (const match of text.matchAll(BUSINESS_ACTION_CONST_REF_RE)) {
      const key = constKeys.get(match[1]);
      if (!key) continue;
      references.push({ key, file, line: lineForIndex(text, match.index ?? 0) });
    }
  }

  const seen = new Set<string>();
  return references
    .filter((reference) => {
      const identity = `${reference.key}:${reference.file}:${reference.line}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort((left, right) => left.key.localeCompare(right.key) || left.file.localeCompare(right.file) || left.line - right.line);
}

function assertNoDuplicateContractKeys(usages: readonly ContractUsage[]) {
  const byKey = new Map<string, ContractUsage[]>();
  for (const usage of usages) {
    byKey.set(usage.key, [...byKey.get(usage.key) ?? [], usage]);
  }
  const duplicates = [...byKey.entries()].filter(([, entries]) => entries.length > 1);
  if (duplicates.length === 0) return;
  const details = duplicates.map(([key, entries]) => (
    `  - ${key}: ${entries.map((entry) => entry.file).join(", ")}`
  ));
  fail(`Action contract keys must be unique.\n${details.join("\n")}`);
}

function actionDomainReferenceKeys() {
  const references: Array<{ actionKey: string; referenceKey: string }> = [];
  for (const contract of listActionContractMetadata()) {
    const domain = contract.domain;
    const bindings = "bindings" in domain && domain.bindings ? domain.bindings : [domain];
    for (const binding of bindings) {
      if ("validatorKey" in binding && binding.validatorKey) references.push({ actionKey: contract.key, referenceKey: binding.validatorKey });
      if ("commitKey" in binding) references.push({ actionKey: contract.key, referenceKey: binding.commitKey });
      if ("executeKey" in binding) references.push({ actionKey: contract.key, referenceKey: binding.executeKey });
    }
  }
  return references;
}

function resolveReferenceFile(modulePath: string) {
  const candidates = [`${modulePath}.ts`, `${modulePath}.tsx`, `${modulePath}/index.ts`];
  return candidates.find((candidate) => fs.existsSync(path.join(ROOT, candidate))) ?? null;
}

function canonicalApiPath(apiPath: string) {
  return apiPath
    .replace(/\[\.\.\.[^\]]+\]/g, ":*")
    .replace(/\[[^\]]+\]/g, ":param")
    .replace(/:([^/*][^/]*)/g, ":param");
}

function routeFileToApiPath(file: string) {
  const relativeToApp = path.relative(path.join(ROOT, "app"), path.join(ROOT, file)).replace(/\\/g, "/");
  return canonicalApiPath(`/${relativeToApp.replace(/\/route\.ts$/, "")}`);
}

function collectLiveApiRoutes() {
  const routes = new Set<string>();
  for (const file of gitFiles(["app/api"])) {
    if (!file.endsWith("/route.ts")) continue;
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const apiPath = routeFileToApiPath(file);
    for (const match of source.matchAll(/\bexport\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      routes.add(`${match[1]} ${apiPath}`);
    }
  }
  return routes;
}

function assertApiReferencesResolve() {
  const liveRoutes = collectLiveApiRoutes();
  const issues: string[] = [];
  for (const contract of listActionContractMetadata()) {
    const references = [
      contract.api.commandRoute,
      ...contract.api.directRoutes ?? [],
      ...contract.api.workflowRoutes ?? [],
    ].filter((reference): reference is string => Boolean(reference));
    for (const reference of new Set(references)) {
      const match = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s]+)$/.exec(reference);
      if (!match) {
        issues.push(`  - ${contract.key}: invalid API reference ${reference}`);
        continue;
      }
      const canonical = `${match[1]} ${canonicalApiPath(match[2])}`;
      if (!liveRoutes.has(canonical)) issues.push(`  - ${contract.key}: no live handler for ${reference}`);
    }
  }
  if (issues.length > 0) fail(`ActionContract API references must resolve to live route handlers:\n${issues.join("\n")}`);
}

function assertDomainReferencesResolve() {
  const issues: string[] = [];
  const runtimeFiles = gitFiles(["app", "packages"])
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes("/action-contract-registry"));
  for (const { actionKey, referenceKey } of actionDomainReferenceKeys()) {
    const separator = referenceKey.lastIndexOf(".");
    if (separator <= 0) {
      issues.push(`  - ${actionKey}: invalid domain reference ${referenceKey}`);
      continue;
    }
    const modulePath = referenceKey.slice(0, separator);
    const symbol = referenceKey.slice(separator + 1);
    const file = resolveReferenceFile(modulePath);
    if (!file) {
      issues.push(`  - ${actionKey}: missing module for ${referenceKey}`);
      continue;
    }
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const directExport = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|class)\\s+${escaped}\\b`).test(source);
    const namedExport = new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
    if (!directExport && !namedExport) {
      issues.push(`  - ${actionKey}: ${referenceKey} is not exported from ${file}`);
      continue;
    }
    const identifier = new RegExp(`\\b${escaped}\\b`);
    const declarationFileUses = source.match(new RegExp(`\\b${escaped}\\b`, "g"))?.length ?? 0;
    const externalRuntimeUse = runtimeFiles.some((runtimeFile) => {
      if (runtimeFile === file || runtimeFile.endsWith("/index.ts")) return false;
      return identifier.test(fs.readFileSync(path.join(ROOT, runtimeFile), "utf8"));
    });
    if (declarationFileUses < 2 && !externalRuntimeUse) {
      issues.push(`  - ${actionKey}: ${referenceKey} has no runtime consumer outside registry metadata`);
    }
  }
  if (issues.length > 0) fail(`ActionContract domain references must resolve to exported symbols:\n${issues.join("\n")}`);
}

function assertWorkflowEntryActionsAreContracted(
  references: readonly WorkflowEntryActionReference[],
  actions: ReturnType<typeof listBusinessActionRegistrations>,
  contracts: readonly ContractUsage[],
) {
  const actionByKey = new Map(actions.map((action) => [action.key, action]));
  const contractKeys = new Set(contracts.map((contract) => contract.key));
  const contractByKey = new Map(listActionContractMetadata().map((contract) => [contract.key, contract]));
  const byKey = new Map<string, WorkflowEntryActionReference[]>();
  for (const reference of references) {
    byKey.set(reference.key, [...byKey.get(reference.key) ?? [], reference]);
  }

  const issues: string[] = [];
  for (const [key, refs] of byKey) {
    const locations = refs.map((ref) => `${ref.file}:${ref.line}`).join(", ");
    const action = actionByKey.get(key);
    if (!action) {
      issues.push(`  - ${key}: referenced by workflow entry but missing BusinessAction (${locations})`);
      continue;
    }
    if (action.eligibility !== "workflow_optional" && action.eligibility !== "workflow_required") {
      issues.push(`  - ${key}: workflow entry references ${action.eligibility} BusinessAction; expected workflow_optional/workflow_required (${locations})`);
      continue;
    }
    if (!contractKeys.has(key)) {
      issues.push(`  - ${key}: workflow entry references action without ActionContract (${locations})`);
      continue;
    }
    const workflow = contractByKey.get(key)?.workflow;
    if (!workflow || workflow.kind === "not_applicable") {
      issues.push(`  - ${key}: workflow entry ActionContract is not configurable/capable (${locations})`);
    }
  }

  if (issues.length > 0) {
    fail(`Workflow entry business actions must be workflow-eligible and backed by configurable ActionContract metadata:\n${issues.join("\n")}`);
  }
}

function assertWorkflowActionRuntimeMatrix() {
  const request = (overrides: Partial<ActionRuntimeRequestSnapshot>): ActionRuntimeRequestSnapshot => ({
    id: 1,
    status: "draft",
    submitterUserId: 10,
    handlerCanRevise: false,
    requestCanWithdraw: true,
    requestCanResubmit: true,
    requestCanCancel: true,
    requestCanRevise: true,
    ...overrides,
  });
  const runtime = (input: {
    mode?: "permission_only" | "required";
    actorUserId?: number;
    canDirectWrite?: boolean;
    canStartWorkflow?: boolean;
    canProcessWorkflow?: boolean;
    request?: ActionRuntimeRequestSnapshot | null;
  }) => resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: input.mode ?? "required",
    actor: {
      userId: input.actorUserId ?? 10,
      canDirectWrite: input.canDirectWrite,
      canStartWorkflow: input.canStartWorkflow,
      canProcessWorkflow: input.canProcessWorkflow,
    },
    request: input.request,
  });
  const cases: Array<{
    label: string;
    actual: ReturnType<typeof runtime>;
    expected: {
      executionMode: "direct" | "workflow";
      persistenceMode: "active" | "workflowDraft";
      role: "none" | "submitter" | "processor" | "observer";
      editability: "editable" | "readonly";
      actions: ActionRuntimeAction[];
    };
  }> = [
    {
      label: "direct record write",
      actual: runtime({ mode: "permission_only", canDirectWrite: true }),
      expected: {
        executionMode: "direct",
        persistenceMode: "active",
        role: "none",
        editability: "editable",
        actions: ["record.save", "form.cancel"],
      },
    },
    {
      label: "workflow entry",
      actual: runtime({ canStartWorkflow: true }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.submit", "form.cancel"],
      },
    },
    {
      label: "submitted owner can withdraw without record permission",
      actual: runtime({ mode: "permission_only", request: request({ status: "submitted", requestCanWithdraw: true }) }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "readonly",
        actions: ["workflow.request.withdraw"],
      },
    },
    {
      label: "withdraw and revise are independent",
      actual: runtime({ request: request({ status: "withdrawn", requestCanWithdraw: false, requestCanRevise: true }) }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.revise", "workflow.request.resubmit"],
      },
    },
    {
      label: "revise does not imply resubmit",
      actual: runtime({ request: request({ status: "rejected", requestCanRevise: true, requestCanResubmit: false }) }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.revise"],
      },
    },
    {
      label: "processor actions",
      actual: runtime({
        actorUserId: 20,
        canProcessWorkflow: true,
        request: request({ status: "submitted", handlerCanRevise: false }),
      }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "processor",
        editability: "readonly",
        actions: ["workflow.request.approve", "workflow.request.reject"],
      },
    },
    {
      label: "unrelated observer",
      actual: runtime({ actorUserId: 30, request: request({ status: "submitted" }) }),
      expected: {
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "observer",
        editability: "readonly",
        actions: [],
      },
    },
  ];

  for (const item of cases) {
    const actual = item.actual;
    const expected = item.expected;
    const mismatch = actual.executionMode !== expected.executionMode
      || actual.persistenceMode !== expected.persistenceMode
      || actual.workflowRole !== expected.role
      || actual.editability !== expected.editability
      || actual.actions.join("|") !== expected.actions.join("|");
    if (mismatch) {
      fail(`Workflow action runtime matrix mismatch (${item.label}).\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify({
        executionMode: actual.executionMode,
        persistenceMode: actual.persistenceMode,
        role: actual.workflowRole,
        editability: actual.editability,
        actions: actual.actions,
      })}`);
    }
  }

  const submittedNoWithdraw = runtime({
    request: request({ status: "submitted", requestCanWithdraw: false, requestCanRevise: true }),
  });
  if (submittedNoWithdraw.capabilities.workflowRequest.withdraw.reason !== "policy_disabled") {
    fail("Workflow request withdraw must be controlled by requestCanWithdraw only.");
  }
  const rejectedNoResubmit = runtime({
    request: request({ status: "rejected", requestCanRevise: true, requestCanResubmit: false }),
  });
  if (!rejectedNoResubmit.capabilities.workflowRequest.revise.allowed
    || rejectedNoResubmit.capabilities.workflowRequest.resubmit.reason !== "policy_disabled") {
    fail("Workflow request revise and resubmit capabilities must remain independent.");
  }
  const withdrawnNoRevise = runtime({
    request: request({ status: "withdrawn", requestCanWithdraw: true, requestCanRevise: false }),
  });
  if (withdrawnNoRevise.capabilities.workflowRequest.revise.reason !== "policy_disabled"
    || !withdrawnNoRevise.capabilities.workflowRequest.resubmit.allowed) {
    fail("Workflow request withdraw must not imply revise capability.");
  }
}

function assertActionRuntimeCommandMapping() {
  const handler = { onClick: () => undefined };
  const commandsFor = (runtime: ReturnType<typeof resolveActionRuntime>) => actionRuntimeCommands(runtime, {
    "record.save": handler,
    "form.cancel": handler,
    "workflow.request.submit": handler,
    "workflow.request.approve": handler,
    "workflow.request.reject": handler,
  });
  const direct = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "permission_only",
    actor: { userId: 1, canDirectWrite: true },
  }));
  const workflow = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "required",
    actor: { userId: 1, canStartWorkflow: true },
  }));
  const processor = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "required",
    actor: { userId: 2, canProcessWorkflow: true },
    request: {
      id: 1,
      status: "submitted",
      submitterUserId: 1,
      handlerCanRevise: false,
      requestCanWithdraw: true,
      requestCanResubmit: true,
      requestCanCancel: true,
      requestCanRevise: true,
    },
  }));
  const actual = [direct, workflow, processor]
    .map((commands) => commands.map((command) => command.kind).join("|"));
  const expected = ["save|cancel", "submit|cancel", "approve|reject"];
  if (actual.join(",") !== expected.join(",")) {
    fail(`Action runtime command mapping mismatch. Expected ${expected.join(",")}; received ${actual.join(",")}.`);
  }
  if ([...direct, ...workflow, ...processor].some((command) => "icon" in command || "variant" in command)) {
    fail("Action runtime commands must declare semantic actions only; Core owns icon and variant.");
  }
}

function assertActionRuntimeCreateSubmissionMapping() {
  const execute = () => undefined;
  const direct = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "permission_only",
    actor: { userId: 1, canDirectWrite: true },
  }), { execute });
  const workflow = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "required",
    actor: { userId: 1, canStartWorkflow: true },
  }), { execute });
  const unavailable = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "required",
    actor: { userId: 1 },
  }), { execute });
  if (direct?.action !== "save" || workflow?.action !== "submit" || unavailable !== null) {
    fail("CreateSurface submission must map direct runtime to save, workflow runtime to submit, and unavailable runtime to null.");
  }
}

function main() {
  const actions = listBusinessActionRegistrations();
  const actionKeys = new Set(actions.map((action) => action.key));
  const contracts = collectActionContracts();
  const contractKeys = new Set(contracts.map((contract) => contract.key));
  const workflowEntryReferences = collectWorkflowEntryActionReferences();
  assertWorkflowActionRuntimeMatrix();
  assertActionRuntimeCommandMapping();
  assertActionRuntimeCreateSubmissionMapping();
  assertNoDuplicateContractKeys(contracts);
  assertDomainReferencesResolve();
  assertApiReferencesResolve();
  const routeBindingIssues = listActionContractRouteBindingIssues(actions, listActionContractMetadata());
  if (routeBindingIssues.length > 0) {
    fail(`BusinessAction routes and ActionContract command/direct routes must bind exactly:\n${routeBindingIssues.map((issue) => `  - ${issue}`).join("\n")}`);
  }
  assertWorkflowEntryActionsAreContracted(workflowEntryReferences, actions, contracts);

  const unknown = contracts.filter((contract) => !actionKeys.has(contract.key));
  if (unknown.length > 0) {
    fail(`Action contracts reference unknown business actions:\n${unknown.map((contract) => `  - ${contract.key} at ${contract.file}`).join("\n")}`);
  }

  const missing = actions.filter((action) => !contractKeys.has(action.key));

  process.stdout.write("Action contract coverage report\n");
  process.stdout.write(`- registered business actions: ${actions.length}\n`);
  process.stdout.write(`- action contracts found: ${contracts.length}\n`);
  process.stdout.write(`- workflow entry business action references: ${workflowEntryReferences.length}\n`);
  process.stdout.write(`- business actions without ActionContract: ${missing.length}\n`);
  process.stdout.write("- domain references resolve to exported runtime symbols: passed.\n");
  process.stdout.write("- API references resolve to live route handlers: passed.\n");
  process.stdout.write("- BusinessAction routes bind exactly to Contract command/direct routes: passed.\n");
  process.stdout.write("- workflow action runtime matrix: passed.\n");
  process.stdout.write("- action runtime semantic command mapping: passed.\n");
  process.stdout.write("- CreateSurface runtime submission mapping: passed.\n");

  if (missing.length > 0) {
    fail(`Every BusinessAction must have ActionContract metadata:\n${missing.map((action) => `  - ${action.key}: ${action.label}`).join("\n")}`);
  }

  process.stdout.write("\nEvery registered BusinessAction has one resolving ActionContract.\n");
}

main();
