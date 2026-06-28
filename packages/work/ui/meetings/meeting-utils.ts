import { workspacePath } from "@workspace/core/routing";
import type { SessionUser } from "@workspace/platform/types";
import { DECISION_KIND_OPTIONS, ROLE_OPTIONS, type ActionDraft, type CreateMeetingDraft, type MeetingDetail } from "./meeting-types";

export async function requestJson<T>(path: string, init?: {
  method?: string;
  body?: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(workspacePath(path), {
    method: init?.method || "GET",
    headers: init?.body ? {
      "Content-Type": "application/json",
    } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data as T;
}

export function emptyMeetingDraft(typeId = ""): CreateMeetingDraft {
  return {
    typeId,
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    location: "",
    visibility: "participants_only",
    participantUserIds: "",
  };
}

export function emptyActionDraft(): ActionDraft {
  return {
    workPlanId: "",
    workItemId: "",
    projectTaskId: "",
    projectId: "",
    targetType: "personal",
    targetId: "",
  };
}

export function parseIdList(value: string) {
  return value.split(/,|，|\s/).map(item => Number(item.trim())).filter(id => Number.isInteger(id) && id > 0);
}

export function normalizeOptionalIds<T extends Record<string, string>>(draft: T) {
  const next: Record<string, unknown> = {
    ...draft,
  };
  for (const field of ["agendaItemId", "decisionId", "proposalId", "minVotesRequired"]) {
    if (field in next) next[field] = next[field] ? Number(next[field]) : null;
  }
  if ("effectiveDate" in next && !next.effectiveDate) next.effectiveDate = null;
  return next;
}

export function actionPayload(candidateId: number, action: string, draft: ActionDraft, user: SessionUser) {
  return {
    action,
    candidateId,
    workPlanId: draft.workPlanId ? Number(draft.workPlanId) : undefined,
    workItemId: draft.workItemId ? Number(draft.workItemId) : undefined,
    projectTaskId: draft.projectTaskId ? Number(draft.projectTaskId) : undefined,
    projectId: draft.projectId ? Number(draft.projectId) : undefined,
    targetType: draft.targetType || "personal",
    targetId: draft.targetId ? Number(draft.targetId) : user.id,
  };
}

export function agendaTitle(meeting: MeetingDetail, agendaItemId: number | null) {
  if (!agendaItemId) return "";
  return meeting.agendaItems.find(item => item.id === agendaItemId)?.title || "";
}

export function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: string) {
  if (status === "scheduled") return "已排期";
  if (status === "in_progress") return "进行中";
  if (status === "closed") return "已关闭";
  if (status === "passed") return "通过";
  if (status === "rejected") return "未通过";
  if (status === "open") return "表决中";
  return status || "未知";
}

export function roleLabel(role: string) {
  return ROLE_OPTIONS.find(item => item.value === role)?.label || role;
}

export function voteChoiceLabel(choice: string) {
  if (choice === "yes") return "赞成";
  if (choice === "no") return "反对";
  return "弃权";
}

export function decisionKindLabel(kind: string) {
  return DECISION_KIND_OPTIONS.find(item => item.value === kind)?.label || kind;
}

export function candidateStatusLabel(status: string) {
  if (status === "linked") return "已链接";
  if (status === "ignored") return "已忽略";
  return "候选";
}
