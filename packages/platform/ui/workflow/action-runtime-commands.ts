import type {
  CreateSurfaceSubmissionResult,
  CreateSurfaceSubmissionSpec,
} from "@workspace/core/ui";
import type {
  ActionRuntime,
  ActionRuntimeAction,
} from "../../workflow-action-runtime";
import type {
  WorkflowActionCommand,
  WorkflowActionCommandKind,
} from "./types";

export type ActionRuntimeCommandHandler = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  presentationKind?: WorkflowActionCommandKind;
};

export type ActionRuntimeCommandHandlers = Partial<
  Record<ActionRuntimeAction, ActionRuntimeCommandHandler>
>;

export type ActionRuntimeCreateSubmissionHandler = () =>
  | void
  | CreateSurfaceSubmissionResult
  | Promise<void | CreateSurfaceSubmissionResult>;

export interface ActionRuntimeCreateSubmissionOptions {
  disabled?: boolean;
  execute: ActionRuntimeCreateSubmissionHandler;
}

const ACTION_COMMANDS: Record<
  ActionRuntimeAction,
  { kind: WorkflowActionCommandKind; label: string }
> = {
  "record.save": { kind: "save", label: "保存" },
  "form.cancel": { kind: "cancel", label: "取消" },
  "workflow.request.submit": { kind: "submit", label: "提交" },
  "workflow.request.withdraw": { kind: "withdraw", label: "撤回" },
  "workflow.request.revise": { kind: "revise", label: "修订" },
  "workflow.request.resubmit": { kind: "resubmit", label: "再次提交" },
  "workflow.request.cancel": { kind: "cancel", label: "取消申请" },
  "workflow.request.approve": { kind: "approve", label: "批准" },
  "workflow.request.reject": { kind: "reject", label: "拒绝" },
  "workflow.request.reviewUpdate": { kind: "revise", label: "保存修订" },
};

export function actionRuntimeCommands(
  runtime: ActionRuntime | null | undefined,
  handlers: ActionRuntimeCommandHandlers,
): WorkflowActionCommand[] {
  if (!runtime) return [];
  return runtime.actions.flatMap((action) => {
    const handler = handlers[action];
    if (!handler) return [];
    const definition = ACTION_COMMANDS[action];
    return [{
      key: action,
      kind: handler.presentationKind ?? definition.kind,
      label: handler.label ?? definition.label,
      disabled: handler.disabled,
      onClick: handler.onClick,
    }];
  });
}

export function actionRuntimeCreateSubmission(
  runtime: ActionRuntime | null | undefined,
  options: ActionRuntimeCreateSubmissionOptions,
): CreateSurfaceSubmissionSpec | null {
  if (!runtime) return null;
  if (runtime.actions.includes("workflow.request.submit")) {
    return { action: "submit", disabled: options.disabled, execute: options.execute };
  }
  if (runtime.actions.includes("record.save")) {
    return { action: "save", disabled: options.disabled, execute: options.execute };
  }
  return null;
}
