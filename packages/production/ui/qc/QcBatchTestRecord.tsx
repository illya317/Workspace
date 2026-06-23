"use client";

import { workspacePath } from "@workspace/core/routing";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, ActionToolbar } from "@workspace/core/ui";
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
  return Object.fromEntries(Object.entries(values).filter(([key]) => (
    key.startsWith(prefix) && !key.includes("/signature/")
  )));
}

export default function QcBatchTestRecord({ batch, productName, detail, stage, test, currentUserName }: Props) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useQcFormulaEngine(test, { ...batch.fields, batch_number: batch.batchNumber });
  const workflow = useMemo(() => buildQcBatchWorkflow(detail, batch, currentUserName), [batch, currentUserName, detail]);
  const stageStatus = workflow.stages.find((item) => item.key === stage.key);
  const testStatus = workflow.tests.find((item) => item.stageKey === stage.key && item.testName === test.englishName);
  const inspectorName = testStatus?.inspectorName || currentUserName;
  const reviewerName = testStatus?.reviewerName || "";
  const locked = !stageStatus?.unlocked;
  const readOnly = locked || !!testStatus?.automatic || !!testStatus?.reviewed;
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber,
    "__qc_ref/inspector": inspectorName,
    "__qc_ref/reviewer": reviewerName,
  };

  function save() {
    setSaveState("idle");
    setStatusText("");
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/modules/production/qc-batches/${batch.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_inspection",
          stageKey: stage.key,
          testName: test.englishName,
          fields: writableInspectionValues(form.values, stage.key, test.englishName),
        }),
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_review", stageKey: stage.key, testName: test.englishName }),
      });
      const body = await response.json().catch(() => null);
      setSaveState(response.ok ? "saved" : "error");
      setStatusText(response.ok ? "已复核" : body?.error || "复核失败");
      if (response.ok) router.refresh();
    });
  }

  const workflowMessage = locked
    ? "前一阶段尚未全部复核完成，当前项目暂不可操作。"
    : testStatus?.automatic
      ? testStatus.reviewed ? "引用待包装品结果 / 自动通过" : "等待待包装品源项目复核"
      : testStatus?.reviewed
        ? `已复核：${testStatus.reviewerName || "-"}`
        : testStatus?.inspected
          ? `待复核：检验者 ${testStatus.inspectorName || "-"}`
          : "待检验";

  return (
    <section className="overflow-x-auto pb-8">
      <div className="mx-auto max-w-[210mm]">
        <nav className="mb-5 flex flex-wrap gap-2 text-xs">
          <Link href={`/production/qc-batches/${batch.id}`} className="rounded bg-blue-100 px-3 py-2 font-medium text-blue-800">
            返回批次主页
          </Link>
          <Link href={`/production/qc-batches/${batch.id}/${stage.key}`} className="rounded bg-slate-100 px-3 py-2 text-slate-700">
            检验前确认
          </Link>
          {stage.tests.map((item) => (
            <Link
              key={item.englishName}
              href={`/production/qc-batches/${batch.id}/${stage.key}/${item.englishName}`}
              className={`rounded px-3 py-2 ${item.englishName === test.englishName ? "bg-slate-200 font-semibold text-slate-950" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {item.sequence} {item.name}
            </Link>
          ))}
        </nav>

        <ActionToolbar
          className="mb-5"
          leftSlot={`${productName}${stage.label} - ${test.name}`}
          rightSlot={(
            <span className="text-xs font-normal text-slate-500">
              批号 {batch.batchNumber} · {workflowMessage}
            </span>
          )}
        />
      </div>
      <div className="min-w-[210mm]">
        {test.layoutBlocks?.length ? (
          <QcLayoutPaper
            blocks={test.layoutBlocks}
            test={test}
            values={form.values}
            referenceValues={referenceValues}
            onFieldChange={form.setValue}
            readOnly={readOnly}
            fieldScopePrefix={`${stage.key}/${test.englishName}`}
          />
        ) : (
          <div
            className="qc-a4-page mx-auto box-border w-[210mm] min-w-[210mm] overflow-visible bg-white px-[16mm] py-[15mm] text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.10),0_10px_35px_rgba(15,23,42,0.12)]"
            style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
          >
            <QcMethodFieldTable test={test} values={form.values} onFieldChange={form.setValue} readOnly={readOnly} />
          </div>
        )}
      </div>

      <div className="mx-auto mt-8 flex max-w-[210mm] items-center justify-center gap-3">
        {testStatus?.canSaveInspection ? (
          <ActionButton
            onClick={save}
            disabled={isPending}
            variant="primary"
            className="px-8"
          >
            {isPending ? "保存中" : "保存检验"}
          </ActionButton>
        ) : null}
        {testStatus?.canApproveReview ? (
          <ActionButton
            onClick={approveReview}
            disabled={isPending}
            variant="primary"
            className="px-8"
          >
            {isPending ? "复核中" : "复核通过"}
          </ActionButton>
        ) : null}
        {saveState === "saved" && <span className="text-sm text-emerald-700">{statusText || "已保存"}</span>}
        {saveState === "error" && <span className="text-sm text-red-700">{statusText || "操作失败"}</span>}
      </div>
    </section>
  );
}
