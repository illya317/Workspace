"use client";

import { workspacePath } from "@workspace/core/routing";
import { createFormSection, useFeedback, type BodySurfaceSectionSpec, type FormSurfaceFieldSpec } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FINANCE_CLOSE_WORKPAPER_TASK_KEYS,
  type FinanceCloseScope,
  type FinanceCloseWorkpaperDto,
  type FinanceCloseWorkpaperStatus,
  type FinanceCloseWorkpaperTaskKey,
  type SaveFinanceCloseWorkpaperInput,
} from "../../types/close";
import { financeCloseWorkpaperReviewIdempotencyKey, financeCloseWorkpaperSaveIdempotencyKey } from "./closeTabModel";
import {
  closeWorkpaperContextKey,
  closeWorkpaperMutationMatches,
  closeWorkpaperResponseMatches,
} from "./closeWorkpaperClientModel";
import { createCurrentValueTracker, createLatestRequestGate } from "../components/latest-request-gate";

const supported = new Set<string>(FINANCE_CLOSE_WORKPAPER_TASK_KEYS);
const statusOptions = [
  { value: "draft", label: "草稿" },
  { value: "prepared", label: "已提交复核" },
  { value: "reviewed", label: "已独立复核" },
  { value: "blocked", label: "阻断" },
];

export function useCloseWorkpaperSection(input: {
  scope: FinanceCloseScope | null;
  isPeriodClosed: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  actorUserId: number;
  taskLabels: ReadonlyMap<string, string>;
  onChanged: () => Promise<unknown>;
}) {
  const { scope, isPeriodClosed, canUpdate, canApprove, actorUserId, taskLabels, onChanged } = input;
  const [taskKey, setTaskKey] = useState<FinanceCloseWorkpaperTaskKey | null>(() => workpaperTaskFromLocation());
  const [workpaper, setWorkpaper] = useState<FinanceCloseWorkpaperDto | null>(null);
  const [status, setStatus] = useState<FinanceCloseWorkpaperStatus>("draft");
  const [conclusion, setConclusion] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [voucherText, setVoucherText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadGate] = useState(createLatestRequestGate);
  const [mutationGate] = useState(createLatestRequestGate);
  const [contextTracker] = useState(() => createCurrentValueTracker(""));
  const feedback = useFeedback();

  const applyWorkpaper = useCallback((next: FinanceCloseWorkpaperDto | null) => {
    setWorkpaper(next);
    setStatus(next?.status ?? "draft");
    setConclusion(next?.conclusion ?? "");
    setEvidenceText((next?.evidenceRefs ?? []).join("\n"));
    setVoucherText((next?.voucherRefs ?? []).join("\n"));
  }, []);

  const load = useCallback(async (requestedScope: FinanceCloseScope, requestedTaskKey: FinanceCloseWorkpaperTaskKey) => {
    const contextKey = closeWorkpaperContextKey(requestedScope, requestedTaskKey, null);
    const ticket = loadGate.begin(contextKey);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyCode: requestedScope.companyCode,
        year: String(requestedScope.year),
        month: String(requestedScope.month),
        taskKey: requestedTaskKey,
      });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/closing/workpapers?${params.toString()}`), { signal: ticket.signal });
      const data = await response.json().catch(() => null) as { scope: FinanceCloseScope; workpapers?: FinanceCloseWorkpaperDto[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || `关账底稿加载失败 (${response.status})`);
      if (!data || !closeWorkpaperResponseMatches(data, requestedScope, requestedTaskKey)) throw new Error("关账底稿返回了不一致的公司、期间或任务");
      if (!loadGate.isCurrent(ticket) || !contextTracker.isCurrent(contextKey)) return;
      const next = data.workpapers?.[0] ?? null;
      applyWorkpaper(next);
      contextTracker.set(closeWorkpaperContextKey(requestedScope, requestedTaskKey, next?.version ?? null));
    } catch (error) {
      if (!loadGate.isCurrent(ticket) || isAbortError(error)) return;
      feedback.error(error instanceof Error ? error.message : "关账底稿加载失败");
      applyWorkpaper(null);
    } finally {
      if (loadGate.isCurrent(ticket)) setLoading(false);
    }
  }, [applyWorkpaper, contextTracker, feedback, loadGate]);

  useEffect(() => {
    loadGate.invalidate();
    mutationGate.invalidate();
    applyWorkpaper(null);
    setLoading(false);
    setSaving(false);
    const contextKey = closeWorkpaperContextKey(scope, taskKey, null);
    contextTracker.set(contextKey);
    if (scope && taskKey) void load(scope, taskKey);
  }, [applyWorkpaper, contextTracker, load, loadGate, mutationGate, scope, taskKey]);
  useEffect(() => {
    const applyLocation = () => setTaskKey(workpaperTaskFromLocation());
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, []);

  const selectTask = useCallback((next: string) => {
    if (!supported.has(next)) return;
    const selected = next as FinanceCloseWorkpaperTaskKey;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "closing");
    params.set("taskKey", selected);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    setTaskKey(selected);
  }, []);

  const mutate = useCallback(async (kind: "save" | "review") => {
    if (!scope || !taskKey) return;
    const requestedScope = scope;
    const requestedTaskKey = taskKey;
    const requestedVersion = workpaper?.version ?? null;
    const contextKey = closeWorkpaperContextKey(requestedScope, requestedTaskKey, requestedVersion);
    if (!contextTracker.isCurrent(contextKey)) return;
    const ticket = mutationGate.begin(contextKey);
    const evidenceRefs = lines(evidenceText);
    const voucherRefs = lines(voucherText);
    const saveInput = {
      ...scope,
      taskKey,
      status: status === "reviewed" ? "prepared" as const : status,
      conclusion: conclusion.trim() || null,
      evidenceRefs,
      voucherRefs,
      expectedVersion: workpaper?.version ?? null,
    };
    const body = kind === "save" ? {
      ...saveInput,
      idempotencyKey: financeCloseWorkpaperSaveIdempotencyKey(saveInput, actorUserId),
    } satisfies SaveFinanceCloseWorkpaperInput : {
      ...scope,
      taskKey,
      expectedVersion: workpaper!.version,
      idempotencyKey: financeCloseWorkpaperReviewIdempotencyKey(workpaper!.id, workpaper!.version, actorUserId),
    };
    setSaving(true);
    try {
      const response = await fetch(workspacePath(kind === "save"
        ? "/api/modules/finance/ledger/closing/workpapers"
        : "/api/modules/finance/ledger/closing/workpapers/review"), {
        method: kind === "save" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ticket.signal,
      });
      const data = await response.json().catch(() => null) as FinanceCloseWorkpaperDto | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data ? data.error || "关账底稿保存失败" : `关账底稿保存失败 (${response.status})`);
      if (!data || "error" in data || !closeWorkpaperMutationMatches(data, requestedTaskKey, requestedVersion)) {
        throw new Error("关账底稿保存结果与当前任务或版本不一致");
      }
      if (!mutationGate.isCurrent(ticket) || !contextTracker.isCurrent(contextKey)) return;
      applyWorkpaper(data);
      contextTracker.set(closeWorkpaperContextKey(requestedScope, requestedTaskKey, data.version));
      feedback.success(kind === "save" ? "关账底稿已保存" : "关账底稿已完成独立复核");
      await onChanged();
    } catch (error) {
      if (!mutationGate.isCurrent(ticket) || isAbortError(error)) return;
      feedback.error(error instanceof Error ? error.message : "关账底稿保存失败");
    } finally {
      if (mutationGate.isCurrent(ticket)) setSaving(false);
    }
  }, [actorUserId, applyWorkpaper, conclusion, contextTracker, evidenceText, feedback, mutationGate, onChanged, scope, status, taskKey, voucherText, workpaper]);

  const section = useMemo<BodySurfaceSectionSpec | null>(() => {
    if (!taskKey) return null;
    const readOnly = isPeriodClosed;
    const fields: FormSurfaceFieldSpec[] = [
      choice("status", "状态", status, statusOptions, (value) => setStatus(value as FinanceCloseWorkpaperStatus), readOnly),
      textarea("conclusion", "结论", conclusion, setConclusion, readOnly),
      textarea("evidence", "证据引用（凭证分录或带 SHA-256 的外部链接，每行一项）", evidenceText, setEvidenceText, readOnly),
      textarea("vouchers", "凭证引用（finance-voucher:<id>，每行一项）", voucherText, setVoucherText, readOnly),
    ];
    return createFormSection("finance-close-workpaper", {
      kind: "fields",
      header: {
        title: `${taskLabels.get(taskKey) ?? taskKey}底稿`,
        description: workpaper?.status === "reviewed"
          ? `已由用户 #${workpaper.reviewedByUserId} 完成独立复核；再次保存会显式退回编制状态并清除旧复核。`
          : "提交复核需填写结论，并至少提供一项受控证据或同公司同期间已记账凭证。",
      },
      content: { items: fields, layout: { flow: "grid", columns: 2, density: "compact", commandPlacement: "below" } },
      actions: [{
        key: "save-workpaper",
        action: "save",
        label: saving ? "正在保存…" : "保存底稿",
        disabled: readOnly || loading || saving || !canUpdate || status === "reviewed",
        onClick: () => { void mutate("save"); },
      }, {
        key: "review-workpaper",
        action: "approve",
        label: saving ? "正在复核…" : "完成独立复核",
        disabled: readOnly || loading || saving || !canApprove || workpaper?.status !== "prepared" || workpaper.preparedByUserId === actorUserId,
        onClick: () => { void mutate("review"); },
      }],
    });
  }, [actorUserId, canApprove, canUpdate, conclusion, evidenceText, isPeriodClosed, loading, mutate, saving, status, taskKey, taskLabels, voucherText, workpaper]);

  return { section, selectedTaskKey: taskKey, selectTask };
}

function workpaperTaskFromLocation() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("taskKey");
  return value && supported.has(value) ? value as FinanceCloseWorkpaperTaskKey : null;
}

function lines(value: string) {
  return [...new Set(value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))];
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

function textarea(key: string, label: string, value: string, onChange: (value: string) => void, readOnly: boolean): FormSurfaceFieldSpec {
  return {
    key, label, spec: { valueType: "string", control: "textarea" }, value, readOnly, span: 2,
    onChange: (next) => onChange(String(next ?? "")),
  };
}

function choice(
  key: string,
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
  readOnly: boolean,
): FormSurfaceFieldSpec {
  return {
    key, label, spec: { valueType: "string", control: "choice", options: { source: "static", items: options } },
    value, readOnly, onChange: (next) => onChange(String(next ?? "")),
  };
}
