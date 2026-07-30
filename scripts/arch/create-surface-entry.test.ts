import assert from "node:assert/strict";
import test from "node:test";

import { findCreateSurfaceEntryViolationsInSource } from "./create-surface-entry";

test("accepts the single PageSurface create slot", () => {
  const violations = findCreateSurfaceEntryViolationsInSource("page.tsx", `
    const page = <PageSurface create={{
      id: "product-create",
      presentation: "modal",
      title: "新增产品",
      open: false,
      content: { kind: "form", form: { items: [] } },
      submission: { action: "save", execute: save },
      onOpenChange: setOpen,
    }} />;
  `);

  assert.deepEqual(violations, []);
});

test("rejects toolbar create declarations nested in a body", () => {
  const violations = findCreateSurfaceEntryViolationsInSource("legacy.tsx", `
    const section = {
      body: {
        kind: "create",
        create: { trigger: "toolbar", presentation: "modal" },
      },
    };
  `);

  assert.equal(violations.some((violation) => violation.kind === "toolbar-trigger"), true);
});
