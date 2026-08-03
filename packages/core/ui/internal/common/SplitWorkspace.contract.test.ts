import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSplitWorkspacePanelSize } from "./SplitWorkspace";

test("SplitWorkspace ratio model changes with controlled props while fixed sidebar stays 400px", () => {
  assert.equal(resolveSplitWorkspacePanelSize([3, 7], "ratio"), "30%");
  assert.equal(resolveSplitWorkspacePanelSize([4, 6], "ratio"), "40%");
  assert.equal(resolveSplitWorkspacePanelSize([9, 1], "fixed-sidebar"), 400);

  const source = readFileSync(new URL("./SplitWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /useEffect\(\(\) => setPanelSize\(requestedPanelSize\)/);
  assert.match(source, /size=\{panelSize\}/);
  assert.doesNotMatch(source, /defaultSize=/);
});
