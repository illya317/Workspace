"use client";

import { workspacePath } from "@workspace/core/routing";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ActionButton, ActionToolbar, StructuredTable } from "@workspace/core/ui";
import type { QcBatchSummary, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";
import QcLayoutPaper from "./QcLayoutPaper";
import QcMethodFieldTable from "./QcMethodFieldTable";
import { useQcFormulaEngine } from "./useQcFormulaEngine";

interface Props {
  batch: QcBatchSummary;
  productName: string;
  stage: QcTemplateStage;
  test: QcTemplateTestItem;
}

export default function QcBatchTestRecord({ batch, productName, stage, test }: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const form = useQcFormulaEngine(test, { ...batch.fields, batch_number: batch.batchNumber });

  function save() {
    setSaveState("idle");
    startTransition(async () => {
      const response = await fetch(workspacePath(`/api/production/qc/batches/${batch.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: form.values }),
      });
      setSaveState(response.ok ? "saved" : "error");
    });
  }

  return (
    <section>
      <div className="mx-auto max-w-[min(230mm,calc(100vw-2rem))]" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
        <nav className="mb-5 flex flex-wrap gap-2 text-xs">
          <Link href={`/production/qc/batches/${batch.id}`} className="rounded bg-blue-100 px-3 py-2 font-medium text-blue-800">
            返回批次主页
          </Link>
          <Link href={`/production/qc/batches/${batch.id}/${stage.key}`} className="rounded bg-slate-100 px-3 py-2 text-slate-700">
            检验前确认
          </Link>
          {stage.tests.map((item) => (
            <Link
              key={item.englishName}
              href={`/production/qc/batches/${batch.id}/${stage.key}/${item.englishName}`}
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
              批号 {batch.batchNumber} · {test.methodName || "未配置方法"} · {test.layout?.templateId || "未映射组件"}
            </span>
          )}
        />

        <StructuredTable
          className="mb-5 w-full border-collapse text-sm text-slate-950"
          rows={[
            [
              { content: "标准规定", className: "w-32 border border-slate-950 px-3 py-2 text-center" },
              { content: test.standardText || "未配置", className: "border border-slate-950 px-3 py-2" },
            ],
            [
              { content: "结论", className: "border border-slate-950 px-3 py-2 text-center" },
              { content: `${test.conclusionName || test.name}${test.hasNumericConclusion ? "（含数值）" : ""}`, className: "border border-slate-950 px-3 py-2" },
            ],
            [
              { content: "组件映射", className: "border border-slate-950 px-3 py-2 text-center" },
              {
                content: `${test.layout?.templateId || "未映射"}${test.layout?.familyId ? ` · ${test.layout.familyId}` : ""}${test.layout?.reusedFrom ? ` · 复用 ${test.layout.reusedFrom}` : ""}`,
                className: "border border-slate-950 px-3 py-2",
              },
            ],
          ]}
        />

        <div className="mb-3 text-sm font-semibold text-slate-950">实验记录</div>
        {test.layoutBlocks?.length
          ? <QcLayoutPaper blocks={test.layoutBlocks} test={test} values={form.values} onFieldChange={form.setValue} />
          : <QcMethodFieldTable test={test} values={form.values} onFieldChange={form.setValue} />}

        <div className="mt-8 flex items-center justify-center gap-3">
          <ActionButton
            onClick={save}
            disabled={isPending}
            variant="primary"
            className="px-8"
          >
            {isPending ? "保存中" : "保存"}
          </ActionButton>
          {saveState === "saved" && <span className="text-sm text-emerald-700">已保存</span>}
          {saveState === "error" && <span className="text-sm text-red-700">保存失败</span>}
        </div>
      </div>
    </section>
  );
}
