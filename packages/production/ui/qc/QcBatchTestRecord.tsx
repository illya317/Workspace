"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFormSection, createHeadingSection, createMessageSection, createPageBody, type FormSurfaceCommandSpec, PageSurface } from "@workspace/core/ui";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate, QcEditorRuntimeTest } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcEditorRuntimePaper from "./QcEditorRuntimePaper";
import { qcAnchorHref, qcBatchStageAnchorHref, qcBatchTestAnchorHref } from "./qc-routes";
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
  productName,
  runtimeTemplate,
  runtimeStage,
  runtimeTest,
  currentUserName
}: Props) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [statusText, setStatusText] = useState("");
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
  const readOnly = locked || !!testStatus?.automatic || !!testStatus?.reviewed;
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref/inspector": inspectorName,
    "__qc_ref/reviewer": reviewerName,
    "__qc_ref_batch_number": batch.batchNumber,
    "__qc_ref_inspector": inspectorName,
    "__qc_ref_reviewer": reviewerName
  };
  function save() {
    setSaveState("idle");
    setStatusText("");
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
      setSaveState(response.ok ? "saved" : "error");
      setStatusText(response.ok ? "已保存检验记录" : body?.error || "保存失败");
      if (response.ok) router.refresh();
    });
  }
  function approveReview() {
    setSaveState("idle");
    setStatusText("");
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc/${batch.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "approve_review",
          stageKey: runtimeStage.key,
          testName: runtimeTest.key
        })
      });
      const body = await response.json().catch(() => null);
      setSaveState(response.ok ? "saved" : "error");
      setStatusText(response.ok ? "已复核" : body?.error || "复核失败");
      if (response.ok) router.refresh();
    });
  }
  const recordActions: FormSurfaceCommandSpec[] = [];
  if (testStatus?.canSaveInspection) {
    recordActions.push({
      key: "save-inspection",
      label: isPending ? "保存中" : "保存检验",
      onClick: save,
      disabled: isPending,
      variant: "primary",

    });
  }
  if (testStatus?.canApproveReview) {
    recordActions.push({
      key: "approve-review",
      label: isPending ? "复核中" : "复核通过",
      onClick: approveReview,
      disabled: isPending,
      variant: "primary",

    });
  }
  const recordSteps = [
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
    ...runtimeStage.tests.map(item => ({
      key: item.key,
      label: `${item.sequence} ${item.name}`,
      href: qcBatchTestAnchorHref(batch.id, runtimeStage.key, item.key),
    })),
  ];
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([
      {
        key: "test-navigation",
        body: {
          kind: "navigation",
          navigation: {
            kind: "steps",
            active: runtimeTest.key,
            ariaLabel: "质检阶段导航",

            steps: recordSteps,
          },
        },
      },
      createHeadingSection("test-heading", {

        title: `${productName}${runtimeStage.label} - ${runtimeTest.name}`,
      }),
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
      ...(recordActions.length ? [createFormSection("test-actions", {
          kind: "filters" as const,
          content: { items: [] },
          commands: recordActions,
        })] : []),
      ...(saveState === "saved" || saveState === "error" ? [createMessageSection("test-save-status", {

        tone: saveState === "saved" ? "success" as const : "danger" as const,
        content: statusText || (saveState === "saved" ? "已保存" : "操作失败"),
      })] : []),
    ])}
  />;
}
