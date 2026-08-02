import assert from "node:assert/strict";
import test from "node:test";

import { createMasterDetailBody, createPageBody } from "../../helpers/page-surface-builders";
import { bodySurfacePageCreatePlacement } from "./BodySurfacePageIntegration";

test("page create stays at page level when the body has no split", () => {
  assert.equal(bodySurfacePageCreatePlacement(createPageBody([])), "page");
});

for (const masterLabel of ["投资企业", "尽调人员"]) {
  test(`page create for ${masterLabel} is projected into the split detail pane`, () => {
    const body = createMasterDetailBody({
      master: {
        label: masterLabel,
        body: { kind: "section", sections: [] },
      },
      detail: { kind: "section", sections: [] },
    });

    assert.equal(bodySurfacePageCreatePlacement(body), "split-detail");
  });
}
