import {
  createFieldsSection,
  createMessageSection,
  createPageDataSection,
  createPanelSection,
  createSectionSection,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";

import type { ProjectNotificationQueueFailure } from "./notification-governance-api";

const queueFailureColumns: DataSurfaceColumnSpec<ProjectNotificationQueueFailure>[] = [
  {
    key: "failedAt",
    label: "失败时间",
    cell: (row) => new Date(row.failedAt).toLocaleString("zh-CN", { hour12: false }),
  },
  {
    key: "signalKind",
    label: "信号",
    cell: (row) => ({ kind: "text", value: row.signalKind, font: "mono" }),
  },
  { key: "attemptCount", label: "尝试", cell: (row) => row.attemptCount },
  {
    key: "ruleIds",
    label: "涉及规则",
    cell: (row) => row.ruleIds.length ? row.ruleIds.join("、") : "—",
  },
  { key: "errorCode", label: "错误码", cell: (row) => row.errorCode ?? "unknown" },
  { key: "errorSummary", label: "安全摘要", cell: (row) => row.errorSummary ?? "未提供" },
];

export function createProjectNotificationQueueFailureSection(input: {
  rows: ProjectNotificationQueueFailure[];
  loading: boolean;
  canConfigure: boolean;
  busy: string | null;
  redriveTarget: ProjectNotificationQueueFailure | null;
  redriveReason: string;
  onRedriveReasonChange: (value: string) => void;
  onSelectRedrive: (row: ProjectNotificationQueueFailure) => void;
  onCancelRedrive: () => void;
  onConfirmRedrive: () => void;
}) {
  return createSectionSection("project-notification-queue-failures", {
    title: "最近队列失败",
    sections: [
      ...(input.redriveTarget ? [createPanelSection("project-notification-redrive-panel", {
        title: "人工重投",
        sections: [
          createMessageSection("project-notification-redrive-warning", {
            tone: "warning",
            content: `将重投 ${input.redriveTarget.signalKind}（已尝试 ${input.redriveTarget.attemptCount} 次）。已成功发布的规则不会重复发送；本次原因会写入不可变审计事实。`,
          }),
          createFieldsSection("project-notification-redrive-fields", [{
            key: "reason",
            label: "重投原因",
            required: true,
            span: "wide",
            spec: {
              valueType: "string",
              control: "text",
              multiline: true,
              state: input.busy === "redrive" ? "disabled" : "normal",
              validation: { required: true },
            },
            value: input.redriveReason,
            rows: 3,
            maxLength: 500,
            placeholder: "说明已修复的问题或允许再次投递的依据",
            onChange: (value: unknown) => input.onRedriveReasonChange(String(value ?? "")),
          }], {
            layout: { columns: 1, density: "compact" },
            actions: [
              {
                key: "confirm-redrive",
                action: "submit",
                label: input.busy === "redrive" ? "重投中…" : "确认重投",
                disabled: input.busy !== null,
                onClick: input.onConfirmRedrive,
              },
              {
                key: "cancel-redrive",
                action: "cancel",
                label: "取消",
                disabled: input.busy !== null,
                onClick: input.onCancelRedrive,
              },
            ],
          }),
        ],
      })] : []),
      createPageDataSection("project-notification-queue-failure-table", {
        kind: "table",
        rows: input.rows,
        columns: queueFailureColumns,
        visibleColumns: queueFailureColumns.map((column) => column.key),
        loading: input.loading,
        emptyText: "当前没有永久失败的项目通知信号",
        rowKey: (row) => row.signalRecordId,
        rowActions: input.canConfigure ? (row) => [{
          key: `redrive-${row.signalRecordId}`,
          label: "重投",
          kind: "restore",
          disabled: input.busy !== null,
          onClick: () => input.onSelectRedrive(row),
        }] : undefined,
        actionsColumn: input.canConfigure ? { label: "处置" } : undefined,
        presentation: {
          density: "compact",
          rowHover: input.canConfigure ? "interactive" : "none",
        },
      }),
    ],
  });
}
