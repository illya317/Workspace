"use client";

import { createPageBody, BodySurface } from "@workspace/core/ui";
import { workflowRequestTimelineSectionSpec } from "./body-surface-adapters";
import type { WorkflowRequestTimelineEvent } from "./types";

export interface WorkflowRequestTimelineProps {
  events?: readonly WorkflowRequestTimelineEvent[];
  emptyText?: string;
}

export function WorkflowRequestTimeline({
  events = [],
  emptyText = "暂无流转记录",
}: WorkflowRequestTimelineProps) {
  return (
    <BodySurface {...createPageBody(events.length > 0 ? [workflowRequestTimelineSectionSpec("workflow-request-timeline", events)] : [], {
        empty: events.length === 0 ? { presentation: "plain", content: emptyText } : undefined,
      })} />
  );
}
