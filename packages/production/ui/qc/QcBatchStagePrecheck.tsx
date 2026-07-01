"use client";

import { workspacePath } from "@workspace/core/routing";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocumentSection, createMessageSection, createPageBody, PageSurface, useFeedback, type SurfaceToolbarItems, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { EditorBlock, EditorSlotInline } from "@workspace/platform/document-editor";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcEditorRuntimePaper from "./QcEditorRuntimePaper";
import { qcBatchStagePath, qcBatchTestPath } from "./qc-routes";
import { useEditorRuntimeFormulaEngine, type EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  runtimeTemplate: QcEditorRuntimeTemplate;
  runtimeStage: QcEditorRuntimeStage;
}
function writableRuntimeKeys(blocks: EditorBlock[]) {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey);
      })));
    }
  }
  return keys;
}

function writableRuntimeValues(values: EditorRuntimeValues, blocks: EditorBlock[]) {
  const keys = writableRuntimeKeys(blocks);
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}

const PRECHECK_FIELD_LABELS: Record<string, string> = {
  "pre_check/quantity_2": "检品数量",
  "layout/stage_header/request_date": "请验日期",
  "layout/stage_header/inspection_date": "检验日期",
  "layout/stage_header/report_date": "报告日期",
  "pre_check/confirm_1": "仪器、设备是否在校验有效期内",
  "pre_check/confirm_2": "检验用具、物品是否齐全",
  "pre_check/env": "实验环境",
};

function slotDisplayLabel(part: EditorSlotInline): string {
  if (part.label?.trim()) return part.label.trim();
  if (part.alias?.trim() && part.alias.trim() !== "i") return part.alias.trim();
  if (part.placeholder?.trim()) return part.placeholder.trim();
  if (PRECHECK_FIELD_LABELS[part.fieldKey]) return PRECHECK_FIELD_LABELS[part.fieldKey];
  const last = part.fieldKey.split("/").pop() || part.fieldKey;
  return last.replace(/_/g, " ");
}

function precheckCompletionStatus(values: EditorRuntimeValues, blocks: EditorBlock[]) {
  const missing: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      block.parts.forEach((part) => {
        if (part.type === "text") return;
        if (part.referenceFieldKey || part.fieldKey.includes("/signature/") || part.slotKind === "formula" || part.slotKind === "reference" || part.readonlyDisplay) return;
        const value = values[part.fieldKey];
        if (value == null || String(value).trim() === "") {
          missing.push(slotDisplayLabel(part));
        }
      });
    }
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type === "text") return;
        if (part.referenceFieldKey || part.fieldKey.includes("/signature/") || part.slotKind === "formula" || part.slotKind === "reference" || part.readonlyDisplay) return;
        const value = values[part.fieldKey];
        if (value == null || String(value).trim() === "") {
          missing.push(slotDisplayLabel(part));
        }
      })));
    }
  }
  return { complete: missing.length === 0, missing };
}

export default function QcBatchStagePrecheck({
  batch,
  runtimeTemplate,
  runtimeStage
}: Props) {
  const router = useRouter();
  const feedback = useFeedback();
  const [isPending, startTransition] = useTransition();
  const form = useEditorRuntimeFormulaEngine(
    runtimeTemplate.fieldModel,
    runtimeTemplate.document,
    { ...batch.fields, batch_number: batch.batchNumber }
  );
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref_batch_number": batch.batchNumber
  };
  const workflow = buildQcBatchWorkflow(runtimeTemplate, batch);
  const stageStatus = workflow.stages[runtimeStage.index];
  const locked = !stageStatus?.unlocked;
  const precheckComplete = !!stageStatus?.precheckComplete;
  const precheckStatus = precheckCompletionStatus(form.values, runtimeStage.precheckBlocks);
  const canSave = precheckStatus.complete;
  const missingLabels = precheckStatus.missing;
  function save() {
    const status = precheckCompletionStatus(form.values, runtimeStage.precheckBlocks);
    if (!status.complete) {
      feedback.error(`还有 ${status.missing.length} 项检验前确认项未填写。`);
      return;
    }
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc/${batch.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_precheck",
          stageKey: runtimeStage.key,
          fields: writableRuntimeValues(form.values, runtimeStage.precheckBlocks),
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        feedback.success("检验前确认已保存");
        router.refresh();
      } else {
        feedback.error(body?.error || "保存失败");
      }
    });
  }
  const stageOptions = [
    { value: "precheck", label: "检验前确认" },
    ...runtimeStage.tests.map(test => {
      const testStatus = stageStatus?.tests.find(item => item.testName === test.key);
      return {
        value: test.key,
        label: `${test.sequence} ${test.name}${testStatus?.automatic ? " · 自动通过" : ""}`,
        disabled: locked || !precheckComplete,
      };
    }),
  ];
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "qc-stage",
      value: "precheck",
      ariaLabel: "质检阶段",
      presentation: "segmented",
      options: stageOptions,
      onChange: (value) => {
        if (value === "precheck") router.push(qcBatchStagePath(batch.id, runtimeStage.key));
        else router.push(qcBatchTestPath(batch.id, runtimeStage.key, value));
      },
    },
    {
      kind: "action-group",
      key: "precheck-actions",
      actions: [
        { key: "save", label: isPending ? "保存中" : "保存", kind: "save", variant: "primary", disabled: locked || isPending || !canSave, onClick: save },
      ],
    },
  ];
  const bodySections: BodySurfaceSectionSpec[] = locked
    ? [createMessageSection("precheck-locked", {
        tone: "warning",
        content: "前一阶段尚未全部复核完成，当前阶段暂不可操作。"
      })]
    : [
        ...(!canSave ? [createMessageSection("precheck-incomplete", {
          tone: "warning",
          content: `还有 ${missingLabels.length} 项未填写，请补充后再保存。`
        })] : []),
        createDocumentSection("precheck-paper", {
          kind: "pages",
          pages: {
            items: [{
              key: "paper",
              size: "a4",
              content: <QcEditorRuntimePaper blocks={runtimeStage.precheckBlocks} fieldModel={runtimeTemplate.fieldModel} values={form.values} referenceValues={referenceValues} onFieldChange={form.setValue} readOnly={locked} />,
            }],
          },
        }),
      ];
  return <PageSurface kind="standard"
    toolbar={{ items: toolbarItems }}
    body={createPageBody(bodySections)}
  />;
}
