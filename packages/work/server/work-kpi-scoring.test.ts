import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorkKpiScore, DEFAULT_WORK_KPI_SCORING_RULE } from "./work-kpi-scoring";

test("higher-is-better score uses baseline progress and cap", () => {
  assert.equal(calculateWorkKpiScore({
    direction: "higher_is_better",
    baselineValue: 20,
    targetValue: 100,
    actualValue: 60,
    rule: DEFAULT_WORK_KPI_SCORING_RULE,
  }), 50);
  assert.equal(calculateWorkKpiScore({
    direction: "higher_is_better",
    baselineValue: 0,
    targetValue: 100,
    actualValue: 150,
    rule: DEFAULT_WORK_KPI_SCORING_RULE,
  }), 120);
});

test("lower-is-better score rewards reduction toward target", () => {
  assert.equal(calculateWorkKpiScore({
    direction: "lower_is_better",
    baselineValue: 10,
    targetValue: 2,
    actualValue: 6,
    rule: DEFAULT_WORK_KPI_SCORING_RULE,
  }), 50);
});

test("target range scores target and degrades outside the band", () => {
  assert.equal(calculateWorkKpiScore({
    direction: "target_range",
    targetLowerBound: 95,
    targetUpperBound: 105,
    actualValue: 100,
    rule: DEFAULT_WORK_KPI_SCORING_RULE,
  }), 100);
  assert.ok(calculateWorkKpiScore({
    direction: "target_range",
    targetLowerBound: 95,
    targetUpperBound: 105,
    actualValue: 90,
    rule: DEFAULT_WORK_KPI_SCORING_RULE,
  }) < 100);
});
