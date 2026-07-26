import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

type Provider = {
  targetType: string;
  resolveActionProfile: (input: { userId: number; targetId: number }) => Promise<"read" | null>;
};

let provider: Provider | null = null;
let accessible = false;

mockModule("@workspace/platform/server/business-space-access-providers", {
  namedExports: {
    registerBusinessSpaceNaturalAccessProvider: (candidate: Provider) => { provider = candidate; },
  },
});
mockModule("./access", {
  namedExports: {
    getAccessibleProjectWorkspaceEntry: async () => (
      accessible ? { ok: true, projectId: 3 } : { ok: false, reason: "无权限访问该项目空间" }
    ),
  },
});

const { registerWorkBusinessSpaceNaturalAccessProvider } = await import("./business-space-access-provider");

test("Work exposes accessible project workspaces as natural read access", async () => {
  registerWorkBusinessSpaceNaturalAccessProvider();
  assert.equal(provider?.targetType, "project");

  accessible = true;
  assert.equal(await provider?.resolveActionProfile({ userId: 1, targetId: 3 }), "read");

  accessible = false;
  assert.equal(await provider?.resolveActionProfile({ userId: 1, targetId: 3 }), null);
});
