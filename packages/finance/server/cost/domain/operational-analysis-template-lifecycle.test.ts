import assert from "node:assert/strict";
import test from "node:test";

import {
  hasOperationalAnalysisDraft,
  planOperationalAnalysisTemplateLifecycle,
  type OperationalAnalysisTemplateLifecycleState,
} from "./operational-analysis-template-lifecycle";

const published: OperationalAnalysisTemplateLifecycleState = {
  status: "active",
  revision: 3,
  publishedRevision: 3,
};

test("draft detection distinguishes unpublished, dirty and clean active templates", () => {
  assert.equal(hasOperationalAnalysisDraft(published), false);
  assert.equal(hasOperationalAnalysisDraft({ ...published, revision: 4 }), true);
  assert.equal(hasOperationalAnalysisDraft({ ...published, publishedRevision: null }), true);
  assert.equal(hasOperationalAnalysisDraft({ ...published, status: "archived", revision: 4 }), false);
});

test("publishing copies the draft head into a new immutable published revision", () => {
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ ...published, revision: 4 }, { kind: "publish" }),
    {
      ok: true,
      plan: {
        changeKind: "publish",
        nextRevision: 5,
        nextStatus: "active",
        nextPublishedRevision: 5,
        snapshotSourceRevision: 4,
        publishedAudit: "set",
        archivedAudit: "keep",
      },
    },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle(published, { kind: "publish" }),
    { ok: false, issue: "no_draft" },
  );
});

test("rollback is copy-forward and refuses to overwrite a dirty draft", () => {
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle(published, { kind: "rollback", sourceRevision: 1 }),
    {
      ok: true,
      plan: {
        changeKind: "rollback",
        nextRevision: 4,
        nextStatus: "active",
        nextPublishedRevision: 4,
        snapshotSourceRevision: 1,
        publishedAudit: "set",
        archivedAudit: "keep",
      },
    },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ ...published, revision: 4 }, { kind: "rollback", sourceRevision: 1 }),
    { ok: false, issue: "dirty_draft" },
  );
});

test("discard copies the published snapshot and cannot discard a never-published draft", () => {
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ ...published, revision: 4 }, { kind: "discard" }),
    {
      ok: true,
      plan: {
        changeKind: "discard",
        nextRevision: 5,
        nextStatus: "active",
        nextPublishedRevision: 5,
        snapshotSourceRevision: 3,
        publishedAudit: "set",
        archivedAudit: "keep",
      },
    },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ status: "active", revision: 1, publishedRevision: null }, { kind: "discard" }),
    { ok: false, issue: "unpublished_template" },
  );
});

test("archive requires a clean published template and restore returns it as a draft", () => {
  const archived = planOperationalAnalysisTemplateLifecycle(published, { kind: "archive" });
  assert.deepEqual(archived, {
    ok: true,
    plan: {
      changeKind: "archive",
      nextRevision: 4,
      nextStatus: "archived",
      nextPublishedRevision: 3,
      snapshotSourceRevision: 3,
      publishedAudit: "keep",
      archivedAudit: "set",
    },
  });
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ status: "archived", revision: 4, publishedRevision: 3 }, { kind: "restore" }),
    {
      ok: true,
      plan: {
        changeKind: "restore",
        nextRevision: 5,
        nextStatus: "active",
        nextPublishedRevision: null,
        snapshotSourceRevision: 3,
        publishedAudit: "clear",
        archivedAudit: "clear",
      },
    },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ ...published, revision: 4 }, { kind: "archive" }),
    { ok: false, issue: "dirty_draft" },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ status: "active", revision: 1, publishedRevision: null }, { kind: "archive" }),
    {
      ok: true,
      plan: {
        changeKind: "archive",
        nextRevision: 2,
        nextStatus: "archived",
        nextPublishedRevision: null,
        snapshotSourceRevision: 1,
        publishedAudit: "keep",
        archivedAudit: "set",
      },
    },
  );
  assert.deepEqual(
    planOperationalAnalysisTemplateLifecycle({ status: "archived", revision: 2, publishedRevision: null }, { kind: "restore" }),
    {
      ok: true,
      plan: {
        changeKind: "restore",
        nextRevision: 3,
        nextStatus: "active",
        nextPublishedRevision: null,
        snapshotSourceRevision: 2,
        publishedAudit: "clear",
        archivedAudit: "clear",
      },
    },
  );
});
