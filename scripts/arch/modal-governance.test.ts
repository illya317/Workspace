import assert from "node:assert/strict";
import test from "node:test";

import { compareModalBaseline, findModalGovernanceViolationsInSource } from "./modal-governance";

test("rejects CreateSurface modal presentation", () => {
  const violations = findModalGovernanceViolationsInSource("page.tsx", `
    const create = { id: "employee-create", presentation: "modal" };
  `);
  assert.equal(violations.some((item) => item.kind === "create-surface-modal"), true);
});

test("accepts approved BodySurface modal purposes", () => {
  const violations = findModalGovernanceViolationsInSource("audit.tsx", `
    const modal = createPageModalSection("audit", {
      purpose: "audit-history",
      open: true,
      title: "编辑历史",
      onClose,
      sections: [],
    });
  `);
  assert.deepEqual(violations, []);
});

test("baselines unclassified helper and raw modal declarations", () => {
  const helper = findModalGovernanceViolationsInSource("upload.tsx", `
    const modal = createPageModalSection("upload", { open, title: "上传", onClose, sections: [] });
  `);
  const raw = findModalGovernanceViolationsInSource("audit.tsx", `
    function modal(): BodySurfaceModalSpec {
      return { key: "audit", open: true, title: "历史", onClose, sections: [] };
    }
  `);
  assert.deepEqual(helper.map((item) => item.key), ["upload.tsx#upload"]);
  assert.deepEqual(raw.map((item) => item.key), ["audit.tsx#audit"]);
});

test("detects typed BodySurface modal variables outside helpers", () => {
  const violations = findModalGovernanceViolationsInSource("detail.tsx", `
    const modal: BodySurfaceModalSpec = {
      key: "detail",
      open: true,
      title: "详情",
      onClose,
      sections: [],
    };
  `);
  assert.deepEqual(violations.map((item) => item.key), ["detail.tsx#detail"]);
});

test("exact baseline rejects additions and stale entries", () => {
  assert.deepEqual(compareModalBaseline(["a", "b"], ["a", "c"]), {
    additions: ["b"],
    stale: ["c"],
  });
});
