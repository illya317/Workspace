"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMessageSection, createPageBody, PageSurface, useFeedback, type SurfaceToolbarItems } from "@workspace/core/ui";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate, QcEditorRuntimeTest } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcEditorRuntimePaper from "./QcEditorRuntimePaper";
import { qcBatchStagePath, qcBatchTestPath } from "./qc-routes";
import { useEditorRuntimeFormulaEngine } from "./useEditorRuntimeFormulaEngine";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  runtimeTemplate: QcEditorRuntimeTemplate;
  runtimeStage: QcEditorRuntimeStage;
  runtimeTest: QcEditorRuntimeTest;
  currentUserName: string;
}

function writableRuntimeValues(values: Record<string, string>, runtimeTest: QcEditorRuntimeTest) {
  const keys = new Set<string>();
  for (const block of runtimeTest.blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey);
      })));
    }
  }
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}
export default function QcBatchTestRecord({
  batch,
  runtimeTemplate,
  runtimeStage,
  runtimeTest,
  currentUserName
}: Props) {
  const router = useRouter();
  const feedback = useFeedback();
  const [isPending, startTransition] = useTransition();
  const form = useEditorRuntimeFormulaEngine(
    runtimeTemplate.fieldModel,
    runtimeTemplate.document,
    { ...batch.fields, batch_number: batch.batchNumber }
  );
  const workflow = useMemo(() => buildQcBatchWorkflow(runtimeTemplate, batch, currentUserName), [batch, currentUserName, runtimeTemplate]);
  const stageStatus = workflow.stages.find(item => item.key === runtimeStage.key);
  const testStatus = workflow.tests.find(item => item.stageKey === runtimeStage.key && item.testName === runtimeTest.key);
  const inspectorName = testStatus?.inspectorName || currentUserName;
  const reviewerName = testStatus?.reviewerName || "";
  const locked = !stageStatus?.unlocked;
  const precheckComplete = !!stageStatus?.precheckComplete;
  const testsLocked = locked || !precheckComplete;
  const readOnly = testsLocked || !!testStatus?.automatic || !!testStatus?.reviewed;
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref/inspector": inspectorName,
    "__qc_ref/reviewer": reviewerName,
    "__qc_ref_batch_number": batch.batchNumber,
    "__qc_ref_inspector": inspectorName,
    "__qc_ref_reviewer": reviewerName
  };
  function save() {
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc/${batch.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "save_inspection",
          stageKey: runtimeStage.key,
          testName: runtimeTest.key,
          fields: writableRuntimeValues(form.values, runtimeTest)
        })
      });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        feedback.success("已检验");
        router.refresh();
      } else {
        feedback.error(body?.error || "检验保存失败");
      }
    });
  }
  function approveReview() {
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc/${batch.id}/approve-review`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stageKey: runtimeStage.key,
          testName: runtimeTest.key
        })
      });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        feedback.success("已复核");
        router.refresh();
      } else {
        feedback.error(body?.error || "复核失败");
      }
    });
  }
  const recordActions: Extract<SurfaceToolbarItems[number], { kind: "action-group" }>["actions"] = [];
  if (testStatus?.canSaveInspection) {
    recordActions.push({
      key: "save-inspection",
      label: isPending ? "保存中" : "保存检验",
      kind: "save",
      onClick: save,
      disabled: isPending,
      variant: "primary",

    });
  }
  if (testStatus?.canApproveReview) {
    recordActions.push({
      key: "approve-review",
      label: isPending ? "复核中" : "复核通过",
      kind: "verified",
      onClick: approveReview,
      disabled: isPending,
      variant: "primary",

    });
  }
  const stageOptions = [
    { value: "precheck", label: "检验前确认" },
    ...runtimeStage.tests.map((item) => {
      const status = stageStatus?.tests.find((test) => test.testName === item.key);
      return {
        value: item.key,
        label: `${item.sequence} ${item.name}${status?.automatic ? " · 自动通过" : ""}`,
        disabled: testsLocked,
      };
    }),
  ];
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "qc-stage",
      value: runtimeTest.key,
      ariaLabel: "质检阶段",
      presentation: "segmented",
      options: stageOptions,
      onChange: (value) => {
        if (value === "precheck") router.push(qcBatchStagePath(batch.id, runtimeStage.key));
        else router.push(qcBatchTestPath(batch.id, runtimeStage.key, value));
      },
    },
    ...(recordActions.length ? [{
      kind: "action-group" as const,
      key: "test-actions",
      actions: recordActions,
    }] : []),
  ];
  return <PageSurface kind="standard"
    toolbar={{ items: toolbarItems }}
    body={createPageBody([
      ...(!precheckComplete ? [createMessageSection("test-precheck-required", {
        tone: "warning",
        content: "请先保存检验前确认，再进入检测项目。"
      })] : []),
      {
        key: "test-record-paper",
        body: { kind: "document", document: {
          kind: "pages",
          pages: {
            items: [{
              key: "paper",
              size: "a4",
              content: <QcEditorRuntimePaper blocks={runtimeTest.blocks} fieldModel={runtimeTemplate.fieldModel} values={form.values} referenceValues={referenceValues} onFieldChange={form.setValue} readOnly={readOnly} />,
            }],
          },
        } },
      },
    ])}
  />;
}
