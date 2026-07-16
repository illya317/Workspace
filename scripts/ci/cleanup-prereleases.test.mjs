import assert from "node:assert/strict";
import test from "node:test";

import {
  activeDeploymentIsFresh,
  deploymentTagsToProtect,
  selectReleasesToDelete,
} from "./cleanup-prereleases.mjs";

function release(index, { ageHours = 48, prerelease = true } = {}) {
  return {
    id: index,
    tag_name: `ci-artifact-${index.toString(16).padStart(40, "0")}-run-${index}-attempt-1`,
    prerelease,
    published_at: new Date(Date.now() - (ageHours + index) * 60 * 60 * 1000).toISOString(),
  };
}

test("keeps the newest ten SHA prereleases", () => {
  const releases = Array.from({ length: 12 }, (_, index) => release(index + 1));
  const selected = selectReleasesToDelete({ releases, now: Date.now(), minimumAgeMs: 0 });
  assert.deepEqual(selected.map((item) => item.id), [11, 12]);
});

test("never selects a protected active deployment tag", () => {
  const releases = Array.from({ length: 12 }, (_, index) => release(index + 1));
  const protectedTags = new Set([releases[10].tag_name]);
  const selected = selectReleasesToDelete({ releases, protectedTags, now: Date.now(), minimumAgeMs: 0 });
  assert.deepEqual(selected.map((item) => item.id), [12]);
});

test("age grace and release shape prevent unsafe deletion", () => {
  const old = release(20, { ageHours: 48 });
  const recent = release(21, { ageHours: 1 });
  const stable = release(22, { ageHours: 48, prerelease: false });
  const unrelated = { ...release(23), tag_name: "v1.0.0" };
  const fillers = Array.from({ length: 10 }, (_, index) => release(index + 1));
  const selected = selectReleasesToDelete({
    releases: [...fillers, old, recent, stable, unrelated],
    keep: 10,
    now: Date.now(),
    minimumAgeMs: 24 * 60 * 60 * 1000,
  });
  assert.ok(selected.includes(old));
  assert.ok(!selected.includes(recent));
  assert.ok(!selected.includes(stable));
  assert.ok(!selected.includes(unrelated));
});

test("a production deployment whose latest status is success protects its release", async () => {
  const releases = Array.from({ length: 12 }, (_, index) => release(index + 1));
  const deployed = releases[10];
  const deploymentId = 501;
  const client = {
    pages: async (endpoint) => {
      assert.equal(endpoint, "/deployments?environment=production");
      return [{
        id: deploymentId,
        sha: deployed.tag_name.slice("ci-artifact-".length).split("-run-")[0],
        payload: { githubRunId: 11, githubRunAttempt: 1 },
      }];
    },
    request: async (endpoint) => {
      assert.equal(endpoint, `/deployments/${deploymentId}/statuses?per_page=1`);
      return [{ state: "success" }];
    },
  };
  const protectedTags = await deploymentTagsToProtect(client);
  const selected = selectReleasesToDelete({ releases, protectedTags, now: Date.now(), minimumAgeMs: 0 });
  assert.deepEqual(selected.map((item) => item.id), [12]);
});

test("only the newest successful production deployment is retained when GitHub leaves old production statuses active", async () => {
  const newerSha = "a".repeat(40);
  const olderSha = "b".repeat(40);
  const client = {
    pages: async () => [
      { id: 10, sha: newerSha, payload: { githubRunId: 100, githubRunAttempt: 2 } },
      { id: 9, sha: olderSha, payload: { githubRunId: 90, githubRunAttempt: 1 } },
    ],
    request: async () => [{ state: "success" }],
  };
  const protectedTags = await deploymentTagsToProtect(client);
  assert.deepEqual([...protectedTags], [`ci-artifact-${newerSha}-run-100-attempt-2`]);
});

test("failed or inactive deployments release retention while unknown status fails safe", async () => {
  const sha = "d".repeat(40);
  for (const [state, expected] of [["failure", false], ["inactive", false], [null, true]]) {
    const client = {
      pages: async () => [{ id: 7, sha, payload: { githubRunId: 70, githubRunAttempt: 3 } }],
      request: async () => state === null ? [] : [{ state }],
    };
    const protectedTags = await deploymentTagsToProtect(client);
    assert.equal(protectedTags.has(`ci-artifact-${sha}-run-70-attempt-3`), expected);
  }
});

test("unfinished deployment retention is bounded so abandoned CNB runs cannot pin artifacts forever", async () => {
  const now = Date.now();
  assert.equal(activeDeploymentIsFresh({
    created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
  }, now), true);
  assert.equal(activeDeploymentIsFresh({
    created_at: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
  }, now), false);
  const sha = "e".repeat(40);
  const protectedTags = await deploymentTagsToProtect({
    pages: async () => [{
      id: 8,
      sha,
      payload: { githubRunId: 80, githubRunAttempt: 1 },
      created_at: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
    }],
    request: async () => [{ state: "in_progress" }],
  }, { now });
  assert.equal(protectedTags.size, 0);
});
