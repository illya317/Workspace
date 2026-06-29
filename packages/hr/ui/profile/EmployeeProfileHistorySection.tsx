import {
  createPageBody,
  PageSurface,
  createPageDataSection,
  type DataSurfaceColumnSpec,
  type DataSurfaceProps,
  type PageSurfaceSectionSpec,
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
}: HistorySectionProps): DataSurfaceProps<ProfileHistoryChange> {
  const changeColumns = historyChangeColumns();
  return {
    kind: "records",
    framed: true,
    title: "历史记录",
    subtitle: "记录谁在什么时候修改了哪些字段。",
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
              value: `${new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })} · ${entry.entityType} #${entry.entityId} · v${entry.version}`,
              tone: "muted",
            },
          ],
        },
        summary: { kind: "text" as const, value: expanded ? "收起" : "展开", tone: "muted", },
        detail: entry.action === "create"
          ? { kind: "empty", content: "创建时的初始快照。" }
          : undefined,
        detailSurface: entry.action === "create"
          ? undefined
          : {
              kind: "table" as const,
              rows: entry.changes,
              columns: changeColumns,
              visibleColumns: ["field", "from", "to"],
              density: "compact" as const,
              rowKey: change => `${entry.id}-${change.field}`,
            },
      };
    }),
  };
}

export function historySectionBlock(props: HistorySectionProps): PageSurfaceSectionSpec {
  return createPageDataSection("history", historySectionSurface(props));
}

export function HistorySection(props: HistorySectionProps) {
  return <PageSurface kind="standard" embedded body={createPageBody([historySectionBlock(props)])} />;
}
