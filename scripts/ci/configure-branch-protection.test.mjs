import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProtectionPayload,
  buildWorkflowPermissionsPayload,
  selectTrustedCheck,
  verifyProtection,
  verifyWorkflowPermissions,
} from "./configure-branch-protection.mjs";

const sha = "a".repeat(40);

test("selectTrustedCheck binds the exact successful branch head and app", () => {
  const selected = selectTrustedCheck([
    {
      name: "CI / required",
      head_sha: sha,
      status: "completed",
      conclusion: "failure",
      completed_at: "2026-07-16T01:00:00Z",
      check_suite: { head_branch: "main" },
      app: { id: 15368, slug: "github-actions" },
    },
    {
      name: "CI / required",
      head_sha: sha,
      status: "completed",
      conclusion: "success",
      completed_at: "2026-07-16T02:00:00Z",
      check_suite: { head_branch: "main" },
      app: { id: 15368, slug: "github-actions" },
    },
  ], { branch: "main", checkName: "CI / required", headSha: sha });

  assert.equal(selected.app.id, 15368);
  assert.equal(selected.conclusion, "success");
});

test("selectTrustedCheck accepts GitHub check responses that omit the suite branch", () => {
  const selected = selectTrustedCheck([{
    name: "CI / required",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    app: { id: 15368, slug: "github-actions" },
  }], { branch: "main", checkName: "CI / required", headSha: sha });

  assert.equal(selected.app.id, 15368);
});

test("selectTrustedCheck fails closed for another branch or SHA", () => {
  assert.throws(() => selectTrustedCheck([{
    name: "CI / required",
    head_sha: "b".repeat(40),
    status: "completed",
    conclusion: "success",
    check_suite: { head_branch: "feature" },
    app: { id: 15368, slug: "github-actions" },
  }], { branch: "main", checkName: "CI / required", headSha: sha }), /No successful/);
});

test("selectTrustedCheck rejects the right context from another GitHub App", () => {
  assert.throws(() => selectTrustedCheck([{
    name: "CI / required",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    check_suite: { head_branch: "main" },
    app: { id: 42, slug: "attacker-app" },
  }], { branch: "main", checkName: "CI / required", headSha: sha }), /GitHub Actions/);
});

test("protection payload requires PR flow, strict trusted check, and immutable history", () => {
  const payload = buildProtectionPayload({ checkName: "CI / required", appId: 15368 });
  assert.deepEqual(payload.required_status_checks.checks, [{ context: "CI / required", app_id: 15368 }]);
  assert.equal(payload.required_pull_request_reviews.required_approving_review_count, 0);
  assert.equal(payload.required_pull_request_reviews.require_code_owner_reviews, true);
  assert.equal(payload.required_pull_request_reviews.dismiss_stale_reviews, true);
  assert.equal(payload.required_pull_request_reviews.require_last_push_approval, false);
  assert.equal(payload.required_pull_request_reviews.bypass_pull_request_allowances, undefined);
  assert.equal(payload.enforce_admins, true);
  assert.equal(payload.required_linear_history, true);
  assert.equal(payload.allow_force_pushes, false);
  assert.equal(payload.allow_deletions, false);
});

test("trusted promotion can create bot-authored PRs without granting default write access", () => {
  assert.deepEqual(buildWorkflowPermissionsPayload(), {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: true,
  });
  assert.doesNotThrow(() => verifyWorkflowPermissions(buildWorkflowPermissionsPayload()));
  assert.throws(() => verifyWorkflowPermissions({
    default_workflow_permissions: "write",
    can_approve_pull_request_reviews: true,
  }), /workflow permissions/);
  assert.throws(() => verifyWorkflowPermissions({
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
  }), /trusted promotion/);
});

test("verifyProtection rejects a context supplied by the wrong app", () => {
  const protection = {
    required_status_checks: { strict: true, checks: [{ context: "CI / required", app_id: 999 }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      require_code_owner_reviews: true,
      dismiss_stale_reviews: true,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };
  assert.throws(() => verifyProtection(protection, { checkName: "CI / required", appId: 15368 }), /verification failed/);
});

test("verifyProtection rejects protection without code-owner review", () => {
  const protection = {
    required_status_checks: { strict: true, checks: [{ context: "CI / required", app_id: 15368 }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      require_code_owner_reviews: false,
      dismiss_stale_reviews: true,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };
  assert.throws(() => verifyProtection(protection, { checkName: "CI / required", appId: 15368 }), /verification failed/);
});

test("verifyProtection rejects stale approvals but keeps ordinary PRs usable for a single-owner repository", () => {
  for (const reviews of [
    { dismiss_stale_reviews: false, require_last_push_approval: false },
    { dismiss_stale_reviews: true, require_last_push_approval: true },
  ]) {
    const protection = {
      required_status_checks: { strict: true, checks: [{ context: "CI / required", app_id: 15368 }] },
      enforce_admins: { enabled: true },
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        require_code_owner_reviews: true,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
        ...reviews,
      },
      required_linear_history: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_conversation_resolution: { enabled: true },
    };
    assert.throws(() => verifyProtection(protection, { checkName: "CI / required", appId: 15368 }), /verification failed/);
  }
});

test("verifyProtection rejects any actor allowed to bypass pull requests", () => {
  const protection = {
    required_status_checks: { strict: true, checks: [{ context: "CI / required", app_id: 15368 }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      require_code_owner_reviews: true,
      dismiss_stale_reviews: true,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [{ login: "bypass" }], teams: [], apps: [] },
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };
  assert.throws(() => verifyProtection(protection, { checkName: "CI / required", appId: 15368 }), /verification failed/);
});
