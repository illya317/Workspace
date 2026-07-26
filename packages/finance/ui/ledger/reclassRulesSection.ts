import {
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createPageBody,
  createStatusSection,
} from "@workspace/core/ui";
import type { BodySurfaceProps, BodySurfaceSectionSpec } from "@workspace/core/ui";

import { mappedAccountSections } from "./groupAccountCatalogPresentation";
import {
  reclassRuleBaseItems,
  reclassRuleFormItems,
  reclassRuleReadOnlyItems,
  type RuleAccountTreeValue,
} from "./reclassRulePresentation";
import type { ReclassRulesController } from "./useReclassRules";

/** 规则区正文：左树（集团科目规则）+ 右详情（科目信息与规则 → 公司科目映射）。 */
export function createReclassRulesBody({
  controller,
  lifecycleBlocks = [],
  saving,
}: {
  controller: ReclassRulesController;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
  saving: boolean;
}): BodySurfaceProps {
  const {
    ruleCandidates,
    rulesLoading,
    selectedRule,
    selectedRuleAccountId,
    ruleTreeItems,
    ruleTreeExpandedIds,
    ruleFormDraft,
    ruleFormDirty,
    ruleMappedRowsByGroup,
    ruleMappingDetailState,
    canReviseActivePolicyVersion,
    selectedRuleInherited,
    canEditSelectedRule,
    ruleTargetAccountOptions,
    ruleTargetLabels,
    updateRuleFormDraft,
    selectRuleAccount,
    toggleRuleTreeNode,
    saveRule,
  } = controller;
  const detailContent = rulesLoading
    ? [createStatusSection("reclass-rule-loading", { kind: "loading", content: "加载规则候选..." })]
    : ruleCandidates.length === 0
      ? [createEmptySection("reclass-rule-unavailable", { content: "暂无可配置科目", presentation: "card" })]
      : selectedRule && ruleFormDraft
        ? [
            createFieldsSection(
              "reclass-rule-details",
              [
                ...reclassRuleBaseItems(selectedRule),
                ...(canEditSelectedRule
                  ? reclassRuleFormItems({
                      candidate: selectedRule.candidate,
                      draft: ruleFormDraft,
                      targetOptions: ruleTargetAccountOptions,
                      onChange: updateRuleFormDraft,
                    })
                  : reclassRuleReadOnlyItems(
                      selectedRule.candidate,
                      selectedRule.candidate.existingTargetGroupAccountId !== null
                        ? ruleTargetLabels.get(String(selectedRule.candidate.existingTargetGroupAccountId)) ?? null
                        : null,
                    )),
              ],
              {
                kind: canEditSelectedRule ? "fields" : "detail",
                layout: { columns: 2, density: "compact" },
                header: {
                  title: `${selectedRule.candidate.accountCode} ${selectedRule.candidate.accountName}`,
                  description: ruleFormDirty
                    ? "有未保存修改"
                    : selectedRuleInherited
                      ? `规则继承自 ${selectedRuleInherited}，请在来源科目上维护`
                      : canReviseActivePolicyVersion ? undefined : "历史版本只读",
                },
                actions: canEditSelectedRule ? [{
                  key: "save-reclass-rule",
                  action: "save" as const,
                  label: saving ? "保存中..." : "保存",
                  disabled: saving || !ruleFormDirty || ruleFormDraft.decision === null
                    || (ruleFormDraft.decision === "reclassify" && ruleFormDraft.targetGroupAccountId === null),
                  onClick: () => { void saveRule(); },
                }] : [],
              },
            ),
            ...mappedAccountSections(
              selectedRule.row,
              ruleMappedRowsByGroup[selectedRule.row.id],
              ruleMappingDetailState[selectedRule.row.id],
            ),
          ]
        : [createEmptySection("reclass-rule-empty", {
            content: "从左侧选择科目查看规则",
            presentation: "card",
          })];
  const treeSelector = {
    kind: "tree" as const,
    title: "集团科目规则",
    items: ruleTreeItems,
    selectedId: selectedRuleAccountId,
    loading: rulesLoading,
    loadingText: "加载规则候选...",
    emptyText: ruleCandidates.length === 0 ? "暂无可配置科目" : "当前筛选范围没有科目",
    expandedIds: ruleTreeExpandedIds,
    onToggle: toggleRuleTreeNode,
    onSelect: (value: RuleAccountTreeValue) => {
      void selectRuleAccount(value);
    },
  };
  return createMasterDetailBody({
    master: { label: "集团科目规则", presentation: "compact", body: { kind: "selector", selector: treeSelector } },
    detail: createPageBody([...lifecycleBlocks, ...detailContent]),
    desktop: { ratio: [1, 2] },
    mobile: { detailActive: selectedRule !== null },
  });
}
