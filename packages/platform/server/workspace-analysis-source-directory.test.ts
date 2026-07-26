import assert from "node:assert/strict";
import test from "node:test";

import {
  clearResourceRuntimeStateCache,
} from "../effective-module-registry";
import {
  getDynamicModuleRuntimeOverrides,
  setDynamicModuleRuntimeOverrides,
  type ModuleRuntimeOverrideMap,
} from "../module-overrides";
import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";
import {
  createLocalWorkspaceAnalysisSourceProvider,
  createWorkspaceAnalysisSourceDirectory,
  WorkspaceAnalysisSourceDirectoryConflictError,
} from "./workspace-analysis-source-directory";

function source(
  sourceKey: string,
  scopes: readonly WorkspaceAnalysisSourceScopeType[],
  version = 1,
): WorkspaceAnalysisSourceDefinition {
  return {
    sourceKey,
    version,
    label: sourceKey,
    description: `${sourceKey} test source`,
    ownerModuleKey: sourceKey.split(".")[0]!,
    authorization: {
      resourceKey: `${sourceKey}.read`,
      requiredActions: ["read"],
      projection: "default",
      enforcement: "gateway",
    },
    scopeBindings: Object.fromEntries(scopes.map((scopeType) => [scopeType, {
      mode: "target",
      description: `${scopeType} target binding`,
    }])),
    parameters: [],
    fields: [{
      key: "name",
      label: "名称",
      description: "测试名称",
      kind: "text",
      sensitivity: "internal",
      exportPolicy: "allowed",
      capabilities: { displayable: true, filterOperators: ["contains"], groupable: true, aggregateOperations: ["count"] },
    }],
    limits: { maxRows: 10, maxGroups: 10, maxPageSize: 10, maxPages: 1, maxBytes: 1_024, timeoutMs: 1_000 },
  };
}

const context = { requesterId: 7, targetType: "personal", targetId: 7 } as const;

test("combines providers deterministically without exposing provider order", async () => {
  const directory = createWorkspaceAnalysisSourceDirectory([
    { ownerUnitId: "hr", listAvailableSources: async () => [source("hr.employments", ["personal"])] },
    { ownerUnitId: "finance", listAvailableSources: async () => [source("finance.shipments", ["personal"])] },
  ]);

  const result = await directory.list(context);
  assert.deepEqual(result.sources.map((item) => item.sourceKey), ["finance.shipments", "hr.employments"]);
  assert.deepEqual(result.providers, [
    { ownerUnitId: "finance", status: "available", sourceCount: 1 },
    { ownerUnitId: "hr", status: "available", sourceCount: 1 },
  ]);
});

test("keeps local sources when an optional remote provider is unavailable", async () => {
  const directory = createWorkspaceAnalysisSourceDirectory([
    { ownerUnitId: "finance", listAvailableSources: async () => [source("finance.shipments", ["personal"])] },
    { ownerUnitId: "hr", listAvailableSources: async () => { throw new Error("connection refused"); } },
  ]);

  const result = await directory.list(context);
  assert.deepEqual(result.sources.map((item) => item.sourceKey), ["finance.shipments"]);
  assert.deepEqual(result.providers.find((provider) => provider.ownerUnitId === "hr"), {
    ownerUnitId: "hr",
    status: "unavailable",
    sourceCount: 0,
  });
  assert.equal(JSON.stringify(result).includes("connection refused"), false);
});

test("fails closed when a provider returns the same source version twice", async () => {
  const duplicate = source("finance.shared", ["personal"]);
  const directory = createWorkspaceAnalysisSourceDirectory([
    { ownerUnitId: "finance", listAvailableSources: async () => [duplicate, structuredClone(duplicate)] },
  ]);

  await assert.rejects(() => directory.list(context), (error) => (
    error instanceof WorkspaceAnalysisSourceDirectoryConflictError
    && error.sourceIdentities[0] === "finance.shared@1"
  ));
});

test("local providers filter by scope and re-evaluate authorization for each requester", async () => {
  const decisions: number[] = [];
  const provider = createLocalWorkspaceAnalysisSourceProvider({
    ownerUnitId: "finance",
    sourceCatalog: { list: () => [source("finance.shipments", ["personal"]), source("finance.department", ["department"])] },
    canDiscover: ({ requesterId, source: candidate }) => {
      decisions.push(requesterId);
      if (requesterId === 9) throw new Error("permission backend unavailable");
      return requesterId === 7 && candidate.sourceKey === "finance.shipments";
    },
  });

  assert.deepEqual((await provider.listAvailableSources(context)).map((item) => item.sourceKey), ["finance.shipments"]);
  assert.deepEqual(await provider.listAvailableSources({ ...context, requesterId: 8, targetId: 8 }), []);
  await assert.rejects(() => provider.listAvailableSources({ ...context, requesterId: 9, targetId: 9 }));
  assert.deepEqual(decisions, [7, 8, 9]);
});

test("disabled effective resources are hidden before local authorization and from remote-like providers", async () => {
  await withModuleRuntimeOverrides({ hr: { enabled: false } }, async () => {
    const disabledSource = {
      ...source("hr.employments", ["personal"]),
      authorization: {
        ...source("hr.employments", ["personal"]).authorization,
        resourceKey: "hr.roster",
      },
    };
    let discoveryCalls = 0;
    const localProvider = createLocalWorkspaceAnalysisSourceProvider({
      ownerUnitId: "hr",
      sourceCatalog: { list: () => [disabledSource] },
      canDiscover: () => {
        discoveryCalls += 1;
        return true;
      },
    });

    assert.deepEqual(await localProvider.listAvailableSources(context), []);
    assert.equal(discoveryCalls, 0);

    const remoteLikeResult = await createWorkspaceAnalysisSourceDirectory([{
      ownerUnitId: "hr",
      listAvailableSources: async () => [disabledSource],
    }]).list(context);
    assert.deepEqual(remoteLikeResult.sources, []);
    assert.deepEqual(remoteLikeResult.providers, [{ ownerUnitId: "hr", status: "available", sourceCount: 0 }]);
  });
});

test("marks authorization failures as provider unavailable", async () => {
  const provider = createLocalWorkspaceAnalysisSourceProvider({
    ownerUnitId: "finance",
    sourceCatalog: { list: () => [source("finance.shipments", ["personal"])] },
    canDiscover: async () => { throw new Error("permission backend unavailable"); },
  });
  const result = await createWorkspaceAnalysisSourceDirectory([provider]).list(context);

  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.providers, [{ ownerUnitId: "finance", status: "unavailable", sourceCount: 0 }]);
});

test("skips providers outside their declared target types", async () => {
  let calls = 0;
  const directory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "hr",
    supportedTargetTypes: ["department"],
    listAvailableSources: async () => {
      calls += 1;
      return [];
    },
  }]);

  const result = await directory.list(context);
  assert.equal(calls, 0);
  assert.deepEqual(result.providers, [{ ownerUnitId: "hr", status: "not_applicable", sourceCount: 0 }]);
});

test("times out a hung optional provider and keeps other sources", async () => {
  const directory = createWorkspaceAnalysisSourceDirectory([
    { ownerUnitId: "finance", listAvailableSources: async () => [source("finance.shipments", ["personal"])] },
    {
      ownerUnitId: "hr",
      timeoutMs: 100,
      listAvailableSources: (_context, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    },
  ]);

  const result = await directory.list(context);
  assert.deepEqual(result.sources.map((item) => item.sourceKey), ["finance.shipments"]);
  assert.deepEqual(result.providers.find((provider) => provider.ownerUnitId === "hr"), {
    ownerUnitId: "hr",
    status: "unavailable",
    sourceCount: 0,
  });
});

test("rejects source definitions that do not belong to the provider", async () => {
  const directory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "hr",
    listAvailableSources: async () => [source("finance.shipments", ["personal"])],
  }]);

  const result = await directory.list(context);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.providers, [{ ownerUnitId: "hr", status: "unavailable", sourceCount: 0 }]);
});

test("accepts a canonical kebab deploy unit for a camel-cased module owner", async () => {
  const capitalSource = {
    ...source("capital-securities.companies", ["personal"]),
    ownerModuleKey: "capitalSecurities",
  };
  const directory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "capital-securities",
    listAvailableSources: async () => [capitalSource],
  }]);

  const result = await directory.list(context);
  assert.deepEqual(result.sources.map((item) => item.sourceKey), ["capital-securities.companies"]);
  assert.deepEqual(result.providers, [{ ownerUnitId: "capital-securities", status: "available", sourceCount: 1 }]);
});

async function withModuleRuntimeOverrides<T>(
  overrides: ModuleRuntimeOverrideMap,
  run: () => Promise<T>,
) {
  const previous = getDynamicModuleRuntimeOverrides();
  setDynamicModuleRuntimeOverrides(overrides);
  clearResourceRuntimeStateCache();
  try {
    return await run();
  } finally {
    setDynamicModuleRuntimeOverrides(previous);
    clearResourceRuntimeStateCache();
  }
}
