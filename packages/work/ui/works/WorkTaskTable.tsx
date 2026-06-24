"use client";

import {
  DataTable,
  DataTableActionsCell,
  EmptyStateCard,
  StatusBadge,
  TableScrollFrame,
  createDataTableEditActions,
  isDataTableEditDirty,
  type DataTableColumn,
} from "@workspace/core/ui";
import { createWorkDraft, getStatusLabel, getWorkPeriodLabel } from "./model";
import { WorkTaskDetail, WorkTaskForm } from "./WorkTaskFields";
import type { WorkItem, WorkItemDraft } from "./types";

export default function WorkTaskTable({
  works,
  loading,
  canEdit,
  saving,
  detailId,
  editingId,
  editDraft,
  statusFilter,
  periodFilter,
  targetType,
  onDetail,
  onEdit,
  onSave,
  onCancelEdit,
  onEditDraftChange,
  onDelete,
}: {
  works: WorkItem[];
  loading: boolean;
  canEdit: boolean;
  saving: boolean;
  detailId: number | null;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  statusFilter: "active" | "done" | "archived";
  periodFilter: string;
  targetType?: WorkItem["targetType"];
  onDetail: (work: WorkItem) => void;
  onEdit: (work: WorkItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: WorkItemDraft) => void;
  onDelete: (work: WorkItem) => void;
}) {
  const filteredWorks = works.filter((work) => matchesStatusFilter(work, statusFilter) && matchesPeriodFilter(work, periodFilter));
  const routine = sortWorks(filteredWorks.filter((work) => work.category === "routine"));
  const nonRoutine = sortWorks(filteredWorks.filter((work) => work.category === "non-routine"));
  const showOwner = targetType !== "personal";
  const columns = createColumns({ canEdit, saving, editingId, editDraft, showOwner, onEdit, onSave, onCancelEdit, onDelete });

  if (!loading && filteredWorks.length === 0) {
    return <EmptyStateCard compact>暂无工作项。可以从上方新增日常或非日常工作。</EmptyStateCard>;
  }

  return (
    <div className="space-y-6">
      <TaskGroup
        title="日常工作"
        groupType="routine"
        rows={routine}
        loading={loading}
        saving={saving}
        columns={columns}
        detailId={detailId}
        editingId={editingId}
        editDraft={editDraft}
        works={works}
        targetType={targetType}
        onDetail={onDetail}
        onEditDraftChange={onEditDraftChange}
      />
      <TaskGroup
        title="非日常工作"
        groupType="non-routine"
        rows={nonRoutine}
        loading={loading}
        saving={saving}
        columns={columns}
        detailId={detailId}
        editingId={editingId}
        editDraft={editDraft}
        works={works}
        targetType={targetType}
        onDetail={onDetail}
        onEditDraftChange={onEditDraftChange}
      />
    </div>
  );
}

function TaskGroup({
  title,
  groupType,
  rows,
  loading,
  saving,
  columns,
  detailId,
  editingId,
  editDraft,
  works,
  targetType,
  onDetail,
  onEditDraftChange,
}: {
  title: string;
  groupType: WorkItem["category"];
  rows: WorkItem[];
  loading: boolean;
  saving: boolean;
  columns: DataTableColumn<WorkItem>[];
  detailId: number | null;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  works: WorkItem[];
  targetType?: WorkItem["targetType"];
  onDetail: (work: WorkItem) => void;
  onEditDraftChange: (draft: WorkItemDraft) => void;
}) {
  const visibleColumns = getGroupVisibleColumns(groupType, targetType !== "personal");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{rows.length}</span>
      </div>
      <TableScrollFrame className="overflow-y-hidden rounded-lg border border-slate-200">
        <DataTable
          rows={rows}
          columns={columns}
          visibleColumns={visibleColumns}
          density="compact"
          loading={loading}
          emptyText={`暂无${title}`}
          rowKey={(work) => work.id}
          onRowClick={onDetail}
          expandedRowKey={detailId}
          renderExpandedRow={(work) => editDraft && editingId === work.id ? (
            <WorkTaskForm
              draft={editDraft}
              works={works}
              disabled={saving}
              excludedWorkId={work.id}
              targetType={targetType}
              onChange={onEditDraftChange}
            />
          ) : <WorkTaskDetail work={work} />}
        />
      </TableScrollFrame>
    </div>
  );
}

function createColumns({
  canEdit,
  saving,
  editingId,
  editDraft,
  showOwner,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
}: {
  canEdit: boolean;
  saving: boolean;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  showOwner: boolean;
  onEdit: (work: WorkItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: (work: WorkItem) => void;
}): DataTableColumn<WorkItem>[] {
  const columns: DataTableColumn<WorkItem>[] = [
    {
      key: "content",
      label: "工作内容",
      required: true,
      headerClassName: "w-64",
      cellClassName: "w-64 max-w-80",
      render: (work) => (
        <div className="flex min-w-0 flex-col gap-1">
          {work.parentWorkItemContent && <span className="max-w-full truncate text-xs text-slate-400" title={`上级：${work.parentWorkItemContent}`}>上级：{work.parentWorkItemContent}</span>}
          <span className="min-w-0 max-w-[14rem] truncate text-sm font-medium text-slate-900" title={work.content}>{work.content}</span>
        </div>
      ),
    },
    {
      key: "owner",
      label: "负责人",
      defaultVisible: showOwner,
      headerClassName: "w-32",
      cellClassName: "w-32",
      render: (work) => work.ownerEmployeeName || "未设置",
    },
    {
      key: "period",
      label: "周期",
      defaultVisible: true,
      headerClassName: "w-48",
      cellClassName: "w-48",
      render: (work) => <span className="text-sm text-slate-600">{getWorkPeriodLabel(work)}</span>,
    },
    {
      key: "priority",
      label: "优先级",
      defaultVisible: true,
      headerClassName: "w-40",
      cellClassName: "w-40",
      render: (work) => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">重要 {work.importance}</span>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-600">紧急 {work.urgency}</span>
        </div>
      ),
    },
    {
      key: "status",
      label: "状态",
      defaultVisible: true,
      headerClassName: "w-28",
      cellClassName: "w-28",
      render: (work) => {
        const status = work.category === "routine" ? null : (work.isArchived ? "archived" : work.status);
        if (!status) return <span className="text-sm text-slate-400">无</span>;
        return <StatusBadge label={getStatusLabel(status)} variant={statusVariant(status)} />;
      },
    },
    {
      key: "dates",
      label: "起止时间",
      defaultVisible: true,
      headerClassName: "w-44",
      cellClassName: "w-44",
      render: (work) => dateRange(work.startDate, work.dueDate),
    },
    {
      key: "links",
      label: "关联",
      defaultVisible: true,
      headerClassName: "min-w-56",
      cellClassName: "min-w-56 max-w-80",
      render: (work) => {
        const label = work.linkedProjectName || work.linkedProjectTaskName
          ? [work.linkedProjectName, work.linkedProjectTaskName].filter(Boolean).join(" / ")
          : "无";
        return <span className="block max-w-full truncate" title={label}>{label}</span>;
      },
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      headerClassName: "w-36",
      cellClassName: "w-36",
      render: (work) => {
        const editing = editingId === work.id;
        const canSave = Boolean(editDraft?.content.trim());
        const dirty = isDataTableEditDirty(createWorkDraft(work), editDraft);
        return (
          <DataTableActionsCell
            actions={[
              ...createDataTableEditActions({
                row: work,
                editing,
                canEdit,
                canSave,
                dirty,
                saving,
                editLabel: "编辑工作项",
                saveLabel: "保存工作项",
                cancelLabel: "取消编辑",
                onEdit,
                onSave,
                onCancel: onCancelEdit,
              }),
              ...(canEdit && !editing ? [{
                key: "delete",
                kind: "delete",
                label: "删除工作项",
                onClick: () => onDelete(work),
                disabled: saving,
              } as const] : []),
            ]}
          />
        );
      },
    },
  ];
  return columns;
}

function getGroupVisibleColumns(groupType: WorkItem["category"], showOwner: boolean) {
  void groupType;
  return [showOwner ? "owner" : "", "period", "priority"].filter(Boolean);
}

function sortWorks(rows: WorkItem[]) {
  return [...rows].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

function matchesStatusFilter(work: WorkItem, filter: "active" | "done" | "archived") {
  const archived = work.isArchived || work.status === "archived";
  if (filter === "archived") return archived;
  if (filter === "done") return !archived && work.status === "done";
  return !archived && work.status !== "done";
}

function matchesPeriodFilter(work: WorkItem, filter: string) {
  if (filter === "all") return true;
  if (filter === "long-term") return !work.periodType;
  return work.periodType === filter;
}

function statusVariant(status: string) {
  if (status === "done") return "blue";
  if (status === "archived") return "orange";
  return "green";
}

function dateRange(startDate: string | null, dueDate: string | null) {
  if (!startDate && !dueDate) return "未设置";
  if (startDate && dueDate) return `${startDate} - ${dueDate}`;
  return startDate || dueDate;
}
