import assert from "node:assert/strict";
import test from "node:test";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import { getGenerator } from "./registry";

test("Workspace authoritative generators use the governed Library taxonomy", () => {
  const categories = getTenantProfile().library.generatorCategories;
  for (const key of ["finance-report", "ownership-structure", "organization-chart", "roster-due-diligence", "contract-ledger"]) {
    const generator = getGenerator(key);
    assert.deepEqual(
      { code: generator?.categoryCode, name: generator?.categoryName },
      categories[key],
    );
  }
});
