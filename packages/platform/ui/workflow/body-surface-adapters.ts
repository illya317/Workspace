import {
  createFieldsSection,
  createRecordSection,
  type BodySurfaceCommandSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceActionSpec,
  type FormSurfaceReadOnlyFieldSpec,
} from "@workspace/core/ui";
import {
  getWorkflowFlowTypeLabel,
  getWorkflowStatusLabel,
} from "../WorkflowStatusBadge";
import { workflowActionCommandAction, workflowActionCommandIcon } from "./workflow-labels";
import type { WorkflowActionCommand, WorkflowActionViewModel, WorkflowRequestTimelineEvent } from "./types";

export function workflowActionSurfaceActions(
  commands: readonly WorkflowActionCommand[],
): FormSurfaceActionSpec[] {
  return commands.map((command) => ({
    key: command.key,
    action: workflowActionCommandAction(command.kind),
    label: typeof command.label === "string" ? command.label : undefined,
    disabled: command.disabled,
    onClick: command.onClick,
  }));
}

export function workflowActionHeaderCommands(
  commands: readonly WorkflowActionCommand[],
): BodySurfaceCommandSpec[] {
  return commands.map((command) => ({
    key: command.key,
    label: command.label,
    icon: command.icon ?? workflowActionCommandIcon(command.kind),
    variant: command.variant,
    disabled: command.disabled,
    onClick: command.onClick,
  }));
}

export function workflowActionSlotSectionSpec(
  key: string,
  viewModel: WorkflowActionViewModel,
): BodySurfaceSectionSpec {
  return createFieldsSection(key, workflowActionFields(viewModel), {
    kind: "detail",
    layout: { columns: 3, density: "compact" },
    actions: workflowActionSurfaceActions(viewModel.commands),
  });
}

export function workflowRequestTimelineSectionSpec(
  key: string,
  events: readonly WorkflowRequestTimelineEvent[],
): BodySurfaceSectionSpec {
  return createRecordSection(key, {
    records: events.map((event) => ({
      key: String(event.id),
      expanded: Boolean(event.comment),
      onToggle: () => undefined,
      header: { kind: "text", value: `${event.actor} · ${event.type} · ${event.at}` },
      detail: event.comment ? { kind: "text", value: event.comment } : { kind: "empty", content: "无备注" },
    })),
    empty: "暂无流转记录",
  });
}

function workflowActionFields(viewModel: WorkflowActionViewModel): FormSurfaceReadOnlyFieldSpec[] {
  const statusText = viewModel.status
    ? `${getWorkflowFlowTypeLabel(viewModel.flowType)} · ${getWorkflowStatusLabel(viewModel.status, viewModel.flowType)}`
    : getWorkflowFlowTypeLabel(viewModel.flowType);
  return [
    { kind: "readonly", key: "workflow-title", label: "流程", value: String(viewModel.title) },
    { kind: "readonly", key: "workflow-status", label: "状态", value: statusText },
    { kind: "readonly", key: "workflow-summary", label: "请求", value: String(viewModel.summary ?? viewModel.requestId ?? "-") },
  ];
}
