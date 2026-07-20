import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { WorkKpiDirection, WorkKpiScoringRule } from "./work-kpi-types";

export const DEFAULT_WORK_KPI_SCORING_RULE: WorkKpiScoringRule = {
  kind: "linear",
  targetScore: 100,
  floorScore: 0,
  capScore: 120,
};

export function normalizeWorkKpiScoringRule(value: unknown): DomainValidationResult<WorkKpiScoringRule> {
  const source = plainRecord(value);
  if (!source || source.kind !== "linear") return failCommand("KPI 评分规则无效");
  const targetScore = finiteNumber(source.targetScore);
  const floorScore = finiteNumber(source.floorScore);
  const capScore = finiteNumber(source.capScore);
  if (targetScore === null || floorScore === null || capScore === null) return failCommand("KPI 评分规则数值无效");
  if (floorScore < 0 || targetScore <= floorScore || capScore < targetScore) {
    return failCommand("KPI 评分规则必须满足 0 ≤ 下限分 < 目标分 ≤ 封顶分");
  }
  return okCommand({ kind: "linear", targetScore, floorScore, capScore });
}

export function parseWorkKpiScoringRuleJson(value: string): DomainValidationResult<WorkKpiScoringRule> {
  try {
    return normalizeWorkKpiScoringRule(JSON.parse(value));
  } catch {
    return failCommand("KPI 评分规则 JSON 无效");
  }
}

export function calculateWorkKpiScore(input: {
  direction: WorkKpiDirection;
  actualValue: number;
  baselineValue?: number | null;
  targetValue?: number | null;
  targetLowerBound?: number | null;
  targetUpperBound?: number | null;
  rule: WorkKpiScoringRule;
}) {
  const raw = input.direction === "higher_is_better"
    ? scoreHigher(input)
    : input.direction === "lower_is_better"
      ? scoreLower(input)
      : scoreRange(input);
  return roundScore(clamp(raw, input.rule.floorScore, input.rule.capScore));
}

function scoreHigher(input: Parameters<typeof calculateWorkKpiScore>[0]) {
  const target = requiredFinite(input.targetValue, "KPI 目标值不能为空");
  const baseline = finiteNumber(input.baselineValue) ?? 0;
  if (target <= baseline) throw new Error("正向 KPI 目标值必须大于起点值");
  return ((input.actualValue - baseline) / (target - baseline)) * input.rule.targetScore;
}

function scoreLower(input: Parameters<typeof calculateWorkKpiScore>[0]) {
  const target = requiredFinite(input.targetValue, "KPI 目标值不能为空");
  const baseline = finiteNumber(input.baselineValue);
  if (baseline !== null) {
    if (baseline <= target) throw new Error("反向 KPI 起点值必须大于目标值");
    return ((baseline - input.actualValue) / (baseline - target)) * input.rule.targetScore;
  }
  if (input.actualValue <= target) return input.rule.targetScore;
  if (input.actualValue === 0) return input.rule.capScore;
  return (target / input.actualValue) * input.rule.targetScore;
}

function scoreRange(input: Parameters<typeof calculateWorkKpiScore>[0]) {
  const lower = requiredFinite(input.targetLowerBound, "区间 KPI 下限不能为空");
  const upper = requiredFinite(input.targetUpperBound, "区间 KPI 上限不能为空");
  if (upper <= lower) throw new Error("区间 KPI 上限必须大于下限");
  if (input.actualValue >= lower && input.actualValue <= upper) return input.rule.targetScore;
  const distance = input.actualValue < lower ? lower - input.actualValue : input.actualValue - upper;
  const scale = Math.max(upper - lower, Math.abs(input.actualValue < lower ? lower : upper), 1);
  return input.rule.targetScore * (1 - distance / scale);
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredFinite(value: unknown, message: string) {
  const number = finiteNumber(value);
  if (number === null) throw new Error(message);
  return number;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundScore(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
