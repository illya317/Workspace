"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
      const response = await fetch(`/workspace/api/production/qc/batches/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: form.values }),
      });
      setSaveState(response.ok ? "saved" : "error");
    });
  }

  return (
    <section className="bg-white px-4 py-7 shadow-sm">
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

        <div className="mb-5 text-center">
          <h1 className="text-base font-semibold text-slate-950">{productName}{stage.label} - {test.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            批号 {batch.batchNumber} · {test.methodName || "未配置方法"} · {test.layout?.templateId || "未映射组件"}
          </p>
        </div>

        <table className="mb-5 w-full border-collapse text-sm text-slate-950">
          <tbody>
            <tr>
              <td className="w-32 border border-slate-950 px-3 py-2 text-center">标准规定</td>
              <td className="border border-slate-950 px-3 py-2">{test.standardText || "未配置"}</td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2 text-center">结论</td>
              <td className="border border-slate-950 px-3 py-2">
                {test.conclusionName || test.name}{test.hasNumericConclusion ? "（含数值）" : ""}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2 text-center">组件映射</td>
              <td className="border border-slate-950 px-3 py-2">
                {test.layout?.templateId || "未映射"}
                {test.layout?.familyId ? ` · ${test.layout.familyId}` : ""}
                {test.layout?.reusedFrom ? ` · 复用 ${test.layout.reusedFrom}` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mb-3 text-sm font-semibold text-slate-950">实验记录</div>
        {test.layoutBlocks?.length
          ? <QcLayoutPaper blocks={test.layoutBlocks} test={test} values={form.values} onFieldChange={form.setValue} />
          : <QcMethodFieldTable test={test} values={form.values} onFieldChange={form.setValue} />}

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-blue-600 px-8 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
          >
            {isPending ? "保存中" : "保存"}
          </button>
          {saveState === "saved" && <span className="text-sm text-emerald-700">已保存</span>}
          {saveState === "error" && <span className="text-sm text-red-700">保存失败</span>}
        </div>
      </div>
    </section>
  );
}
