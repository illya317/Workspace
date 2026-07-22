import type { BodySurfaceCommandSpec } from "@workspace/core/ui";
import { workflowActionCommandIcon } from "./workflow-labels";
import type { WorkflowActionCommand } from "./types";

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
