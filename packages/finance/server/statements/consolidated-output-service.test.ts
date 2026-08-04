import assert from "node:assert/strict";
import test from "node:test";

import { hasSupportedConsolidationPreviewRates } from "./consolidated-output-service";

test("preview accepts controlled historical capital amount rates", () => {
  assert.equal(hasSupportedConsolidationPreviewRates([
    { rateKind: "monthlyAverage" },
    { rateKind: "historicalCapitalAmount" },
  ]), true);
  assert.equal(hasSupportedConsolidationPreviewRates([
    { rateKind: "monthlyAverage" },
    { rateKind: "closing" },
  ]), false);
  assert.equal(hasSupportedConsolidationPreviewRates([{ rateKind: "historicalCapitalAmount" }]), false);
});
