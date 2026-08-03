import type {
  CreateSurfaceFeedbackSpec,
  CreateSurfaceSubmissionAction,
  CreateSurfaceSubmissionResult,
} from "../../CreateSurface.types";

export type CreateSubmissionLock = { current: boolean };

export function isCreateSubmissionDisabled({
  canCreate,
  submissionDisabled,
  surfaceDisabled,
}: {
  canCreate?: boolean;
  submissionDisabled?: boolean;
  surfaceDisabled?: boolean;
}) {
  return Boolean(canCreate === false || submissionDisabled || surfaceDisabled);
}

export function resolveCreateSubmissionMessage({
  action,
  feedback,
  result,
  title,
}: {
  action: CreateSurfaceSubmissionAction;
  feedback?: CreateSurfaceFeedbackSpec;
  result: void | CreateSurfaceSubmissionResult;
  title: string;
}) {
  const outcome = result?.outcome ?? (action === "submit" ? "submitted" : "saved");
  return result?.message
    ?? (outcome === "submitted"
      ? feedback?.submitted ?? `${title}流程已提交`
      : feedback?.saved ?? `${title}已保存`);
}

export interface ExecuteCreateSubmissionOptions {
  lock: CreateSubmissionLock;
  disabled: boolean;
  execute: () => void | CreateSurfaceSubmissionResult | Promise<void | CreateSurfaceSubmissionResult>;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result: void | CreateSurfaceSubmissionResult) => void;
  onError: (error: unknown) => void;
}

/**
 * React state alone does not close the same-tick double-click window. The ref lock is
 * acquired synchronously and remains held through success/error callbacks.
 */
export async function executeCreateSubmissionOnce({
  lock,
  disabled,
  execute,
  onPendingChange,
  onSuccess,
  onError,
}: ExecuteCreateSubmissionOptions): Promise<"executed" | "skipped"> {
  if (disabled || lock.current) return "skipped";
  lock.current = true;
  onPendingChange(true);
  try {
    let result: void | CreateSurfaceSubmissionResult;
    try {
      result = await execute();
    } catch (error) {
      onError(error);
      return "executed";
    }
    onSuccess(result);
  } finally {
    lock.current = false;
    onPendingChange(false);
  }
  return "executed";
}
