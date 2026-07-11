"use client";

import { createPageBody, createPageModalSection, BodySurface } from "@workspace/core/ui";
import {
  workflowActionSlotSectionSpec,
  workflowRequestTimelineSectionSpec,
} from "./body-surface-adapters";
import type { WorkflowRequestModalProps } from "./types";

export function WorkflowRequestModal({
  open,
  onClose,
  viewModel,
  payloadSections = [],
  timelineEvents = [],
}: WorkflowRequestModalProps) {
  if (!open) return null;
  return (
    <BodySurface {...createPageBody([
        createPageModalSection("workflow-request", {
          open,
          title: typeof viewModel.title === "string" ? viewModel.title : "流程请求",
          onClose,
          size: "lg",
          sections: [
            ...payloadSections,
            workflowActionSlotSectionSpec("workflow-request-action", { ...viewModel, placement: "modalFooter" }),
            workflowRequestTimelineSectionSpec("workflow-request-timeline", timelineEvents),
          ],
        }),
      ])} />
  );
}
