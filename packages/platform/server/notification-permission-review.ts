export type PermissionReviewAlertPayload = {
  trigger: "daily" | "permission_mutation" | "manual";
  checkedAt: string;
  findingCount: number;
  criticalCount: number;
  alertCount: number;
  advisoryCount: number;
  findings: Array<{
    code: string;
    severity: "critical" | "high" | "warning";
    message: string;
    fingerprint: string;
  }>;
};

export const permissionReviewNotificationDefinition = {
  type: "security.permissionReview.alert",
  description: "权限定期复查或授权后即时复查发现异常时提醒安全责任人",
  isImportant: true,
  isStrongReminder: true,
  requiresAcknowledgement: true,
  render: (payload: PermissionReviewAlertPayload) => ({
    title: payload.alertCount > 0
      ? payload.criticalCount > 0 ? "权限复查发现严重异常" : "权限复查发现异常"
      : "权限复查提示",
    body: [
      payload.alertCount > 0
        ? `本次发现 ${payload.alertCount} 项需要处理的异常，其中严重 ${payload.criticalCount} 项。`
        : `本次有 ${payload.advisoryCount} 项流程职责分离提示，无需调整权限；请确保流程阻止提交人本人处理。`,
      ...payload.findings.slice(0, 5).map((item) => item.message),
      payload.findingCount > 5 ? `另有 ${payload.findingCount - 5} 项，请进入权限后台核查。` : "",
    ].filter(Boolean).join("\n"),
    href: "/settings/admin",
    payload,
  }),
} as const;
