import type {
  FormSurfaceActionSpec,
  FormSurfaceSubmitSpec,
} from "../../FormSurface.types";

export function isFormSurfaceNativeSubmitAction(action: FormSurfaceActionSpec) {
  return !action.onClick && (action.action === "save" || action.action === "submit");
}

export function resolveFormSurfaceSubmitAction(actions?: readonly FormSurfaceActionSpec[]) {
  return actions?.find(isFormSurfaceNativeSubmitAction)
    ?? actions?.find((action) => action.action === "save")
    ?? actions?.find((action) => action.action === "submit");
}

export function executeFormSurfaceSubmit(
  submit: FormSurfaceSubmitSpec | undefined,
  actions: readonly FormSurfaceActionSpec[] | undefined,
) {
  const submitAction = resolveFormSurfaceSubmitAction(actions);
  if (!submit || !submitAction || submitAction.disabled) return false;
  submit.onSubmit();
  return true;
}
