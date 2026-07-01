import Link from "next/link";
import { CheckCircle2, ClipboardList, LockKeyhole, RotateCcw } from "lucide-react";
import type { QcBatchSummary } from "@workspace/production/types";
import type { QcEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow, type QcStageWorkflowStatus, type QcTestWorkflowStatus } from "@workspace/production/qc/workflow";
import { qcBatchStagePath, qcBatchTestPath } from "./qc-routes";

interface QcBatchRecordStageListProps {
  batch: QcBatchSummary;
  runtimeTemplate: QcEditorRuntimeTemplate;
  embedded?: boolean;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

export default function QcBatchRecordStageList({ batch, runtimeTemplate, embedded = false }: QcBatchRecordStageListProps) {
  const workflow = buildQcBatchWorkflow(runtimeTemplate, batch);
  const completedStages = workflow.stages.filter((stage) => stage.complete).length;
  const totalTests = workflow.tests.length;
  const completedTests = workflow.tests.filter((test) => test.complete).length;
  const pendingReview = workflow.tests.filter((test) => test.inspected && !test.reviewed).length;
  const summaryItems = [
    { key: "batch", label: "批号", value: batch.batchNumber },
    { key: "id", label: "批次ID", value: String(batch.id) },
    { key: "product", label: "产品", value: batch.productName },
    { key: "progress", label: "进度", value: `${completedTests}/${totalTests} 项完成` },
  ];

  return (
    <section className={`${embedded ? "w-full" : "mx-auto w-full max-w-6xl px-4 py-6"} font-sans text-slate-950`}>
      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
        <div className="grid gap-5 border-b border-emerald-100 bg-white px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <ClipboardList size={14} strokeWidth={1.9} />
              批次检验记录
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">{batch.productName}</h1>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <div key={item.key} className="border-l border-emerald-100 pl-3">
                  <div className="text-xs font-medium text-slate-500">{item.label}</div>
                  <div className="mt-1 break-words text-base font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-64 grid-cols-2 overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50/40 text-sm">
            <div className="border-r border-emerald-100 p-3">
              <div className="text-xs text-slate-500">阶段完成</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{completedStages}/{workflow.stages.length}</div>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-500">待复核</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">{pendingReview}</div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-emerald-50">
          {runtimeTemplate.stages.map((stage, index) => {
            const stageStatus = workflow.stages[index];
            const locked = !stageStatus?.unlocked;
            return (
              <div key={stage.key}>
                <StageRow
                  batchId={batch.id}
                  stageKey={stage.key}
                  index={index}
                  label={stage.label}
                  testCount={stage.tests.length}
                  status={stageStatus}
                  locked={locked}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StageRow({
  batchId,
  stageKey,
  index,
  label,
  testCount,
  status,
  locked,
}: {
  batchId: number;
  stageKey: string;
  index: number;
  label: string;
  testCount: number;
  status?: QcStageWorkflowStatus;
  locked: boolean;
}) {
  const completed = !!status?.complete;
  const state = stageState(status, locked);
  const testsLocked = locked || !status?.precheckComplete;
  return (
    <div className={`grid gap-4 px-5 py-5 md:grid-cols-[13rem_1fr] md:items-center ${locked ? "bg-slate-50/70 text-slate-400" : "bg-white"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${completed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : locked ? "border-slate-200 bg-white text-slate-400" : "border-emerald-200 bg-emerald-600 text-white"}`}>
          {numerals[index] ?? index + 1}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-lg font-semibold ${locked ? "text-slate-400" : "text-slate-950"}`}>{label}</div>
          <div className="mt-1 text-xs text-slate-500">{testCount} 项检测</div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StageStatusChip state={state} href={locked ? undefined : qcBatchStagePath(batchId, stageKey)} />
          {status?.tests.some((test) => test.waitingSourceReview) ? (
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">等待来源复核</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.tests.map((test) => (
            <TestChip
              key={test.testName}
              test={test}
              href={testsLocked ? undefined : qcBatchTestPath(batchId, stageKey, test.testName)}
              locked={testsLocked}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StageStatusChip({
  state,
  href,
}: {
  state: ReturnType<typeof stageState>;
  href?: string;
}) {
  const className = `inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${state.className}`;
  if (!href) {
    return (
      <span className={className}>
        {state.icon}
        {state.text}
      </span>
    );
  }
  return (
    <Link href={href} className={`${className} transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600`}>
      {state.icon}
      {state.text}
    </Link>
  );
}

function TestChip({ test, href, locked }: { test: QcTestWorkflowStatus; href?: string; locked: boolean }) {
  const state = testState(test, locked);
  const className = `inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${state.className}`;
  const content = (
    <>
      {state.icon}
      <span>{test.sequence} {test.name}</span>
    </>
  );
  if (!href) return <span className={className}>{content}</span>;
  return (
    <Link href={href} className={`${className} transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600`}>
      {content}
    </Link>
  );
}

function stageState(status: QcStageWorkflowStatus | undefined, locked: boolean) {
  if (locked) return { text: "前一阶段复核完成后解锁", icon: <LockKeyhole size={14} strokeWidth={1.9} />, className: "border-slate-200 bg-white text-slate-500" };
  if (status?.complete) return { text: "已全部复核", icon: <CheckCircle2 size={14} strokeWidth={1.9} />, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (!status?.precheckComplete) return { text: "待检验前确认", icon: <ClipboardList size={14} strokeWidth={1.9} />, className: "border-sky-200 bg-sky-50 text-sky-700" };
  if (status?.tests.some((test) => test.inspected && !test.reviewed)) return { text: "有项目待复核", icon: <RotateCcw size={14} strokeWidth={1.9} />, className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { text: "可检验", icon: <ClipboardList size={14} strokeWidth={1.9} />, className: "border-slate-200 bg-slate-50 text-slate-700" };
}

function testState(test: QcTestWorkflowStatus, locked: boolean) {
  if (locked) return { icon: <LockKeyhole size={13} strokeWidth={1.9} />, className: "border-slate-200 bg-white text-slate-400" };
  if (test.complete) return { icon: <CheckCircle2 size={13} strokeWidth={1.9} />, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (test.inspected && !test.reviewed) return { icon: <RotateCcw size={13} strokeWidth={1.9} />, className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { icon: <ClipboardList size={13} strokeWidth={1.9} />, className: "border-slate-200 bg-white text-slate-700" };
}
