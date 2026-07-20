"use client";

import { createPageBody, PageSurface, type BodySurfaceSectionSpec, type SurfaceToolbarItems } from "@workspace/core/ui";
import type { EditorBlock } from "@workspace/platform/document-editor";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate } from "@workspace/production/types";
import { createQcEditorRuntimePaperSection } from "./QcEditorRuntimePaper";
import { createQcEditorRuntimeMobileSection } from "./QcEditorRuntimeMobile";
import { qcBatchStagePath, qcBatchTestPath } from "./qc-routes";
import type { EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";

interface QcBatchRecordPageProps {
  batch: QcBatchSummary;
  runtimeTemplate: QcEditorRuntimeTemplate;
  runtimeStage: QcEditorRuntimeStage;
  activeValue: string;
  blocks: EditorBlock[];
  values: EditorRuntimeValues;
  referenceValues: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  readOnly: boolean;
  testsLocked: boolean;
  testOptionSuffixes?: Record<string, string>;
  isPending: boolean;
  canSaveRecord: boolean;
  saveDisabled?: boolean;
  onSaveRecord: () => void;
  canApproveRecord: boolean;
  onApproveRecord: () => void;
  onNavigate: (href: string) => void;
  leadingSections?: BodySurfaceSectionSpec[];
}

export default function QcBatchRecordPage({
  batch,
  runtimeTemplate,
  runtimeStage,
  activeValue,
  blocks,
  values,
  referenceValues,
  onFieldChange,
  readOnly,
  testsLocked,
  testOptionSuffixes = {},
  isPending,
  canSaveRecord,
  saveDisabled,
  onSaveRecord,
  canApproveRecord,
  onApproveRecord,
  onNavigate,
  leadingSections = [],
}: QcBatchRecordPageProps) {
  const recordActions: Extract<SurfaceToolbarItems[number], { kind: "action-group" }>["actions"] = [];
  if (canSaveRecord) {
    recordActions.push({
      key: "save-inspection",
      label: isPending ? "保存中" : "保存检验",
      kind: "save",
      onClick: onSaveRecord,
      disabled: isPending || saveDisabled,
      variant: "primary",
    });
  }
  if (canApproveRecord) {
    recordActions.push({
      key: "approve-review",
      label: isPending ? "复核中" : "复核通过",
      kind: "approve",
      onClick: onApproveRecord,
      disabled: isPending,
      variant: "primary",
    });
  }

  const stageOptions = [
    { value: "precheck", label: "检验前确认" },
    ...runtimeStage.tests.map((item) => ({
      value: item.key,
      label: `${item.sequence} ${item.name}${testOptionSuffixes[item.key] ?? ""}`,
      disabled: testsLocked,
    })),
  ];
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "qc-stage",
      value: activeValue,
      ariaLabel: "质检阶段",
      presentation: "segmented",
      options: stageOptions,
      onChange: (value) => {
        if (value === "precheck") onNavigate(qcBatchStagePath(batch.id, runtimeStage.key));
        else onNavigate(qcBatchTestPath(batch.id, runtimeStage.key, value));
      },
    },
    ...(recordActions.length ? [{
      kind: "action-group" as const,
      key: "record-actions",
      actions: recordActions,
    }] : []),
  ];
  const runtimeSurfaceProps = {
    blocks,
    fieldModel: runtimeTemplate.fieldModel,
    values,
    referenceValues,
    onFieldChange,
    readOnly,
  };
  const paperSection = createQcEditorRuntimePaperSection("record-paper", runtimeSurfaceProps);

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...leadingSections,
        createQcEditorRuntimeMobileSection("record-mobile", runtimeSurfaceProps),
        { ...paperSection, visibility: "desktop" },
      ])}
    />
  );
}
