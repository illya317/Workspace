"use client";

import { workspacePath } from "@workspace/core/routing";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMessageSection, createPageBody, PageSurface, useFeedback, type SurfaceToolbarItems } from "@workspace/core/ui";
import type { EditorBlock } from "@workspace/platform/document-editor";
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
function writableRuntimeValues(values: EditorRuntimeValues, blocks: EditorBlock[]) {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey);
      })));
    }
  }
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
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
  function save() {
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
      section: "edit",
      actions: [
        { key: "save", label: isPending ? "保存中" : "保存", kind: "save", variant: "primary", disabled: locked || isPending, onClick: save },
      ],
    },
  ];
  return <PageSurface kind="standard"
    toolbar={{ items: toolbarItems }}
    body={createPageBody([
      locked ? createMessageSection("precheck-locked", {
        tone: "warning",

        content: "前一阶段尚未全部复核完成，当前阶段暂不可操作。"
      }) : {
        key: "precheck-paper",
        body: { kind: "document", document: {
          kind: "pages",
          pages: {
            items: [{
              key: "paper",
              size: "a4",
              content: <QcEditorRuntimePaper blocks={runtimeStage.precheckBlocks} fieldModel={runtimeTemplate.fieldModel} values={form.values} referenceValues={referenceValues} onFieldChange={form.setValue} readOnly={locked} />,
            }],
          },
        } },
      },
    ])}
  />;
}
