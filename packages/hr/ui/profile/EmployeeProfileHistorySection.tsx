import {
  ActionButton,
  DataTable,
  DisclosureRecordCard,
  EmptyStateCard,
  type DataTableColumn,
} from "@workspace/core/ui";
import { SectionShell } from "./ProfileFormControls";

export interface ProfileHistoryEntry {
  id: number;
  entityType: string;
  entityId: string;
  version: number;
  editorName: string;
  createdAt: string;
  action?: "create" | "update";
  changes: Array<{ field: string; label: string; from: string; to: string }>;
}

export function HistorySection({
  entries,
  loading,
  expandedId,
  onToggle,
  onRefresh,
  className,
}: {
  entries: ProfileHistoryEntry[];
  loading: boolean;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onRefresh: () => void;
  className?: string;
}) {
  const changeColumns: DataTableColumn<ProfileHistoryEntry["changes"][number]>[] = [
    { key: "field", label: "字段", required: true, render: (change) => <span className="font-medium text-slate-700">{change.label}</span> },
    { key: "from", label: "原值", required: true, render: (change) => <span className="text-slate-500">{change.from}</span> },
    { key: "to", label: "新值", required: true, render: (change) => <span className="text-slate-900">{change.to}</span> },
  ];

  return (
    <SectionShell
      title="历史记录"
      subtitle="记录谁在什么时候修改了哪些字段。"
      actions={<ActionButton onClick={onRefresh} variant="secondary">刷新</ActionButton>}
      className={className}
    >
      <div className="space-y-3">
        {loading ? (
          <EmptyStateCard compact>正在加载历史记录...</EmptyStateCard>
        ) : entries.length === 0 ? (
          <EmptyStateCard compact>暂无变更记录</EmptyStateCard>
        ) : (
          entries.map((entry) => {
            const expanded = expandedId === entry.id;
            const headerTitle = entry.action === "create"
              ? `${entry.editorName} 创建记录`
              : `${entry.editorName} 修改了 ${entry.changes.length} 项`;
            return (
              <DisclosureRecordCard
                key={entry.id}
                expanded={expanded}
                onToggle={() => onToggle(entry.id)}
                header={<div><div className="text-sm font-semibold text-slate-900">{headerTitle}</div><div className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })} · {entry.entityType} #{entry.entityId} · v{entry.version}</div></div>}
                summary={<span className="text-xs text-slate-400">{expanded ? "收起" : "展开"}</span>}
              >
                {entry.action === "create" ? (
                  <EmptyStateCard compact>创建时的初始快照。</EmptyStateCard>
                ) : (
                  <DataTable
                    rows={entry.changes}
                    columns={changeColumns}
                    visibleColumns={["field", "from", "to"]}
                    density="compact"
                    rowKey={(change) => `${entry.id}-${change.field}`}
                  />
                )}
              </DisclosureRecordCard>
            );
          })
        )}
      </div>
    </SectionShell>
  );
}
