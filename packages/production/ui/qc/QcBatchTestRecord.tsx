"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@workspace/core/ui";
import type { QcBatchSummary, QcEditorRuntimeStage, QcEditorRuntimeTemplate, QcEditorRuntimeTest } from "@workspace/production/types";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcBatchRecordPage from "./QcBatchRecordPage";
import { useEditorRuntimeFormulaEngine } from "./useEditorRuntimeFormulaEngine";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  runtimeTemplate: QcEditorRuntimeTemplate;
  runtimeStage: QcEditorRuntimeStage;
  runtimeTest: QcEditorRuntimeTest;
  currentUserName: string;
  canUpdate: boolean;
  canApprove: boolean;
}

function writableRuntimeKeys(runtimeTest: QcEditorRuntimeTest) {
  const keys = new Set<string>();
  for (const block of runtimeTest.blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text" && !part.referenceFieldKey && !part.fieldKey.includes("/signature/") && part.slotKind !== "formula" && part.slotKind !== "reference" && !part.readonlyDisplay) keys.add(part.fieldKey);
      })));
    }
  }
  return keys;
}

function writableRuntimeValues(values: Record<string, string>, runtimeTest: QcEditorRuntimeTest) {
  const keys = writableRuntimeKeys(runtimeTest);
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}

function hasWritableRuntimeChanges(values: Record<string, string>, initialValues: Record<string, string>, runtimeTest: QcEditorRuntimeTest) {
  const keys = writableRuntimeKeys(runtimeTest);
  for (const key of keys) {
    if (String(values[key] ?? "") !== String(initialValues[key] ?? "")) return true;
  }
  return false;
}

export default function QcBatchTestRecord({
  batch,
  runtimeTemplate,
  runtimeStage,
  runtimeTest,
  currentUserName,
  canUpdate,
  canApprove,
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
  const testsLocked = locked;
  const readOnly = testsLocked || !!testStatus?.automatic || !!testStatus?.reviewed || !canUpdate;
  const inspectionDirty = hasWritableRuntimeChanges(form.values, batch.fields, runtimeTest);
  const saveRequiresChange = !!testStatus?.inspected;
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref/inspector": inspectorName,
    "__qc_ref/reviewer": reviewerName,
    "__qc_ref_batch_number": batch.batchNumber,
    "__qc_ref_inspector": inspectorName,
    "__qc_ref_reviewer": reviewerName
  };
  function save() {
    if (saveRequiresChange && !hasWritableRuntimeChanges(form.values, batch.fields, runtimeTest)) {
      feedback.error("内容未修改，无需重复保存。");
      return;
    }
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
  return (
    <QcBatchRecordPage
      batch={batch}
      runtimeTemplate={runtimeTemplate}
      runtimeStage={runtimeStage}
      activeValue={runtimeTest.key}
      blocks={runtimeTest.blocks}
      values={form.values}
      referenceValues={referenceValues}
      onFieldChange={form.setValue}
      readOnly={readOnly}
      testsLocked={testsLocked}
      testOptionSuffixes={Object.fromEntries((stageStatus?.tests ?? []).map((test) => [test.testName, test.automatic ? " · 自动通过" : ""]))}
      isPending={isPending}
      canSaveRecord={canUpdate && !!testStatus?.canSaveInspection}
      saveDisabled={testsLocked || (saveRequiresChange && !inspectionDirty)}
      onSaveRecord={save}
      canApproveRecord={canApprove && !!testStatus?.canApproveReview}
      onApproveRecord={approveReview}
      onNavigate={(href) => router.push(href)}
      leadingSections={[]}
    />
  );
}
