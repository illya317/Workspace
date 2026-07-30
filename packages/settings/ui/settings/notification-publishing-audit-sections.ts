import {
  createPageDataSection,
  createSectionSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import {
  formatNotificationConsoleDate,
  notificationChannelHealthView,
  notificationDefinitionLifecycleActionView,
  notificationDeliveryCountLabel,
  notificationPublicationStatusView,
  type NotificationChannelEndpointRow,
  type NotificationDefinitionLifecycleEventRow,
  type NotificationPublicationRow,
  type NotificationPublishingWorkbenchResponse,
} from "./notification-publishing-workbench-model";

export function createNotificationPublishingAuditSections(input: {
  data: NotificationPublishingWorkbenchResponse | null;
  loading: boolean;
}): BodySurfaceSectionSpec[] {
  if (!input.data?.canAudit) return [];
  return [
    createLifecycleSection(input.data.lifecycleEvents, input.loading),
    createChannelSection(input.data.channelEndpoints, input.loading),
    createPublicationSection(input.data.publications, input.loading),
  ];
}

function createLifecycleSection(rows: NotificationDefinitionLifecycleEventRow[], loading: boolean) {
  const columns: DataSurfaceColumnSpec<NotificationDefinitionLifecycleEventRow>[] = [
    {
      key: "occurredAt",
      label: "时间",
      cell: (row) => formatNotificationConsoleDate(row.occurredAt),
    },
    {
      key: "definition",
      label: "通知定义",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.definitionLabel, emphasis: "medium" },
          { kind: "text", value: row.definitionKey, font: "mono", tone: "muted" },
        ],
      }),
    },
    {
      key: "action",
      label: "动作",
      cell: (row) => {
        const state = notificationDefinitionLifecycleActionView(row.action);
        return { kind: "badge", label: state.label, tone: state.tone };
      },
    },
    {
      key: "revision",
      label: "修订 / 版本",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: `r${row.revision}`, font: "mono", emphasis: "medium" },
          { kind: "text", value: `v${row.priorVersion} → v${row.newVersion}`, font: "mono", tone: "muted" },
        ],
      }),
    },
    {
      key: "actor",
      label: "操作人",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.actorUsername },
          { kind: "text", value: `用户 #${row.actorUserId}`, tone: "muted" },
        ],
      }),
    },
  ];
  return createSectionSection("notification-definition-lifecycle-ledger", {
    title: "通知定义生命周期台账",
    sections: [createPageDataSection("notification-definition-lifecycle-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      loading,
      emptyText: "暂无定义生命周期记录",
      rowKey: (row) => row.id,
      presentation: { density: "compact" },
    })],
  });
}

function createChannelSection(rows: NotificationChannelEndpointRow[], loading: boolean) {
  const columns: DataSurfaceColumnSpec<NotificationChannelEndpointRow>[] = [
    {
      key: "endpoint",
      label: "渠道",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.label, emphasis: "medium" },
          { kind: "text", value: `${row.channel} · ${row.key}`, font: "mono", tone: "muted" },
        ],
      }),
    },
    {
      key: "health",
      label: "运行状态",
      cell: (row) => {
        const state = notificationChannelHealthView(row);
        return { kind: "badge", label: state.label, tone: state.tone };
      },
    },
    { key: "heartbeat", label: "最近心跳", cell: (row) => formatNotificationConsoleDate(row.lastHeartbeatAt) },
    {
      key: "resultTimes",
      label: "最近结果",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: `成功：${formatNotificationConsoleDate(row.lastSuccessAt)}` },
          { kind: "text", value: `失败：${formatNotificationConsoleDate(row.lastFailureAt)}`, tone: "muted" },
        ],
      }),
    },
    {
      key: "deliveryCounts",
      label: "投递累计",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: `总计 ${row.deliveryCount}`, emphasis: "medium" },
          { kind: "text", value: notificationDeliveryCountLabel(row), tone: "muted" },
        ],
      }),
    },
    {
      key: "error",
      label: "最近错误",
      cell: (row) => row.lastErrorCode || row.lastErrorSummary
        ? ({
            kind: "stack",
            items: [
              ...(row.lastErrorCode ? [{
                kind: "text" as const,
                value: row.lastErrorCode,
                font: "mono" as const,
                tone: "danger" as const,
              }] : []),
              ...(row.lastErrorSummary ? [{
                kind: "text" as const,
                value: row.lastErrorSummary,
                tone: "muted" as const,
              }] : []),
            ],
          })
        : "-",
    },
  ];
  return createSectionSection("notification-channel-health", {
    title: "通知渠道运行状态",
    sections: [createPageDataSection("notification-channel-health-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      loading,
      emptyText: "暂无通知渠道运行记录",
      rowKey: (row) => row.key,
      presentation: { density: "compact" },
    })],
  });
}

function createPublicationSection(rows: NotificationPublicationRow[], loading: boolean) {
  const columns: DataSurfaceColumnSpec<NotificationPublicationRow>[] = [
    { key: "createdAt", label: "时间", cell: (row) => formatNotificationConsoleDate(row.createdAt) },
    {
      key: "definitionKey",
      label: "定义",
      cell: (row) => ({ kind: "text", value: `${row.definitionKey} · r${row.revision}`, font: "mono" }),
    },
    {
      key: "source",
      label: "来源",
      cell: (row) => row.sourceLabel || [row.sourceKind, row.sourceId].filter(Boolean).join(":"),
    },
    {
      key: "delivery",
      label: "投递",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: `投递 ${row.deliveryCount} · 收件人 ${row.recipientCount}`, emphasis: "medium" },
          { kind: "text", value: notificationDeliveryCountLabel(row), tone: "muted" },
        ],
      }),
    },
    {
      key: "status",
      label: "状态",
      cell: (row) => {
        const state = notificationPublicationStatusView(row.status);
        return { kind: "badge", label: state.label, tone: state.tone };
      },
    },
  ];
  return createSectionSection("notification-publication-ledger", {
    title: "最近发布回执",
    sections: [createPageDataSection("notification-publication-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      loading,
      emptyText: "暂无发布记录",
      rowKey: (row) => row.id,
      presentation: { density: "compact" },
    })],
  });
}
