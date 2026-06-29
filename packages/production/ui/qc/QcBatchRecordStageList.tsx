import Link from "next/link";
import { createBlockSurfaceBlock, createPageBody, PageSurface } from "@workspace/core/ui";
import type { QcBatchSummary, QcTemplateDetail } from "@workspace/production/types";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcBatchNumberInput from "./QcBatchNumberInput";

interface QcBatchRecordStageListProps {
  batch: QcBatchSummary;
  detail: QcTemplateDetail;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

export default function QcBatchRecordStageList({ batch, detail }: QcBatchRecordStageListProps) {
  const workflow = buildQcBatchWorkflow(detail, batch);
  return (
    <section>
      <div className="qc-paper-font qc-paper-stage-shell mx-auto">
        <PageSurface
          kind="detail"
          embedded
          body={createPageBody([
            createBlockSurfaceBlock("qc-batch-record-summary", {
              kind: "content",

              content: (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">批号：</span>
                  <QcBatchNumberInput batchId={batch.id} initialValue={batch.batchNumber} />
                  <span className="text-xs text-slate-500">批次ID: {batch.id}</span>
                </div>
              ),
            }),
          ])}
        />

        <div className="border-2 border-slate-950 bg-white text-slate-950 shadow-sm">
          <div className="border-b-2 border-slate-950 px-6 py-4 text-center text-2xl font-semibold tracking-wide">
            {batch.productName}批检验记录
          </div>
          <div className="hidden grid-cols-[12rem_8rem_1fr] border-b-2 border-slate-950 text-center text-lg font-semibold md:grid">
            <div className="border-r-2 border-slate-950 px-4 py-3">阶段</div>
            <div className="border-r-2 border-slate-950 px-4 py-3">检测项</div>
            <div className="px-4 py-3">项目清单</div>
          </div>
          <div>
            {detail.stages.map((stage, index) => {
              const stageStatus = workflow.stages[index];
              const completed = stageStatus?.complete;
              const locked = !stageStatus?.unlocked;
              const content = (
                <>
                <div className="flex min-h-24 items-center justify-center border-b border-slate-200 px-4 py-4 text-xl font-semibold tracking-wide md:border-b-0 md:border-r-2 md:border-slate-950">
                  {numerals[index] ?? index + 1}、{stage.label}
                </div>
                <div className="flex items-center justify-center border-b border-slate-200 px-4 py-3 text-lg text-slate-700 md:border-b-0 md:border-r-2 md:border-slate-950">
                  {stage.tests.length} 项
                </div>
                <div className="flex flex-col justify-center gap-2 px-5 py-4 text-lg leading-9 text-slate-700 group-hover:text-slate-950">
                  <span>{stage.tests.map((test) => `${test.sequence} ${test.name}`).join(" / ")}</span>
                  <span className="font-sans text-xs leading-5 text-slate-500">
                    {locked ? "前一阶段复核完成后解锁" : completed ? "已全部复核" : "可检验 / 待复核"}
                  </span>
                </div>
                </>
              );
              return locked ? (
                <div key={stage.key} className="grid border-b-2 border-slate-950 bg-slate-100 text-slate-400 last:border-b-0 md:grid-cols-[12rem_8rem_1fr]">
                  {content}
                </div>
              ) : (
                <Link
                  key={stage.key}
                  href={`/production/qc-batches/${batch.id}/${stage.key}`}
                  className="group grid border-b-2 border-slate-950 transition last:border-b-0 hover:bg-slate-100 md:grid-cols-[12rem_8rem_1fr]"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
