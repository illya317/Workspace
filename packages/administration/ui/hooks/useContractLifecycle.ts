"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createFieldsSection,
  createMessageSection,
  createPanelSection,
  useFeedback,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, FormSurfaceItemSpec } from "@workspace/core/ui";
import {
  CONTRACT_LIFECYCLE_OPTIONS,
  CONTRACT_PERFORMANCE_OPTIONS,
  CONTRACT_SIGNATURE_OPTIONS,
  contractOptionLabel,
  type Contract,
  type ContractLifecycleTimeline,
  type ContractStateAxis,
} from "@workspace/administration/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type MutationRecord = Pick<Contract, "version" | "currentRevisionId" | "lifecycleStatus" | "signatureStatus" | "performanceStatus">;

const AXIS_OPTIONS = [
  { value: "lifecycle", label: "合同状态" },
  { value: "signature", label: "签署状态" },
  { value: "performance", label: "履行状态" },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function optionsForAxis(axis: ContractStateAxis): readonly { value: string; label: string }[] {
  if (axis === "lifecycle") return CONTRACT_LIFECYCLE_OPTIONS;
  if (axis === "signature") return CONTRACT_SIGNATURE_OPTIONS;
  return CONTRACT_PERFORMANCE_OPTIONS;
}

function axisLabel(axis: ContractStateAxis) {
  return AXIS_OPTIONS.find((option) => option.value === axis)?.label ?? axis;
}

function stateLabel(axis: ContractStateAxis, value: string | null) {
  return value ? contractOptionLabel(optionsForAxis(axis), value) : "无";
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || `${fallback} (${response.status})`;
}

export function useContractLifecycle(input: {
  contract: Partial<Contract> | null;
  canUpdate: boolean;
  onMutation: (record: MutationRecord) => void;
  onListRefresh: () => Promise<unknown>;
  onPublication: () => void;
}) {
  const feedback = useFeedback();
  const contractId = input.contract?.id ?? null;
  const [timeline, setTimeline] = useState<ContractLifecycleTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<"state" | "revisions" | "events" | null>("state");
  const [revisionEffectiveOn, setRevisionEffectiveOn] = useState(today());
  const [revisionReason, setRevisionReason] = useState("");
  const [axis, setAxis] = useState<ContractStateAxis>("lifecycle");
  const [toState, setToState] = useState("");
  const [stateEffectiveOn, setStateEffectiveOn] = useState(today());
  const [stateReason, setStateReason] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!contractId) {
      setTimeline(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${contractId}/lifecycle`), {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(await responseError(response, "合同生命周期加载失败"));
      setTimeline(await response.json() as ContractLifecycleTimeline);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      feedback.error(error instanceof Error ? error.message : "合同生命周期加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [contractId, feedback]);

  useEffect(() => {
    const controller = new AbortController();
    setRevisionEffectiveOn(today());
    setRevisionReason("");
    setAxis("lifecycle");
    setToState("");
    setStateEffectiveOn(today());
    setStateReason("");
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const revisionMetaFields: FormSurfaceItemSpec[] = useMemo(() => [
    {
      key: "revisionEffectiveOn",
      label: "修订生效日",
      value: revisionEffectiveOn,
      spec: { valueType: "date", control: "temporal", precision: "date", state: busy ? "disabled" : "required" },
      onChange: (value) => setRevisionEffectiveOn(String(value ?? "")),
    },
    {
      key: "revisionReason",
      label: "修订原因",
      value: revisionReason,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: busy ? "disabled" : "required" },
      rows: 2,
      onChange: (value) => setRevisionReason(String(value ?? "")),
    },
  ], [busy, revisionEffectiveOn, revisionReason]);

  async function createRevision(contractDraft: Partial<Contract>) {
    if (!contractId || !input.canUpdate || !input.contract?.version) return false;
    if (!revisionEffectiveOn || !revisionReason.trim()) {
      feedback.error("修订生效日和修订原因必填");
      return false;
    }
    setBusy("create-revision");
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${contractId}/revisions`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": String(input.contract.version), "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ ...contractDraft, effectiveOn: revisionEffectiveOn, reason: revisionReason }),
      });
      if (!response.ok) throw new Error(await responseError(response, "修订草稿创建失败"));
      const body = await response.json() as { timeline: ContractLifecycleTimeline };
      setTimeline(body.timeline);
      setRevisionReason("");
      feedback.success("修订草稿已创建");
      return true;
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "修订草稿创建失败");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function mutation(path: string, body: Record<string, unknown>, busyKey: string, success: string, after?: () => void) {
    if (!contractId || !input.contract?.version) return;
    setBusy(busyKey);
    try {
      const response = await fetch(workspacePath(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": String(input.contract.version), "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response, success));
      const result = await response.json() as { record: MutationRecord; timeline: ContractLifecycleTimeline };
      input.onMutation(result.record);
      setTimeline(result.timeline);
      await input.onListRefresh();
      feedback.success(success);
      after?.();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "合同生命周期操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishRevision(revisionId: number) {
    await mutation(
      `/api/modules/administration/contracts/${contractId}/revisions/${revisionId}/publish`,
      { reason: revisionReason.trim() || undefined },
      `publish-${revisionId}`,
      "修订已发布",
      input.onPublication,
    );
  }

  async function transitionState() {
    if (!toState || !stateEffectiveOn || !stateReason.trim()) {
      feedback.error("目标状态、生效日和变更原因必填");
      return;
    }
    await mutation(
      `/api/modules/administration/contracts/${contractId}/state-events`,
      { axis, toState, effectiveOn: stateEffectiveOn, reason: stateReason },
      "state-transition",
      "合同状态已变更",
    );
    setToState("");
    setStateReason("");
  }

  async function reverseEvent(eventId: number) {
    const reason = stateReason.trim();
    if (!reason) {
      feedback.error("请先填写状态变更原因作为冲销说明");
      return;
    }
    await mutation(
      `/api/modules/administration/contracts/${contractId}/state-events/${eventId}/reverse`,
      { reason },
      `reverse-${eventId}`,
      "状态事件已冲销",
    );
    setStateReason("");
  }

  const sections: BodySurfaceSectionSpec[] = (() => {
    if (!contractId) return [];
    if (loading) return [createMessageSection("contract-lifecycle-loading", { tone: "muted", content: "正在加载合同生命周期..." })];
    const contract = input.contract;
    const currentStates: FormSurfaceItemSpec[] = [
      { key: "currentLifecycle", label: "合同状态", value: stateLabel("lifecycle", contract?.lifecycleStatus ?? null), spec: { valueType: "string", control: "text", state: "readonly" } },
      { key: "currentSignature", label: "签署状态", value: stateLabel("signature", contract?.signatureStatus ?? null), spec: { valueType: "string", control: "text", state: "readonly" } },
      { key: "currentPerformance", label: "履行状态", value: stateLabel("performance", contract?.performanceStatus ?? null), spec: { valueType: "string", control: "text", state: "readonly" } },
    ];
    const stateCommandFields: FormSurfaceItemSpec[] = !input.canUpdate || !contract?.currentRevisionId ? [] : [
      {
        key: "stateAxis",
        label: "状态轴",
        value: axis,
        spec: { valueType: "string", control: "choice", options: { source: "static", items: AXIS_OPTIONS.map((option) => ({ ...option })) }, state: busy ? "disabled" : "normal" },
        onChange: (value) => { setAxis(String(value) as ContractStateAxis); setToState(""); },
      },
      {
        key: "stateTarget",
        label: "目标状态",
        value: toState,
        spec: { valueType: "string", control: "choice", options: { source: "static", items: optionsForAxis(axis).map((option) => ({ ...option })) }, state: busy ? "disabled" : "required" },
        onChange: (value) => setToState(String(value ?? "")),
      },
      {
        key: "stateEffectiveOn",
        label: "生效日",
        value: stateEffectiveOn,
        spec: { valueType: "date", control: "temporal", precision: "date", state: busy ? "disabled" : "required" },
        onChange: (value) => setStateEffectiveOn(String(value ?? "")),
      },
      {
        key: "stateReason",
        label: "变更或冲销原因",
        value: stateReason,
        span: "wide",
        spec: { valueType: "string", control: "text", multiline: true, state: busy ? "disabled" : "required" },
        rows: 2,
        onChange: (value) => setStateReason(String(value ?? "")),
      },
    ];
    const revisionItems: FormSurfaceItemSpec[] = [
      ...(timeline?.currentRevision ? [{
        key: `revision-current-${timeline.currentRevision.id}`,
        label: `当前修订 R${timeline.currentRevision.revisionNo}`,
        value: `${timeline.currentRevision.effectiveOn} 起生效${timeline.currentRevision.reason ? ` · ${timeline.currentRevision.reason}` : ""}`,
        span: "wide" as const,
        spec: { valueType: "string" as const, control: "text" as const, state: "readonly" as const },
      }] : []),
      ...[...(timeline?.upcomingRevisions ?? []), ...(timeline?.draftRevisions ?? [])].map((revision) => ({
        key: `revision-draft-${revision.id}`,
        label: `${revision.effectiveOn > today() ? "待生效" : "待发布"} R${revision.revisionNo}`,
        value: `${revision.effectiveOn} · ${revision.reason ?? "未填写原因"}`,
        span: "wide" as const,
        spec: { valueType: "string" as const, control: "text" as const, state: "readonly" as const },
        actions: input.canUpdate && revision.effectiveOn <= today() ? [{
          key: `publish-${revision.id}`,
          action: "submit" as const,
          label: busy === `publish-${revision.id}` ? "发布中..." : "发布",
          disabled: busy !== null,
          onClick: () => void publishRevision(revision.id),
        }] : [],
      })),
      ...(timeline?.historicalRevisions ?? []).map((revision) => ({
        key: `revision-history-${revision.id}`,
        label: `历史修订 R${revision.revisionNo}`,
        value: `${revision.effectiveOn}${revision.effectiveThrough ? ` 至 ${revision.effectiveThrough}` : ""} · ${revision.reason ?? "无说明"}`,
        span: "wide" as const,
        spec: { valueType: "string" as const, control: "text" as const, state: "readonly" as const },
      })),
    ];
    const latestTransitionByAxis = new Map<string, number>();
    for (const event of timeline?.stateEvents ?? []) {
      if (event.recordState === "confirmed" && !latestTransitionByAxis.has(event.axis)) latestTransitionByAxis.set(event.axis, event.id);
    }
    const eventItems: FormSurfaceItemSpec[] = (timeline?.stateEvents ?? []).map((event) => ({
      key: `state-event-${event.id}`,
      label: `${event.effectiveOn} · ${axisLabel(event.axis)}`,
      value: `${stateLabel(event.axis, event.fromState)} → ${stateLabel(event.axis, event.toState)}${event.reason ? ` · ${event.reason}` : ""}${event.recordState === "reversed" ? " · 已冲销" : ""}`,
      span: "wide",
      spec: { valueType: "string", control: "text", state: "readonly" },
      actions: input.canUpdate && event.eventKind === "transition" && event.recordState === "confirmed" && latestTransitionByAxis.get(event.axis) === event.id ? [{
        key: `reverse-${event.id}`,
        action: "reset" as const,
        label: busy === `reverse-${event.id}` ? "冲销中..." : "冲销",
        disabled: busy !== null,
        onClick: () => void reverseEvent(event.id),
      }] : [],
    }));
    return [
      {
        ...createFieldsSection("contract-state-command", [...currentStates, ...stateCommandFields], {
          header: { title: "合同状态" },
          layout: { columns: 3 },
          actions: stateCommandFields.length ? [{
            key: "transition-state",
            action: "save",
            label: busy === "state-transition" ? "提交中..." : "提交状态变更",
            disabled: busy !== null || !toState || !stateReason.trim(),
            onClick: () => void transitionState(),
          }] : [],
        }),
        label: "合同状态",
        disclosure: { expanded: expanded === "state", onExpandedChange: (open) => setExpanded(open ? "state" : null) },
      },
      createPanelSection("contract-revisions", {
        title: `合同修订（${revisionItems.length}）`,
        disclosure: { expanded: expanded === "revisions", onExpandedChange: (open) => setExpanded(open ? "revisions" : null) },
        sections: [createFieldsSection("contract-revision-list", revisionItems.length ? revisionItems : [{
          key: "revision-empty",
          label: "修订",
          value: "暂无修订记录",
          spec: { valueType: "string", control: "text", state: "readonly" },
        }], { layout: { columns: 1 } })],
      }),
      createPanelSection("contract-state-events", {
        title: `状态历史（${eventItems.length}）`,
        disclosure: { expanded: expanded === "events", onExpandedChange: (open) => setExpanded(open ? "events" : null) },
        sections: [createFieldsSection("contract-state-event-list", eventItems.length ? eventItems : [{
          key: "event-empty",
          label: "状态事件",
          value: "暂无状态事件",
          spec: { valueType: "string", control: "text", state: "readonly" },
        }], { layout: { columns: 1 } })],
      }),
    ];
  })();

  return { createRevision, revisionMetaFields, revisionReason, sections };
}
