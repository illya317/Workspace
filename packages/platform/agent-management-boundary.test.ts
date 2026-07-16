import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { registeredModuleDefinitions } from "./module-registry";
import { getActionContractMetadata } from "./action-contract-registry";
import { getBusinessActionRegistration } from "./business-action-registry";
import { resolvePermissionApiActionPolicy } from "./permission-api-action-policy";
import {
  getPermissionResourceActionPolicy,
  isPermissionActionExplicitOnly,
  isPermissionActionSupported,
} from "./permission-resource-policy";
import { getCapabilityOwnerKey, getResourceDef, isMainRbacResource } from "./resources";

test("Agent toolbar capability stays outside the restricted management resource tree", () => {
  const registration = registeredModuleDefinitions.find((item) => item.moduleDef?.key === "agent");
  const moduleDef = registration?.moduleDef;

  assert.equal(moduleDef?.resourceKey, "agent");
  assert.deepEqual(moduleDef?.children?.map((child) => ({
    href: child.href,
    resourceKey: child.resourceKey,
  })), [
    { href: "/agent/config", resourceKey: "agent.config" },
    { href: "/agent/usage", resourceKey: "agent.usage" },
    { href: "/agent/reports", resourceKey: "agent.reports" },
  ]);

  const assistant = getResourceDef("agent.assistant");
  assert.equal(assistant?.kind, "capability");
  assert.equal(assistant?.parentKey, undefined);
  assert.equal(assistant?.runtimeParentKey, "agent");
  assert.equal(getCapabilityOwnerKey("agent.assistant"), "settings.account");
  assert.equal(isMainRbacResource("agent.assistant"), false);
  assert.equal(isMainRbacResource("agent"), true);

  const source = getResourceDef("agent.source");
  assert.equal(source?.kind, "capability");
  assert.equal(source?.parentKey, undefined);
  assert.equal(source?.runtimeParentKey, "agent");
  assert.equal(getCapabilityOwnerKey("agent.source"), "agent.assistant");
  assert.equal(isMainRbacResource("agent.source"), false);
});

test("Agent detail views require explicit audit without declaring unsupported exports", () => {
  const assistant = getPermissionResourceActionPolicy("agent.assistant");

  for (const resourceKey of ["agent.usage", "agent.reports"] as const) {
    assert.equal(isPermissionActionSupported(resourceKey, "entry"), true);
    assert.equal(isPermissionActionSupported(resourceKey, "read"), true);
    assert.equal(isPermissionActionSupported(resourceKey, "audit"), true);
    assert.equal(isPermissionActionSupported(resourceKey, "export"), false);
    assert.equal(isPermissionActionExplicitOnly(resourceKey, "audit"), true);
    assert.equal(isPermissionActionExplicitOnly(resourceKey, "export"), false);
    assert.equal(isPermissionActionExplicitOnly(resourceKey, "read"), false);
  }
  assert.equal(assistant?.status, "capability");
  assert.equal(isPermissionActionExplicitOnly("agent.assistant", "entry"), true);
  assert.equal(isPermissionActionExplicitOnly("agent.assistant", "read"), true);
  assert.equal(isPermissionActionExplicitOnly("agent.assistant", "submit"), true);
  assert.equal(isPermissionActionExplicitOnly("agent.assistant", "audit"), false);

  const source = getPermissionResourceActionPolicy("agent.source");
  assert.equal(source?.status, "capability");
  assert.equal(isPermissionActionSupported("agent.source", "entry"), false);
  assert.equal(isPermissionActionExplicitOnly("agent.source", "entry"), false);
  assert.equal(isPermissionActionExplicitOnly("agent.source", "read"), true);
  assert.equal(isPermissionActionExplicitOnly("agent.source", "submit"), true);
  assert.equal(isPermissionActionSupported("agent.source", "audit"), false);
});

test("Workspace source and CNB tools are profile-only and use the separate source capability", () => {
  const tools = readFileSync("packages/platform/server/agent/source-code-tools.ts", "utf8");
  const executor = readFileSync("packages/platform/server/agent/cnb-pr.ts", "utf8");

  assert.match(tools, /sourceSearchTool[\s\S]*resourceKey: "agent\.source", action: "read"[\s\S]*requiresAgentProfile: true/);
  assert.match(tools, /prProposalTool[\s\S]*resourceKey: "agent\.source", action: "submit"[\s\S]*requiresAgentProfile: true/);
  assert.match(executor, /"source\.submitCnbPullRequest"[\s\S]*resourceKey: "agent\.source", action: "submit"[\s\S]*requiresAgentProfile: true/);
  assert.match(executor, /uncertainFailureBoundary: "external_dispatch"/);
  assert.match(
    executor,
    /markExternalDispatchStarted\(\);\s*await run\("git", buildCnbCreateOnlyPushArgs/,
  );
});

test("CNB PR confirmation is a direct remote effect with truthful local audit semantics", () => {
  const action = getBusinessActionRegistration("source.submitCnbPullRequest");
  const contract = getActionContractMetadata("source.submitCnbPullRequest");

  assert.equal(action?.resourceKey, "agent.source");
  assert.equal(action?.eligibility, "permission_only");
  assert.equal(action?.directPermissionAction, "submit");
  assert.deepEqual(action?.apiRoutes, [{
    method: "POST",
    path: "/api/agent/proposals/:id/confirm",
    notes: "通用提案确认路由按 AgentProposal.actionKey 分发到 CNB executor，并在执行前重新校验请求人与虚拟员工权限。",
  }]);
  assert.equal(contract?.kind, "remote_effect");
  if (!contract || contract.kind !== "remote_effect") return;
  assert.equal(contract.persistence, undefined);
  assert.equal(contract.remoteEffect.provider, "CNB");
  assert.equal(contract.remoteEffect.operation, "create_pull_request");
  assert.equal(contract.remoteEffect.localAuditEntity, "AgentProposal");
  assert.equal(contract.remoteEffect.outcomeAfterDispatchFailure, "unknown");
  assert.equal(contract.remoteEffect.retryPolicy, "reconcile_before_retry");
  assert.deepEqual(contract.api.directRoutes, ["POST /api/agent/proposals/:id/confirm"]);
  assert.equal("bindings" in contract.domain, false);
  if ("bindings" in contract.domain) return;
  assert.match(contract.domain.validatorKey ?? "", /cnb-pr\.validateCnbPullRequestProposalPayload$/);
  assert.match(contract.domain.commitKey ?? "", /cnb-pr\.executeCnbPullRequestProposal$/);
});

test("toolbar visibility is projected from agent.assistant submit access", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const provider = readFileSync("packages/platform/ui/PageAssistantProvider.tsx", "utf8");

  assert.match(layout, /visibleSubmitResourceKeys\?\.includes\("agent\.assistant"\)/);
  assert.match(layout, /<WorkspacePageAssistantProvider enabled=\{canUseAgentAssistant\}>/);
  assert.match(provider, /if \(!enabled\) return children;/);
});

test("Agent management pages require read in addition to route entry", () => {
  const pages = [
    ["app/(modules)/agent/config/page.tsx", "/agent/config"],
    ["app/(modules)/agent/usage/page.tsx", "/agent/usage"],
    ["app/(modules)/agent/reports/page.tsx", "/agent/reports"],
  ] as const;

  for (const [file, pathname] of pages) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`requireRouteActionAccess\\(\"${pathname}\", \"read\"\\)`));
  }
});

test("Agent configuration write is canonical and configure-guarded", () => {
  const registration = registeredModuleDefinitions.find((item) => item.moduleDef?.key === "agent");
  const config = registration?.moduleDef?.children?.find((child) => child.resourceKey === "agent.config");
  const apiPolicy = resolvePermissionApiActionPolicy({
    method: "PUT",
    apiPath: "/api/modules/agent/config",
    resourceKey: "agent.config",
  });
  const action = getBusinessActionRegistration("agent.config.save");
  const contract = getActionContractMetadata("agent.config.save");

  assert.deepEqual(config?.apiPrefixes, ["/api/modules/agent/config"]);
  assert.deepEqual(apiPolicy.requiredActions, ["configure"]);
  assert.equal(apiPolicy.resourceKey, "agent.config");
  assert.equal(action?.eligibility, "permission_only");
  assert.equal(action?.directPermissionAction, "configure");
  assert.deepEqual(action?.apiRoutes, [{ method: "PUT", path: "/api/modules/agent/config" }]);
  assert.equal(contract?.kind, "governance");
  if (!contract || contract.kind !== "governance") return;
  assert.equal(contract.governance.auditPolicy, "history");
  assert.equal("bindings" in contract.domain, false);
  if ("bindings" in contract.domain) return;
  assert.match(contract.domain.validatorKey ?? "", /configuration-validation\.validateAgentConfigurationUpdate$/);
  assert.match(contract.domain.commitKey ?? "", /configuration-service\.executeAgentConfigurationUpdateCommand$/);
});

test("Agent configuration UI owns the ceiling, focused grants, and runtime allowlists", () => {
  const page = readFileSync("app/(modules)/agent/config/page.tsx", "utf8");
  const client = readFileSync("packages/platform/ui/AgentConfigurationClient.tsx", "utf8");
  const sections = readFileSync("packages/platform/ui/agent-configuration-sections.ts", "utf8");
  const permissions = readFileSync("packages/platform/ui/agent-permission-management.tsx", "utf8");
  const route = readFileSync("app/api/modules/agent/config/route.ts", "utf8");

  assert.match(page, /evaluatePermissionAction\(user\.id, "agent\.config", "configure"\)/);
  assert.match(page, /canConfigure=\{canConfigure\}/);
  assert.match(client, /putJson<AgentConfigurationUpdateResult>/);
  assert.match(client, /"\/api\/modules\/agent\/config"/);
  assert.match(sections, /workspaceCapabilityOptions\(runtime, draft\.capabilityKeys\)/);
  assert.match(permissions, /\/api\/modules\/agent\/config\/action-ceiling/);
  assert.match(permissions, /\/api\/modules\/agent\/config\/permission-grants/);
  assert.match(permissions, /"user" \| "position" \| "department"/);
  assert.match(permissions, /agent\.config\.configure 不会绕过这条边界/);
  assert.doesNotMatch(sections, /href: "\/settings\/admin"/);
  assert.match(route, /createCommandRoute/);
  assert.match(route, /export const GET = createApiRouteHandler/);
  assert.match(client, /requestJson<AgentConfigurationData>\("\/api\/modules\/agent\/config"/);
  assert.match(route, /agentConfigurationUpdateSchema/);
  assert.match(route, /buildAgentConfigurationUpdateCommand/);
  assert.match(route, /executeAgentConfigurationUpdateCommand/);
  assert.doesNotMatch(route, /prisma/);
});

test("task reports keep current responsibility and latest-run exceptions orthogonal", () => {
  const directory = readFileSync("packages/platform/server/agent/management-directory.ts", "utf8");
  const reports = readFileSync("packages/platform/ui/AgentReportsClient.tsx", "utf8");

  assert.match(directory, /latestRunStatus,/);
  assert.match(directory, /latestRunStatus === "failed" \|\| latestRunStatus === "aborted"/);
  assert.match(reports, /report\.latestRunStatus === "failed" \|\| report\.latestRunStatus === "aborted"/);
  assert.match(reports, /最近运行\$\{latestRunStatus\.label\}/);
});
