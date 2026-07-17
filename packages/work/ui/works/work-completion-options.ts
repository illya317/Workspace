import { STANDING_RESPONSIBILITY_STATUS_OPTIONS, WORK_STATUS_OPTIONS } from "./model";
import type { WorkItem, WorkItemDraft, WorkItemType } from "./types";

export function workItemStatusOptions({
  draft,
  works,
  excludedWorkId,
  isStandingResponsibility,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  excludedWorkId: number | null;
  isStandingResponsibility: boolean;
}) {
  const directChildren = excludedWorkId ? works.filter((work) => work.parentWorkItemId === excludedWorkId) : [];
  const evidenceTasks = excludedWorkId && draft.itemType === "key_result"
    ? works.filter((work) => draft.evidenceTaskIds.includes(work.id))
    : [];
  const blockers = draft.status === "done" ? [] : Array.from(new Map([...directChildren, ...evidenceTasks]
    .filter((work) => !work.isArchived && work.status !== "done")
    .map((work) => [work.id, work])).values());
  const description = blockers.length > 0
    ? `${blockers.slice(0, 3).map((work) => `${nodeTypeLabel(work.itemType)}「${work.content}」`).join("、")}尚未完成`
    : undefined;
  const options = isStandingResponsibility ? STANDING_RESPONSIBILITY_STATUS_OPTIONS : WORK_STATUS_OPTIONS;
  return options.map((option) => option.value === "done"
    ? { ...option, disabled: blockers.length > 0, description }
    : option);
}

function nodeTypeLabel(itemType: WorkItemType) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "关键结果";
  return "子任务";
}
