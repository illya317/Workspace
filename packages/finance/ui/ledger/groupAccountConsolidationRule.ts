import { createFieldsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, FormSurfaceFieldSpec, FormSurfaceItemSpec } from "@workspace/core/ui";

import type { GroupAccountCatalogEditDraft } from "./groupAccountCatalogCreate";

const CONSOLIDATION_FIELD_KEYS = new Set([
  "consolidationRole",
  "counterpartyRequirement",
  "movementType",
  "translationRateType",
]);

type GroupAccountFormItem = FormSurfaceItemSpec<FormSurfaceFieldSpec>;

export function groupAccountMasterFields(fields: GroupAccountFormItem[]) {
  return fields.filter((field) => !CONSOLIDATION_FIELD_KEYS.has(field.key));
}

export function groupAccountConsolidationRuleSections(input: {
  fields: GroupAccountFormItem[];
  editable: boolean;
  dirty: boolean;
}): BodySurfaceSectionSpec[] {
  return [createFieldsSection(
    "group-account-consolidation-rule",
    input.fields.filter((field) => CONSOLIDATION_FIELD_KEYS.has(field.key)),
    {
      kind: input.editable ? "fields" : "detail",
      layout: { columns: 2, density: "compact" },
      header: {
        title: "合并规则",
        description: input.dirty ? "有未保存规则修改" : "集团科目的自动匹配与折算属性",
      },
    },
  )];
}

export function groupAccountDraftDirtyParts(
  left: GroupAccountCatalogEditDraft,
  right: GroupAccountCatalogEditDraft,
) {
  return {
    master: left.code !== right.code
      || left.name !== right.name
      || left.category !== right.category
      || left.balanceDirection !== right.balanceDirection
      || left.mnemonicCode !== right.mnemonicCode
      || left.currency !== right.currency
      || left.parentGroupAccountId !== right.parentGroupAccountId,
    consolidation: left.consolidationRole !== right.consolidationRole
      || left.counterpartyRequirement !== right.counterpartyRequirement
      || left.movementType !== right.movementType
      || left.translationRateType !== right.translationRateType,
  };
}
