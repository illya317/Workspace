export interface BusinessTemporalUiPolicy {
  asOf: "hidden" | "optional" | "required";
  upcoming: boolean;
  history: boolean;
  recordState: boolean;
  sourceNavigation: boolean;
  /** Standard record-list adoption verified by the Business Temporal registry gate. */
  recordView?: {
    presentation: "expandable-record-list";
    modulePath: string;
    registrationBinding: string;
  };
}

export function businessTemporalUiPolicyError(ui: BusinessTemporalUiPolicy): string | null {
  if (!ui.recordView) return null;
  if (!ui.history) return "标准生命周期记录表要求 ui.history=true";
  if (!ui.recordView.modulePath.trim() || !ui.recordView.registrationBinding.trim()) {
    return "recordView 必须声明实现 modulePath 和 registrationBinding";
  }
  return null;
}
