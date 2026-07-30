const assert = require("node:assert/strict");
const test = require("node:test");

const { usesVerifiedApiRouteFactory } = require("./verified-api-route-factories");

test("accepts the exact HR analysis route factory from its public facade", () => {
  assert.equal(usesVerifiedApiRouteFactory(`
    import { createHrWorkspaceAnalysisSourceRoute } from "@workspace/hr/server/analysis";
    export const POST = createHrWorkspaceAnalysisSourceRoute();
  `), true);
});

test("accepts an aliased binding only when the verified factory was imported", () => {
  assert.equal(usesVerifiedApiRouteFactory(`
    import {
      createHrWorkspaceAnalysisSourceRoute as createRoute,
    } from "@workspace/hr/server/analysis";
    export const POST = createRoute();
  `), true);
});

test("rejects unprotected routes and lookalike factories", () => {
  assert.equal(usesVerifiedApiRouteFactory(`
    export async function POST() {
      return Response.json({ ok: true });
    }
  `), false);
  assert.equal(usesVerifiedApiRouteFactory(`
    import { createHrWorkspaceAnalysisSourceRoute } from "@workspace/hr/server/analysis";
    if (false) createHrWorkspaceAnalysisSourceRoute();
    export async function POST() {
      return Response.json({ ok: true });
    }
  `), false);
  assert.equal(usesVerifiedApiRouteFactory(`
    import { createHrWorkspaceAnalysisSourceRoute } from "@workspace/example/server/analysis";
    export const POST = createHrWorkspaceAnalysisSourceRoute();
  `), false);
  assert.equal(usesVerifiedApiRouteFactory(`
    import { createSomethingElseRoute } from "@workspace/hr/server/analysis";
    export const POST = createSomethingElseRoute();
  `), false);
});
