import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCnbBuildResponse,
  parseCnbTriggerResponse,
  verifyLegacyCnbBuild,
} from "./cnb-build-state.mjs";

const sn = "cnb-5co-1js3ag2sv";

test("accepted CNB triggers bind the build SN and log URL", () => {
  assert.deepEqual(parseCnbTriggerResponse({
    status: 200,
    data: {
      success: true,
      sn,
      buildLogUrl: `https://cnb.cool/example-owner/example-repo/-/build/logs/${sn}`,
    },
  }), {
    schemaVersion: 1,
    sn,
    buildLogUrl: `https://cnb.cool/example-owner/example-repo/-/build/logs/${sn}`,
  });
  assert.throws(() => parseCnbTriggerResponse({
    status: 200,
    data: { success: true, sn, buildLogUrl: "https://attacker.example/build" },
  }), /does not match/);
});

test("CNB terminal failures are distinct from active and unknown states", () => {
  assert.equal(classifyCnbBuildResponse({ status: 200, data: { status: "success" } }), "success");
  for (const state of ["pending", "start", "running", "queued"]) {
    assert.equal(classifyCnbBuildResponse({ status: 200, data: { status: state } }), "active");
  }
  for (const state of ["failure", "failed", "error", "cancel", "cancelled", "timeout"]) {
    assert.equal(classifyCnbBuildResponse({ status: 200, data: { status: state } }), "failure");
  }
  assert.equal(classifyCnbBuildResponse({ status: 503 }), "unknown");
  assert.equal(classifyCnbBuildResponse({ status: 200, data: { status: "future-state" } }), "unknown");
});

test("legacy bootstrap binds exact CNB commit and successful deploy stage", () => {
  const sha = "a".repeat(40);
  const historyResponse = {
    status: 200,
    data: {
      total: "1",
      data: [{
        sn,
        slug: "example-owner/example-repo",
        sourceSlug: "example-owner/example-repo",
        sha,
        event: "api_trigger_manual",
        sourceRef: "cnb-release",
        targetRef: "cnb-release",
        status: "success",
        pipelineTotalCount: 1,
        pipelineFailCount: 0,
        pipelineSuccessCount: 1,
      }],
    },
  };
  const statusResponse = {
    status: 200,
    data: {
      status: "success",
      pipelinesStatus: {
        [`${sn}-001`]: {
          name: "deploy-prod",
          status: "success",
          stages: [{ name: "deploy-to-server", status: "success" }],
        },
      },
    },
  };
  assert.deepEqual(verifyLegacyCnbBuild({
    historyResponse,
    statusResponse,
    repository: "example-owner/example-repo",
    sn,
    sha,
  }), { repository: "example-owner/example-repo", sn, sha });
  statusResponse.data.pipelinesStatus[`${sn}-001`].stages[0].status = "failed";
  assert.throws(() => verifyLegacyCnbBuild({
    historyResponse,
    statusResponse,
    repository: "example-owner/example-repo",
    sn,
    sha,
  }), /deploy-to-server/);
});
