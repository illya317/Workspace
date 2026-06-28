"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageSurface, type FormSurfaceCommandSpec } from "@workspace/core/ui";
import type { QcBatchSummary, QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcLayoutPaper from "./QcLayoutPaper";
import QcMethodFieldTable from "./QcMethodFieldTable";
import { useQcFormulaEngine } from "./useQcFormulaEngine";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  detail: QcTemplateDetail;
  stage: QcTemplateStage;
  test: QcTemplateTestItem;
  currentUserName: string;
}
function writableInspectionValues(values: Record<string, string>, stageKey: string, testName: string) {
  const prefix = `${stageKey}/${testName}/`;
  return Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(prefix) && !key.includes("/signature/")));
}
export default function QcBatchTestRecord({
  batch,
  productName,
  detail,
  stage,
  test,
  currentUserName
}: Props) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useQcFormulaEngine(test, {
    ...batch.fields,
    batch_number: batch.batchNumber
  });
  const workflow = useMemo(() => buildQcBatchWorkflow(detail, batch, currentUserName), [batch, currentUserName, detail]);
  const stageStatus = workflow.stages.find(item => item.key === stage.key);
  const testStatus = workflow.tests.find(item => item.stageKey === stage.key && item.testName === test.englishName);
  const inspectorName = testStatus?.inspectorName || currentUserName;
  const reviewerName = testStatus?.reviewerName || "";
  const locked = !stageStatus?.unlocked;
  const readOnly = locked || !!testStatus?.automatic || !!testStatus?.reviewed;
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref/inspector": inspectorName,
    "__qc_ref/reviewer": reviewerName
  };
  function save() {
    setSaveState("idle");
    setStatusText("");
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc-batches/${batch.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "save_inspection",
          stageKey: stage.key,
          testName: test.englishName,
          fields: writableInspectionValues(form.values, stage.key, test.englishName)
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
      const response = await fetch(workspacePath(`/api/modules/production/qc-batches/${batch.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "approve_review",
          stageKey: stage.key,
          testName: test.englishName
        })
      });
      const body = await response.json().catch(() => null);
      setSaveState(response.ok ? "saved" : "error");
      setStatusText(response.ok ? "已复核" : body?.error || "复核失败");
      if (response.ok) router.refresh();
    });
  }
  const workflowMessage = locked ? "前一阶段尚未全部复核完成，当前项目暂不可操作。" : testStatus?.automatic ? testStatus.reviewed ? "引用待包装品结果 / 自动通过" : "等待待包装品源项目复核" : testStatus?.reviewed ? `已复核：${testStatus.reviewerName || "-"}` : testStatus?.inspected ? `待复核：检验者 ${testStatus.inspectorName || "-"}` : "待检验";
  const recordActions: FormSurfaceCommandSpec[] = [];
  if (testStatus?.canSaveInspection) {
    recordActions.push({
      key: "save-inspection",
      label: isPending ? "保存中" : "保存检验",
      onClick: save,
      disabled: isPending,
      variant: "primary",
      className: "px-8",
    });
  }
  if (testStatus?.canApproveReview) {
    recordActions.push({
      key: "approve-review",
      label: isPending ? "复核中" : "复核通过",
      onClick: approveReview,
      disabled: isPending,
      variant: "primary",
      className: "px-8",
    });
  }
  const recordSteps = [
    {
      key: "batch",
      label: "返回批次主页",
      href: `/production/qc-batches/${batch.id}`,
      tone: "primary" as const,
    },
    {
      key: "precheck",
      label: "检验前确认",
      href: `/production/qc-batches/${batch.id}/${stage.key}`,
    },
    ...stage.tests.map(item => ({
      key: item.englishName,
      label: `${item.sequence} ${item.name}`,
      href: `/production/qc-batches/${batch.id}/${stage.key}/${item.englishName}`,
    })),
  ];
  return <PageSurface
    kind="detail"
    embedded
    contentClassName="pb-8"
    blocks={[
      {
        kind: "navigation",
        key: "test-navigation",
        surface: {
          kind: "steps",
          active: test.englishName,
          ariaLabel: "质检阶段导航",
          className: "mx-auto max-w-[210mm]",
          steps: recordSteps,
        },
      },
      {
        kind: "heading",
        key: "test-heading",
        className: "mx-auto max-w-[210mm]",
        title: `${productName}${stage.label} - ${test.name}`,
        subtitle: `批号 ${batch.batchNumber} · ${workflowMessage}`,
      },
      {
        kind: "document",
        key: "test-record-paper",
        surface: {
          kind: "pages",
          pages: [{
            key: "paper",
            size: "a4",
            content: test.layoutBlocks?.length ? <QcLayoutPaper blocks={test.layoutBlocks} test={test} values={form.values} referenceValues={referenceValues} onFieldChange={form.setValue} readOnly={readOnly} fieldScopePrefix={`${stage.key}/${test.englishName}`} /> : <div className="qc-a4-page qc-paper-font qc-paper-page mx-auto box-border overflow-visible bg-white text-slate-950">
                  <QcMethodFieldTable test={test} values={form.values} onFieldChange={form.setValue} readOnly={readOnly} />
                </div>,
          }],
        },
      },
      ...(recordActions.length ? [{
        kind: "form" as const,
        key: "test-actions",
        surface: {
          kind: "inline" as const,
          className: "mx-auto mt-8 max-w-[210mm] justify-center text-center",
          actions: recordActions,
        },
      }] : []),
      ...(saveState === "saved" || saveState === "error" ? [{
        kind: "message" as const,
        key: "test-save-status",
        className: "mx-auto max-w-[210mm] text-center",
        tone: saveState === "saved" ? "success" as const : "danger" as const,
        content: statusText || (saveState === "saved" ? "已保存" : "操作失败"),
      }] : []),
    ]}
  />;
}
