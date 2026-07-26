import { matchText } from "@workspace/core/search";
import type {
  FormSurfaceFieldSpec,
  SelectorSurfaceStatusSpec,
  SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import type {
  FinanceGroupAccountCatalogRow,
  ReclassBasis,
  RuleCandidate,
} from "@workspace/finance/types";

import { balanceDirectionLabel, categoryLabel } from "./groupAccountMappingPresentation";
import { reclassBasisLabel, type GroupRuleStatusFilter, type ReclassTargetOption } from "./reclassWorkbench";

/** 左树节点负载：目录行提供层级与类别，候选提供规则状态。 */
export interface RuleAccountTreeValue {
  row: FinanceGroupAccountCatalogRow;
  candidate: RuleCandidate;
}

export interface ReclassRuleFormDraft {
  decision: "reclassify" | "no_reclass" | null;
  targetGroupAccountId: number | null;
  basis: ReclassBasis;
}

export function filterRuleCandidates(rows: readonly RuleCandidate[], keyword: string, status: GroupRuleStatusFilter) {
  return rows.filter((row) => {
    const inStatus = status === "all"
      || (status === "reclassified" && row.effectiveDecision === "reclassify")
      || (status === "no_reclass" && row.effectiveDecision === "no_reclass")
      || (status === "unconfirmed" && row.effectiveDecision === null);
    if (!inStatus) return false;
    if (!keyword) return true;
    return [row.accountCode, row.accountName, row.existingTarget]
      .some((value) => value && matchText(value, keyword));
  });
}

/** 表单初值：处理方式和旧表格一致（existingDecision 优先，无异常历史派生为无需重分类），口径取 existingBasis ?? defaultBasis。 */
export function reclassRuleDraftFromCandidate(candidate: RuleCandidate): ReclassRuleFormDraft {
  return {
    decision: candidate.existingDecision ?? (candidate.hasHistoricalAbnormalBalance ? null : "no_reclass"),
    targetGroupAccountId: candidate.existingTargetGroupAccountId,
    basis: candidate.existingBasis ?? candidate.defaultBasis,
  };
}

export function sameReclassRuleDraft(left: ReclassRuleFormDraft, right: ReclassRuleFormDraft) {
  return left.decision === right.decision
    && left.targetGroupAccountId === right.targetGroupAccountId
    && left.basis === right.basis;
}

/** 规则科目树：候选科目按集团科目目录层级挂载，非候选上级折到最近的候选祖先；按可见集合剪枝但保留结构祖先。 */
export function buildRuleAccountTree(input: {
  rows: readonly FinanceGroupAccountCatalogRow[];
  candidates: readonly RuleCandidate[];
  visibleCandidateIds: ReadonlySet<number>;
}): SelectorSurfaceStructuredTreeItemSpec<RuleAccountTreeValue>[] {
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.groupAccountId, candidate]));
  const rowsById = new Map(input.rows.map((row) => [row.id, row]));
  const childrenByParent = new Map<number, FinanceGroupAccountCatalogRow[]>();
  const roots: FinanceGroupAccountCatalogRow[] = [];
  for (const row of input.rows) {
    if (!candidateById.has(row.id)) continue;
    const parentId = nearestCandidateAncestorId(row, rowsById, candidateById);
    if (parentId === null) {
      roots.push(row);
    } else {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(row);
      childrenByParent.set(parentId, children);
    }
  }
  const declare = (
    row: FinanceGroupAccountCatalogRow,
    branch: Set<number>,
  ): SelectorSurfaceStructuredTreeItemSpec<RuleAccountTreeValue> | null => {
    const candidate = candidateById.get(row.id);
    if (!candidate || branch.has(row.id)) return null;
    const nextBranch = new Set(branch).add(row.id);
    const children = (childrenByParent.get(row.id) ?? [])
      .map((child) => declare(child, nextBranch))
      .filter((child): child is SelectorSurfaceStructuredTreeItemSpec<RuleAccountTreeValue> => child !== null);
    if (!input.visibleCandidateIds.has(row.id) && children.length === 0) return null;
    return {
      key: row.id,
      value: { row, candidate },
      card: { title: `${row.code} ${row.name}`, showLevelBadge: false, status: ruleStatusSpec(candidate) },
      children: children.length ? children : undefined,
    };
  };
  return roots
    .map((row) => declare(row, new Set()))
    .filter((item): item is SelectorSurfaceStructuredTreeItemSpec<RuleAccountTreeValue> => item !== null);
}

/** 默认展开：有筛选时展开命中分支，否则展开有异常历史（hasHistoricalAbnormalBalance）的分支。 */
export function initialRuleTreeExpandedIds(input: {
  rows: readonly FinanceGroupAccountCatalogRow[];
  candidates: readonly RuleCandidate[];
  focusCandidateIds: ReadonlySet<number> | null;
}): Set<number> {
  const rowsById = new Map(input.rows.map((row) => [row.id, row]));
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.groupAccountId, candidate]));
  const sources = input.focusCandidateIds !== null
    ? [...input.focusCandidateIds]
    : input.candidates.filter((candidate) => candidate.hasHistoricalAbnormalBalance).map((candidate) => candidate.groupAccountId);
  const expanded = new Set<number>();
  for (const id of sources) {
    const row = rowsById.get(id);
    if (!row) continue;
    let parentId = nearestCandidateAncestorId(row, rowsById, candidateById);
    const branch = new Set<number>();
    while (parentId !== null && !branch.has(parentId)) {
      expanded.add(parentId);
      branch.add(parentId);
      const parentRow = rowsById.get(parentId);
      parentId = parentRow ? nearestCandidateAncestorId(parentRow, rowsById, candidateById) : null;
    }
  }
  return expanded;
}

/** 科目基准信息（始终只读）：类别、自然方向、异常方向、历史是否异常、规则来源。 */
export function reclassRuleBaseItems(value: RuleAccountTreeValue): FormSurfaceFieldSpec[] {
  const { row, candidate } = value;
  return [
    readOnlyDetail("category", "科目类别", categoryLabel(row.category)),
    readOnlyDetail("naturalSide", "自然方向", balanceDirectionLabel(candidate.balanceDirection)),
    readOnlyDetail("abnormalSide", "异常方向", abnormalSideLabel(candidate.abnormalSide)),
    readOnlyDetail("historical", "历史异常", candidate.hasHistoricalAbnormalBalance ? "出现过异常方向余额" : "未出现异常方向余额"),
    readOnlyDetail("ruleSource", "规则来源", candidate.inheritedFromAccountCode ? `继承自 ${candidate.inheritedFromAccountCode}` : "本科目维护"),
  ];
}

/** 只读场景（继承规则、历史版本、无权限）下的规则结论展示。 */
export function reclassRuleReadOnlyItems(candidate: RuleCandidate, targetLabel: string | null): FormSurfaceFieldSpec[] {
  const target = targetLabel ?? candidate.existingTarget;
  const decisionLabel = candidate.effectiveDecision === "reclassify"
    ? target ? `重分类到 ${target}` : "重分类到目标科目"
    : candidate.effectiveDecision === "no_reclass"
      ? "无需重分类"
      : "未确认";
  return [
    readOnlyDetail("decision", "处理方式", decisionLabel),
    readOnlyDetail("basis", "计算口径", reclassBasisLabel(candidate.existingBasis ?? candidate.defaultBasis)),
  ];
}

/** 单科目规则表单：处理方式 + 目标科目（仅重分类时）+ 计算口径。 */
export function reclassRuleFormItems(input: {
  candidate: RuleCandidate;
  draft: ReclassRuleFormDraft;
  targetOptions: ReclassTargetOption[];
  onChange: (change: Partial<ReclassRuleFormDraft>) => void;
}): FormSurfaceFieldSpec[] {
  const { candidate, draft } = input;
  return [
    {
      key: "decision",
      label: "处理方式",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: [
          { value: "no_reclass", label: "无需重分类" },
          { value: "reclassify", label: "重分类到目标科目" },
        ] },
      },
      value: draft.decision ?? "",
      placeholder: "请选择处理方式",
      onChange: (value) => {
        const decision = value === "reclassify" ? "reclassify" : value === "no_reclass" ? "no_reclass" : null;
        input.onChange({
          decision,
          targetGroupAccountId: decision === "reclassify"
            ? draft.targetGroupAccountId ?? candidate.existingTargetGroupAccountId
            : null,
        });
      },
    },
    ...(draft.decision === "reclassify" ? [{
      key: "targetGroupAccountId",
      label: "目标科目",
      required: true,
      spec: {
        valueType: "string" as const,
        control: "choice" as const,
        options: { source: "static" as const, items: input.targetOptions, visibleCount: 8 },
      },
      value: draft.targetGroupAccountId === null ? "" : String(draft.targetGroupAccountId),
      placeholder: "选择目标科目",
      emptyText: "无匹配科目",
      onChange: (value: unknown) => input.onChange({ targetGroupAccountId: value ? Number(value) : null }),
    }] : []),
    {
      key: "basis",
      label: "计算口径",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: [
          { value: "account_net", label: "按科目净额" },
          { value: "counterparty_gross", label: "按往来户逐户", disabled: !candidate.hasAuxiliaryFacts },
        ] },
      },
      value: draft.basis,
      hint: candidate.hasAuxiliaryFacts ? undefined : "该科目无辅助余额事实，暂不能按往来户逐户",
      onChange: (value) => input.onChange({ basis: value === "counterparty_gross" ? "counterparty_gross" : "account_net" }),
    },
  ];
}

function ruleStatusSpec(candidate: RuleCandidate): SelectorSurfaceStatusSpec {
  if (candidate.effectiveDecision === "reclassify") return { label: "已重分类", tone: "success" };
  if (candidate.effectiveDecision === "no_reclass") return { label: "无需重分类", tone: "muted" };
  return { label: "未确认", tone: "warning" };
}

function catalogParentId(row: FinanceGroupAccountCatalogRow) {
  if (row.parent) return row.parent.id;
  return row.parentRecommendation?.kind === "mapped" ? row.parentRecommendation.groupAccount.id : null;
}

/** 沿目录层级向上找最近的候选科目祖先；候选集合外的上级被跳过。 */
function nearestCandidateAncestorId(
  row: FinanceGroupAccountCatalogRow,
  rowsById: ReadonlyMap<number, FinanceGroupAccountCatalogRow>,
  candidateById: ReadonlyMap<number, RuleCandidate>,
) {
  let parentId = catalogParentId(row);
  const seen = new Set<number>([row.id]);
  while (parentId !== null && !seen.has(parentId)) {
    if (candidateById.has(parentId)) return parentId;
    seen.add(parentId);
    const parentRow = rowsById.get(parentId);
    if (!parentRow) return null;
    parentId = catalogParentId(parentRow);
  }
  return null;
}

function abnormalSideLabel(value: RuleCandidate["abnormalSide"]) {
  return value === "both" ? "双向" : balanceDirectionLabel(value);
}

function readOnlyDetail(key: string, label: string, value: string): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "string", control: "text" },
    value,
    readOnly: true,
  };
}
