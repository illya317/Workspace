import assert from "node:assert/strict";
import test from "node:test";

import { mobileExperienceEntries, resolveMobileExperience } from "./mobile-experience";

test("every registered L2 has an explicit mobile product strategy", () => {
  assert.equal(mobileExperienceEntries.length, 28);
  assert.equal(mobileExperienceEntries.filter((child) => child.mobileExperience.strategy === "native").length, 26);
  assert.equal(mobileExperienceEntries.filter((child) => child.mobileExperience.strategy === "landscape").length, 1);
  assert.equal(mobileExperienceEntries.filter((child) => child.mobileExperience.strategy === "unavailable").length, 1);
});

test("resolves L2 and deep-route mobile strategies by the longest matching path", () => {
  assert.equal(resolveMobileExperience("/production/qc/12/stage-a").strategy, "native");
  assert.equal(resolveMobileExperience("/administration/erp-diligence").strategy, "native");
  assert.equal(resolveMobileExperience("/finance/statements").strategy, "landscape");
  assert.equal(resolveMobileExperience("/docs/editor").strategy, "native");
  assert.equal(resolveMobileExperience("/docs/editor/templates/8").strategy, "landscape");
  assert.equal(resolveMobileExperience("/settings/ui").strategy, "unavailable");
});
