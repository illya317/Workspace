import { DataSurface, type DataSurfaceColumnSpec } from "@workspace/core/ui";
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
export function HistorySection({
  entries,
  loading,
  expandedId,
  onToggle,
  onRefresh,
  className
}: {
  entries: ProfileHistoryEntry[];
  loading: boolean;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onRefresh: () => void;
  className?: string;
}) {
  const changeColumns: DataSurfaceColumnSpec<ProfileHistoryEntry["changes"][number]>[] = [{
    key: "field",
    label: "字段",
    required: true,
    cell: change => ({ kind: "text", value: change.label, className: "font-medium text-slate-700" })
  }, {
    key: "from",
    label: "原值",
    required: true,
    cell: change => ({ kind: "text", value: change.from, className: "text-slate-500" })
  }, {
    key: "to",
    label: "新值",
    required: true,
    cell: change => ({ kind: "text", value: change.to, className: "text-slate-900" })
  }];
  return <DataSurface
    kind="records"
    framed
    title="历史记录"
    subtitle="记录谁在什么时候修改了哪些字段。"
    className={className}
    actions={[{ key: "refresh", label: "刷新", variant: "secondary", onClick: onRefresh }]}
    empty={loading ? "正在加载历史记录..." : "暂无变更记录"}
    records={loading ? [] : entries.map(entry => {
      const expanded = expandedId === entry.id;
      const headerTitle = entry.action === "create" ? `${entry.editorName} 创建记录` : `${entry.editorName} 修改了 ${entry.changes.length} 项`;
      return {
        key: String(entry.id),
        expanded,
        onToggle: () => onToggle(entry.id),
        header: <div><div className="text-sm font-semibold text-slate-900">{headerTitle}</div><div className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("zh-CN", {
          hour12: false
        })} · {entry.entityType} #{entry.entityId} · v{entry.version}</div></div>,
        summary: <span className="text-xs text-slate-400">{expanded ? "收起" : "展开"}</span>,
        detail: entry.action === "create"
          ? { kind: "empty", content: "创建时的初始快照。" }
          : <DataSurface kind="table" rows={entry.changes} columns={changeColumns} visibleColumns={["field", "from", "to"]} density="compact" rowKey={change => `${entry.id}-${change.field}`} />,
      };
    })}
  />;
}
