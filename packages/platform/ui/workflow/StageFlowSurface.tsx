import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardList, LockKeyhole } from "lucide-react";
import { createPageBody, type BodySurfaceProps } from "@workspace/core/ui";
import WorkflowStatusBadge, { type WorkflowFlowType, type WorkflowStatus } from "../WorkflowStatusBadge";

export type StageFlowStateSpec =
  | { kind: "workflow"; status: WorkflowStatus }
  | { kind: "locked"; label: ReactNode }
  | { kind: "pending"; label: ReactNode }
  | { kind: "neutral" };

export interface StageFlowMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode;
}

export interface StageFlowHighlightSpec extends StageFlowMetricSpec {
  tone?: "default" | "warning";
}

export interface StageFlowNoticeSpec {
  key: string;
  label: ReactNode;
}

export interface StageFlowItemSpec {
  key: string;
  label: ReactNode;
  href?: string;
  state: StageFlowStateSpec;
}

export interface StageFlowStageSpec {
  key: string;
  ordinal: ReactNode;
  title: ReactNode;
  description: ReactNode;
  href?: string;
  state: StageFlowStateSpec;
  complete?: boolean;
  notices?: StageFlowNoticeSpec[];
  items?: StageFlowItemSpec[];
}

export interface StageFlowSurfaceProps {
  eyebrow: ReactNode;
  title: ReactNode;
  status: WorkflowStatus;
  flowType?: WorkflowFlowType;
  summary: StageFlowMetricSpec[];
  highlights: StageFlowHighlightSpec[];
  stages: StageFlowStageSpec[];
  embedded?: boolean;
}

/** @ui-specialized-surface Platform stage-flow implementation; callers declare semantic stages only. */
export function createStageFlowBody(spec: StageFlowSurfaceProps): BodySurfaceProps {
  return createPageBody([
    {
      key: "stage-flow",
      body: { kind: "section", empty: { presentation: "plain", content: <StageFlowSurface {...spec} /> } },
    },
  ]);
}

function StageFlowSurface({ eyebrow, title, status, flowType = "review", summary, highlights, stages, embedded = false }: StageFlowSurfaceProps) {
  return (
    <section className={`${embedded ? "w-full" : "mx-auto w-full max-w-6xl px-4 py-6"} font-sans text-slate-950`}>
      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
        <div className="grid gap-5 border-b border-emerald-100 bg-white px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <ClipboardList size={14} strokeWidth={1.9} />
              {eyebrow}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
              <WorkflowStatusBadge status={status} flowType={flowType} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.map((item) => (
                <div key={item.key} className="border-l border-emerald-100 pl-3">
                  <div className="text-xs font-medium text-slate-500">{item.label}</div>
                  <div className="mt-1 break-words text-base font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-64 grid-cols-2 overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50/40 text-sm">
            {highlights.map((item, index) => (
              <div key={item.key} className={`${index < highlights.length - 1 ? "border-r border-emerald-100" : ""} p-3`}>
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className={`mt-1 text-xl font-semibold ${item.tone === "warning" ? "text-amber-700" : "text-slate-950"}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-emerald-50">
          {stages.map((stage) => <StageFlowRow key={stage.key} stage={stage} flowType={flowType} />)}
        </div>
      </div>
    </section>
  );
}

function StageFlowRow({ stage, flowType }: { stage: StageFlowStageSpec; flowType: WorkflowFlowType }) {
  const locked = stage.state.kind === "locked";
  return (
    <div className={`grid gap-4 px-5 py-5 md:grid-cols-[13rem_1fr] md:items-center ${locked ? "bg-slate-50/70 text-slate-400" : "bg-white"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${stage.complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : locked ? "border-slate-200 bg-white text-slate-400" : "border-emerald-200 bg-emerald-600 text-white"}`}>
          {stage.ordinal}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-lg font-semibold ${locked ? "text-slate-400" : "text-slate-950"}`}>{stage.title}</div>
          <div className="mt-1 text-xs text-slate-500">{stage.description}</div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StageFlowStateChip state={stage.state} href={stage.href} flowType={flowType} />
          {stage.notices?.map((notice) => (
            <span key={notice.key} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">{notice.label}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {stage.items?.map((item) => <StageFlowItem key={item.key} item={item} flowType={flowType} />)}
        </div>
      </div>
    </div>
  );
}

function StageFlowStateChip({ state, href, flowType }: { state: StageFlowStateSpec; href?: string; flowType: WorkflowFlowType }) {
  if (state.kind === "workflow") {
    const badge = <WorkflowStatusBadge status={state.status} flowType={flowType} size="sm" />;
    if (!href) return badge;
    return <Link href={href} className="inline-flex rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{badge}</Link>;
  }
  if (state.kind === "neutral") return null;
  const locked = state.kind === "locked";
  const className = `inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${locked ? "border-slate-200 bg-white text-slate-500" : "border-sky-200 bg-sky-50 text-sky-700"}`;
  const content = <>{locked ? <LockKeyhole size={14} strokeWidth={1.9} /> : <ClipboardList size={14} strokeWidth={1.9} />}{state.label}</>;
  if (!href) return <span className={className}>{content}</span>;
  return <Link href={href} className={`${className} transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600`}>{content}</Link>;
}

function StageFlowItem({ item, flowType }: { item: StageFlowItemSpec; flowType: WorkflowFlowType }) {
  const locked = item.state.kind === "locked";
  const className = `inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${locked ? "border-slate-200 bg-white text-slate-400" : "border-slate-200 bg-white text-slate-700"}`;
  const content = (
    <>
      {item.state.kind === "workflow" ? <WorkflowStatusBadge status={item.state.status} flowType={flowType} size="sm" /> : locked ? <LockKeyhole size={13} strokeWidth={1.9} /> : null}
      <span>{item.label}</span>
    </>
  );
  if (!item.href) return <span className={className}>{content}</span>;
  return <Link href={item.href} className={`${className} transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600`}>{content}</Link>;
}
