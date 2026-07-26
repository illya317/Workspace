export type WorkOkrBoundControlActionKind = "objective_submit" | "report_submit";

export type WorkOkrBoundControl = {
  settings: Record<string, unknown>;
  policy: unknown;
  workflowEnabled: boolean;
};

export function parseBoundWorkOkrControl(
  snapshotJson: string | null | undefined,
  actionKind: WorkOkrBoundControlActionKind,
): WorkOkrBoundControl | null {
  if (!snapshotJson) return null;
  try {
    const snapshot = JSON.parse(snapshotJson) as unknown;
    if (!isRecord(snapshot) || snapshot.version !== 1) return null;
    const okrControl = isRecord(snapshot.okrControl) ? snapshot.okrControl : null;
    const controlVersion = Number(okrControl?.version);
    if (!okrControl || !Number.isInteger(controlVersion) || controlVersion <= 0 || !isRecord(okrControl.settings)) return null;
    const actions = isRecord(snapshot.actions) ? snapshot.actions : null;
    const action = actions && isRecord(actions[actionKind]) ? actions[actionKind] : null;
    const actionPolicy = action && isRecord(action.policy) ? action.policy : null;
    const mode = actionPolicy?.mode;
    if (mode !== "optional" && mode !== "required" && mode !== "direct" && mode !== "permission_only") return null;
    return {
      settings: okrControl.settings,
      policy: okrControl.policy,
      workflowEnabled: mode === "optional" || mode === "required",
    };
  } catch {
    return null;
  }
}

export function isBoundWorkOkrTimeControlEnabled(snapshotJson: string | null | undefined) {
  return parseBoundWorkOkrControl(snapshotJson, "objective_submit")?.settings.enabled !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
