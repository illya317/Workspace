import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { DEFAULT_WORK_KPI_SCORING_RULE, normalizeWorkKpiScoringRule } from "../work-kpi-scoring";
import type {
  WorkKpiDefinitionStatus,
  WorkKpiDirection,
  WorkKpiDisplayType,
  WorkKpiScoringRule,
} from "../work-kpi-types";

export type WorkKpiDefinitionCommand = {
  code: string;
  status: WorkKpiDefinitionStatus;
  name: string;
  description: string;
  valueType: "number";
  displayType: WorkKpiDisplayType;
  unit: string;
  direction: WorkKpiDirection;
  scoringRule: WorkKpiScoringRule;
  measurementMode: "manual";
  ownerDepartmentId: number;
};

const STATUSES = new Set<WorkKpiDefinitionStatus>(["draft", "active", "retired"]);
const DISPLAY_TYPES = new Set<WorkKpiDisplayType>(["number", "percent", "currency", "count"]);
const DIRECTIONS = new Set<WorkKpiDirection>(["higher_is_better", "lower_is_better", "target_range"]);

export function validateWorkKpiDefinitionCommand(input: Record<string, unknown>): DomainValidationResult<WorkKpiDefinitionCommand> {
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(code)) return failCommand("指标编码须为 2–64 位大写字母、数字、点、横线或下划线", 400, "code");
  const name = String(input.name ?? "").trim();
  if (!name) return failCommand("指标名称不能为空", 400, "name");
  if (name.length > 120) return failCommand("指标名称不能超过 120 个字符", 400, "name");
  const status = String(input.status ?? "draft") as WorkKpiDefinitionStatus;
  if (!STATUSES.has(status)) return failCommand("指标状态无效", 400, "status");
  const displayType = String(input.displayType ?? "number") as WorkKpiDisplayType;
  if (!DISPLAY_TYPES.has(displayType)) return failCommand("指标展示类型无效", 400, "displayType");
  const direction = String(input.direction ?? "higher_is_better") as WorkKpiDirection;
  if (!DIRECTIONS.has(direction)) return failCommand("指标方向无效", 400, "direction");
  const ownerDepartmentId = Number(input.ownerDepartmentId);
  if (!Number.isInteger(ownerDepartmentId) || ownerDepartmentId <= 0) return failCommand("指标归口部门无效", 400, "ownerDepartmentId");
  const scoringRule = normalizeWorkKpiScoringRule(input.scoringRule ?? DEFAULT_WORK_KPI_SCORING_RULE);
  if (!scoringRule.ok) return scoringRule;
  const unit = String(input.unit ?? "").trim();
  if (displayType !== "percent" && !unit) return failCommand("指标单位不能为空", 400, "unit");
  return okCommand({
    code,
    status,
    name,
    description: String(input.description ?? "").trim(),
    valueType: "number",
    displayType,
    unit: displayType === "percent" ? unit || "%" : unit,
    direction,
    scoringRule: scoringRule.data,
    measurementMode: "manual",
    ownerDepartmentId,
  });
}
