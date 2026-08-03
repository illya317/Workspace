import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspaceRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function filesBelow(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(workspaceRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  return readdirSync(absoluteDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("Agent entry routes wire only the generic protected-business-API connector", () => {
  for (const relativePath of [
    "app/api/agent/route.ts",
    "app/api/agent/capabilities/route.ts",
    "app/api/agent/profiles/route.ts",
    "app/api/agent/proposals/[id]/confirm/route.ts",
    "app/api/integrations/wecom/agent/route.ts",
  ]) {
    const content = source(relativePath);
    assert.doesNotMatch(content, /@workspace\/(?:finance|hr|library|work)\//);
    assert.doesNotMatch(content, /source-code|remote-domain-rpc|docsEditorAgentTools|AgentTools/);
  }

  assert.match(source("app/api/agent/route.ts"), /agentBusinessApiTools/);
  assert.match(source("app/api/integrations/wecom/agent/route.ts"), /agentBusinessApiTools/);
  assert.match(source("app/api/agent/proposals/[id]/confirm/route.ts"), /agentBusinessApiProposalExecutors/);
});

test("domain Agent Harness files and private Agent RPC routes cannot return", () => {
  const bannedRouteFiles = ["finance", "hr", "library", "work"].map(
    (domain) => `app/api/modules/${domain}/agent/rpc/route.ts`,
  );
  assert.deepEqual(
    bannedRouteFiles.filter((relativePath) => existsSync(path.join(workspaceRoot, relativePath))),
    [],
  );

  const businessHarnessFiles = [
    ...filesBelow("packages/finance/server"),
    ...filesBelow("packages/hr/server"),
    ...filesBelow("packages/library/server"),
    ...filesBelow("packages/work/server"),
    ...filesBelow("packages/docs/server"),
  ].filter((absolutePath) => /(?:^|\/)(?:agent-tools|agent-|[^/]+-agent-(?:tool|tools|read-tools|validation|updates|delivery|search|structure|model|access|diff|preflight))[^/]*\.ts$/.test(absolutePath));

  assert.deepEqual(businessHarnessFiles, []);

  const extraToolDefinitions = filesBelow("packages/platform/server/agent")
    .filter((absolutePath) => absolutePath.endsWith(".ts") && !absolutePath.endsWith(".test.ts"))
    .filter((absolutePath) => !absolutePath.endsWith("/business-api-connector.ts"))
    .filter((absolutePath) => /:\s*AgentTool(?:\[\])?\s*=/.test(readFileSync(absolutePath, "utf8")));
  assert.deepEqual(extraToolDefinitions, []);

  const catalog = source("packages/platform/server/personal-api-catalog.ts");
  assert.doesNotMatch(catalog, /\/api\/modules\/(?:finance|hr|library|work|docs)\//);
  assert.doesNotMatch(catalog, /LegacyHarness|replacesLegacy|PERSONAL_API_WORKFLOWS/);
});

test("deployment no longer provisions an Agent source checkout", () => {
  const deploy = source("ops/deploy-image.sh");
  const release = source("ops/cnb-release.sh");
  assert.doesNotMatch(deploy, /sync_remote_agent_source|source\.agent|REMOTE_AGENT_SOURCE_DIR/);
  assert.doesNotMatch(deploy, /git (?:clone|checkout|fetch)|npm (?:ci|install)|next build/);
  assert.match(release, /docker pull "\$\{IMAGE_REF\}@\$\{IMAGE_DIGEST\}"/);
  assert.match(deploy, /verify_local_image/);
});
