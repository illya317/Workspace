import {
  createFieldsSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceSectionSpec,
} from "@workspace/core/ui";
import type {
  ConfirmFinanceAssetImpairmentAssessmentInput,
  FinanceAssetWorkspaceDto,
} from "../../types/assets";
import { impairmentAssessmentFormSections } from "./assetScheduleUi";

export function createFinanceAssetImpairmentSection(input: {
  draft: ConfirmFinanceAssetImpairmentAssessmentInput;
  canRevise: boolean;
  workspace: FinanceAssetWorkspaceDto | null;
  saving: boolean;
  onChange: (key: keyof ConfirmFinanceAssetImpairmentAssessmentInput, value: unknown) => void;
  onSave: () => void | Promise<void>;
}): BodySurfaceSectionSpec {
  const { draft, canRevise, workspace, saving, onChange, onSave } = input;
  const formSections = impairmentAssessmentFormSections(
    draft,
    onChange,
    !canRevise || Boolean(workspace?.scope.isClosed),
    workspace?.cards ?? [],
  ).map<FormSurfaceSectionSpec>((section) => ({ kind: "section", ...section, chrome: "divider" }));
  const recorded = draft.conclusion === "impairment_recorded";
  return createFieldsSection("asset-impairment-assessment", formSections, {
    kind: canRevise ? "fields" : "detail",
    header: {
      title: "资产减值评估",
      description: workspace?.impairmentAssessment
        ? `已确认 · 资产范围 ${workspace.impairmentAssessment.assetCount} 项`
        : "确认后纳入本期关账证据",
    },
    actions: canRevise ? [{
      key: "save-impairment-assessment",
      action: "save",
      label: saving ? "保存中..." : "确认评估",
      disabled: saving || Boolean(workspace?.scope.isClosed) || !draft.basis || !draft.evidenceRef
        || (recorded && (draft.impairmentAmount <= 0 || !draft.voucherNo
          || Math.abs(draft.allocations.reduce((sum, row) => sum + row.amount, 0) - draft.impairmentAmount) > 0.01)),
      onClick: () => void onSave(),
    }] : [],
    submit: canRevise ? { onSubmit: () => void onSave() } : undefined,
  });
}

export function updateFinanceAssetImpairmentDraft(
  current: ConfirmFinanceAssetImpairmentAssessmentInput | null,
  key: keyof ConfirmFinanceAssetImpairmentAssessmentInput,
  value: unknown,
) {
  if (!current) return current;
  if (key === "conclusion") {
    const conclusion = String(value) as ConfirmFinanceAssetImpairmentAssessmentInput["conclusion"];
    return conclusion === "impairment_recorded"
      ? { ...current, conclusion }
      : { ...current, conclusion, impairmentAmount: 0, voucherNo: null, allocations: [] };
  }
  return { ...current, [key]: value };
}
