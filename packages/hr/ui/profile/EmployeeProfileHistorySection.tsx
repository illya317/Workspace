import {
  createPageBody,
  createPageDataSection,
  PageSurface,
  createRecordSection,
  type DataSurfaceColumnSpec,
  type DataSurfaceRecordProps,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
export interface ProfileHistoryEntry {
  id: number;
  entityType: string;
  entityId: string;
  version: number;
  editorName: string;
  createdAt: string;
  action?: "create" | "update";
  changes: Array<{
    field: string;
    label: string;
    from: string;
    to: string;
  }>;
}

interface HistorySectionProps {
  entries: ProfileHistoryEntry[];
  loading: boolean;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onRefresh: () => void;
  className?: string;
}

type ProfileHistoryChange = ProfileHistoryEntry["changes"][number];

const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

function historyChangeColumns(): DataSurfaceColumnSpec<ProfileHistoryChange>[] {
  return [{
    key: "field",
    label: "字段",
    required: true,
    cell: change => ({ kind: "text", value: change.label, emphasis: "medium", })
  }, {
    key: "from",
    label: "原值",
    required: true,
    cell: change => ({ kind: "text", value: change.from, tone: "muted", })
  }, {
    key: "to",
    label: "新值",
    required: true,
    cell: change => ({ kind: "text", value: change.to,  })
  }];
}

export function historySectionSurface({
  entries,
  loading,
  expandedId,
  onToggle,
  onRefresh,
}: HistorySectionProps): Omit<DataSurfaceRecordProps, "kind"> {
  const changeColumns = historyChangeColumns();
  return {
    actions: [{ key: "refresh", label: "刷新", variant: "secondary", onClick: onRefresh }],
    empty: loading ? "正在加载历史记录..." : "暂无变更记录",
    records: loading ? [] : entries.map(entry => {
      const expanded = expandedId === entry.id;
      const headerTitle = entry.action === "create" ? `${entry.editorName} 创建记录` : `${entry.editorName} 修改了 ${entry.changes.length} 项`;
      return {
        key: String(entry.id),
        expanded,
        onToggle: () => onToggle(entry.id),
        header: {
          kind: "stack" as const,
          gap: "xs" as const,
          items: [
            { kind: "text" as const, value: headerTitle, emphasis: "strong", },
            {
              kind: "text" as const,
              value: `${HISTORY_DATE_FORMATTER.format(new Date(entry.createdAt))} · ${entry.entityType} #${entry.entityId} · v${entry.version}`,
              tone: "muted",
            },
          ],
        },
        summary: { kind: "text" as const, value: expanded ? "收起" : "展开", tone: "muted", },
        detail: entry.action === "create"
          ? { kind: "empty", content: "创建时的初始快照。" }
          : (
            <PageSurface
              kind="standard"
              embedded
              body={createPageBody([
                createPageDataSection(`history-${entry.id}-changes`, {
                  kind: "table",
                  rows: entry.changes,
                  columns: changeColumns,
                  visibleColumns: ["field", "from", "to"],
                  presentation: { density: "compact" },
                  rowKey: (change) => `${entry.id}-${change.field}`,
                }),
              ])}
            />
          ),
      };
    }),
  };
}

export function historySectionBlock(props: HistorySectionProps): BodySurfaceSectionSpec {
  return createRecordSection("history", historySectionSurface(props));
}

export function HistorySection(props: HistorySectionProps) {
  return <PageSurface kind="standard" embedded body={createPageBody([historySectionBlock(props)])} />;
}
