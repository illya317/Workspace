"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useTransition } from "react";
import { createHeadingSection, createMessageSection, createPageBody, PageSurface } from "@workspace/core/ui";
import type { EditorBlock } from "@workspace/platform/document-editor";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcEditorRuntimePaper from "./QcEditorRuntimePaper";
import { qcAnchorHref, qcBatchStageAnchorHref, qcBatchTestAnchorHref } from "./qc-routes";
import { useEditorRuntimeFormulaEngine, type EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  runtimeTemplate: QcEditorRuntimeTemplate;
  runtimeStage: QcEditorRuntimeStage;
}
const numerals = ["一", "二", "三", "四", "五", "六"];

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
  productName,
  runtimeTemplate,
  runtimeStage
}: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [statusText, setStatusText] = useState("");
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
  function save() {
    setSaveState("idle");
    setStatusText("");
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
      setSaveState(response.ok ? "saved" : "error");
      setStatusText(response.ok ? "已保存实验前准备" : body?.error || "保存失败");
    });
  }
  const precheckSteps = [
    {
      key: "batch",
      label: "返回批次列表",
      href: qcAnchorHref(),
      tone: "primary" as const,
    },
    {
      key: "precheck",
      label: "检验前确认",
      href: qcBatchStageAnchorHref(batch.id, runtimeStage.key),
    },
    ...runtimeStage.tests.map(test => {
      const testStatus = stageStatus?.tests.find(item => item.testName === test.key);
      return {
        key: test.key,
        label: `${test.sequence} ${test.name}${testStatus?.automatic ? " · 自动通过" : ""}`,
        href: locked ? undefined : qcBatchTestAnchorHref(batch.id, runtimeStage.key, test.key),
        disabled: locked,
        tone: locked ? "muted" as const : "neutral" as const,
      };
    }),
  ];
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([
      {
        key: "precheck-navigation",
        body: {
          kind: "navigation",
          navigation: {
            kind: "steps",
            active: "precheck",
            ariaLabel: "质检阶段导航",

            steps: precheckSteps,
          },
        },
      },
      createHeadingSection("precheck-heading", {

        title: `${numerals[runtimeStage.index] ?? runtimeStage.index + 1}、${productName}${runtimeStage.label}`,
      }),
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
      {
        key: "precheck-actions",
        body: { kind: "form", form: {
          kind: "filters",

          content: { items: [] },
          commands: [
            { key: "save", label: isPending ? "保存中" : "保存", variant: "primary", disabled: locked || isPending, onClick: save,  },
          ],
        } },
      },
      ...(saveState === "saved" || saveState === "error" ? [createMessageSection("precheck-save-status", {
        tone: saveState === "saved" ? "success" as const : "danger" as const,
        content: statusText || (saveState === "saved" ? "已保存" : "保存失败"),
      })] : []),
    ])}
  />;
}
