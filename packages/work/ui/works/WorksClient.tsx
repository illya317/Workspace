"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandToolbar, CreateConfirmActions, CreateStartButton, DatabasePageFrame, EmptyStateCard, SelectField, SectionCard, SplitWorkspaceToolbar, Toast, ToolbarOptionGroup, useConfirmDelete } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type { SessionUser } from "@workspace/platform/types";
import { listTaskSpaces } from "./api";
import { createEmptyWorkDraft, getPeriodTypeLabel, getWorkSpaceLabel, getWorkSpacePath, getWorkTargetFromPath, WORK_ITEM_TYPE_OPTIONS, WORK_SOURCE_TYPE_OPTIONS } from "./model";
import { useWorks } from "./useWorks";
import WorkPermissionsPanel from "./WorkPermissionsPanel";
import WorkReportsPanel from "./WorkReportsPanel";
import WorkSpaceSidebar from "./WorkSpaceSidebar";
import WorkTaskTable from "./WorkTaskTable";
import { WorkTaskForm } from "./WorkTaskFields";
import type { WorkItem, WorkItemType, WorkSourceType, WorkTarget, WorkTaskSpace } from "./types";

export default function WorksClient({
  initialTarget,
}: {
  user: SessionUser;
  hideShell?: boolean;
  initialTarget?: WorkTarget;
}) {
  const confirmDelete = useConfirmDelete();
  const [spaces, setSpaces] = useState<WorkTaskSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<WorkTarget | null>(null);
  const [activeTab, setActiveTab] = useState("tasks");
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "archived">("active");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentSpace = useMemo(
    () => spaces.find((space) => sameTarget(space, activeTarget)) || null,
    [activeTarget, spaces],
  );
  const canEdit = roleAllows(currentSpace?.role, "editor");
  const canManage = roleAllows(currentSpace?.role, "manager");
  const worksState = useWorks(currentSpace);
  const showToast = worksState.showToast;

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const nextSpaces = await listTaskSpaces();
      setSpaces(nextSpaces);
      const requested = normalizeInitialTarget(initialTarget);
      const match = requested ? nextSpaces.find((space) => sameTarget(space, requested)) : null;
      const personal = nextSpaces.find((space) => space.targetType === "personal");
      const fallback = match || personal || nextSpaces[0] || null;
      setActiveTarget((current) => current && nextSpaces.some((space) => sameTarget(space, current)) ? current : fallback);
      if (!match && fallback && requested) {
        window.history.replaceState(null, "", workspacePath(getWorkSpacePath(fallback.targetType, fallback.targetId)));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载工作空间失败", "error");
    } finally {
      setSpacesLoading(false);
    }
  }, [initialTarget, showToast]);

  useEffect(() => { void loadSpaces(); }, [loadSpaces]);

  useEffect(() => {
    if (spaces.length === 0) return;
    function handlePopState() {
      const target = getWorkTargetFromPath(window.location.pathname, spaces);
      if (target) setActiveTarget({ targetType: target.targetType, targetId: target.targetId });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [spaces]);

  useEffect(() => {
    if (activeTab === "permissions" && !canManage) setActiveTab("tasks");
  }, [activeTab, canManage]);

  function selectSpace(space: WorkTaskSpace) {
    setActiveTarget({ targetType: space.targetType, targetId: space.targetId });
    setActiveTab("tasks");
    setStatusFilter("active");
    setPeriodFilter("all");
    setItemTypeFilter("all");
    setSourceFilter("all");
    setDrawerOpen(false);
    window.history.pushState(null, "", workspacePath(getWorkSpacePath(space.targetType, space.targetId)));
  }

  async function deleteWork(work: WorkItem) {
    const ok = await confirmDelete({
      title: "删除工作项",
      message: `确定删除「${work.content}」吗？`,
      confirmLabel: "删除工作项",
    });
    if (!ok) return;
    await worksState.handleDelete(work);
    await loadSpaces();
  }

  const tabs = canManage
    ? [{ value: "tasks", label: "任务列表" }, { value: "reports", label: "工作汇报" }, { value: "permissions", label: "权限设置" }]
    : [{ value: "tasks", label: "任务列表" }, { value: "reports", label: "工作汇报" }];
  const editing = worksState.editingId !== null;

  return (
    <DatabasePageFrame>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button type="button" aria-label="关闭工作空间" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/25" />
          <div className="absolute inset-y-0 left-0 w-[min(380px,calc(100vw-32px))] bg-white p-3 shadow-2xl">
            <WorkSpaceSidebar spaces={spaces} active={activeTarget} loading={spacesLoading} onSelect={selectSpace} />
          </div>
        </div>
      )}
      <div className={`grid gap-5 ${sideOpen ? "xl:grid-cols-[18rem_minmax(0,1fr)]" : ""}`}>
        {sideOpen && (
        <div className="hidden xl:block">
          <WorkSpaceSidebar spaces={spaces} active={activeTarget} loading={spacesLoading} onSelect={selectSpace} />
        </div>
        )}
        <main className="min-w-0 space-y-4">
          {currentSpace ? (
            <>
              <SpaceHeader space={currentSpace} />
              <CommandToolbar
                viewControls={(
                  <SplitWorkspaceToolbar
                    sideOpen={sideOpen}
                    sideLabel="工作空间"
                    onSideOpenChange={setSideOpen}
                    onDrawerOpen={() => setDrawerOpen(true)}
                    desktopBreakpoint="xl"
                  />
                )}
                filters={(
                  <>
                    <MobileSpaceSwitcher
                      spaces={spaces} active={activeTarget} loading={spacesLoading} onSelect={selectSpace}
                    />
                    <ToolbarOptionGroup
                      ariaLabel="工作计划主标签"
                      value={activeTab}
                      options={tabs}
                      onChange={(value) => setActiveTab(value)}
                    />
                    {activeTab === "tasks" && (
                      <>
                        <ToolbarOptionGroup
                          ariaLabel="任务状态"
                          value={statusFilter}
                          options={[
                            { value: "active", label: "进行中" },
                            { value: "done", label: "已完成" },
                            { value: "archived", label: "已归档" },
                          ]}
                          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                        />
                        <ToolbarOptionGroup
                          ariaLabel="计划周期"
                          value={periodFilter}
                          options={[
                            { value: "all", label: "全部周期" },
                            { value: "long-term", label: "长期" },
                            { value: "daily", label: getPeriodTypeLabel("daily") },
                            { value: "weekly", label: getPeriodTypeLabel("weekly") },
                            { value: "monthly", label: getPeriodTypeLabel("monthly") },
                            { value: "quarterly", label: getPeriodTypeLabel("quarterly") },
                            { value: "yearly", label: getPeriodTypeLabel("yearly") },
                          ]}
                          onChange={setPeriodFilter}
                        />
                        <ToolbarOptionGroup
                          ariaLabel="节点类型"
                          value={itemTypeFilter}
                          options={[
                            { value: "all", label: "全部类型" },
                            ...WORK_ITEM_TYPE_OPTIONS,
                          ]}
                          onChange={setItemTypeFilter}
                        />
                        <ToolbarOptionGroup
                          ariaLabel="来源类型"
                          value={sourceFilter}
                          options={[
                            { value: "all", label: "全部来源" },
                            ...WORK_SOURCE_TYPE_OPTIONS,
                          ]}
                          onChange={setSourceFilter}
                        />
                      </>
                    )}
                  </>
                )}
                selectionActions={activeTab === "tasks" && canEdit ? (
                  <>
                    <CreateStartButton
                      label="新增工作项"
                      active={worksState.creating}
                      disabled={worksState.saving || editing}
                      onClick={() => {
                        worksState.setCreating(true);
                        worksState.setCreateDraft(createEmptyWorkDraft(nextSortOrder(worksState.works)));
                      }}
                    />
                    {worksState.creating && (
                      <CreateConfirmActions
                        order="cancel-first"
                        submitLabel="保存工作项"
                        cancelLabel="取消新增"
                        submitting={worksState.saving}
                        submitDisabled={worksState.saving || !worksState.createDraft.content.trim()}
                        onCancel={() => worksState.setCreating(false)}
                        onSubmit={() => void worksState.handleCreate().then(loadSpaces)}
                      />
                    )}
                  </>
                ) : null}
              />
              {activeTab === "permissions" ? (
                <WorkPermissionsPanel
                  target={currentSpace} canManage={canManage} onToast={(toast) => worksState.showToast(toast.message, toast.type)}
                />
              ) : activeTab === "reports" ? (
                <SectionCard title="工作汇报">
                  <WorkReportsPanel
                    target={currentSpace} canEdit={canEdit} onToast={(toast) => worksState.showToast(toast.message, toast.type)}
                  />
                </SectionCard>
              ) : (
                <SectionCard title="工作项">
                  {worksState.creating && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
                    <WorkTaskForm
                      draft={worksState.createDraft}
                      works={worksState.works}
                      disabled={worksState.saving}
                      excludedWorkId={null}
                      targetType={currentSpace.targetType}
                      onChange={worksState.setCreateDraft}
                    />
                    </div>
                  )}
                  <WorkTaskTable
                    works={worksState.works}
                    loading={worksState.loading}
                    canEdit={canEdit}
                    saving={worksState.saving}
                    detailId={worksState.detailId}
                    editingId={worksState.editingId}
                    editDraft={worksState.editDraft}
                    statusFilter={statusFilter}
                    periodFilter={periodFilter}
                    itemTypeFilter={itemTypeFilter as "all" | WorkItemType}
                    sourceFilter={sourceFilter as "all" | WorkSourceType}
                    targetType={currentSpace.targetType}
                    onEditDraftChange={worksState.setEditDraft}
                    onDetail={(work) => {
                      if (worksState.editingId === work.id) return;
                      worksState.setDetailId(worksState.detailId === work.id ? null : work.id);
                    }}
                    onEdit={worksState.startEdit}
                    onSave={() => void worksState.handleUpdate().then(loadSpaces)}
                    onCancelEdit={worksState.cancelEdit}
                    onDelete={(work) => void deleteWork(work)}
                  />
                </SectionCard>
              )}
            </>
          ) : (
            <EmptyStateCard>
              {spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间"}
            </EmptyStateCard>
          )}
        </main>
      </div>
      <Toast message={worksState.toast?.message || ""} type={worksState.toast?.type} show={!!worksState.toast} onClose={worksState.closeToast} />
    </DatabasePageFrame>
  );
}

function MobileSpaceSwitcher({
  spaces,
  active,
  loading,
  onSelect,
}: {
  spaces: WorkTaskSpace[];
  active: WorkTarget | null;
  loading: boolean;
  onSelect: (space: WorkTaskSpace) => void;
}) {
  const value = active ? targetKey(active) : "";
  return (
    <div className="xl:hidden">
      <SelectField
        label="工作空间"
        value={value}
        options={spaces.map((space) => ({
          value: targetKey(space),
          label: `${getWorkSpaceLabel(space.targetType)} · ${space.name}`,
        }))}
        disabled={loading || spaces.length === 0}
        placeholder={loading ? "加载中" : "选择空间"}
        searchable
        size="toolbar"
        selectClassName="min-w-[14rem] max-w-[calc(100vw-8rem)]"
        onChange={(nextValue) => {
          const space = spaces.find((item) => targetKey(item) === nextValue);
          if (space) onSelect(space);
        }}
      />
    </div>
  );
}

function SpaceHeader({ space }: { space: WorkTaskSpace }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-emerald-600">{getWorkSpaceLabel(space.targetType)}工作计划</div>
          <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">{space.name}</h2>
          {space.subtitle && <p className="mt-1 text-sm text-slate-500">{space.subtitle}</p>}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Metric label="目标" value={space.counts.objective} />
          <Metric label="结果" value={space.counts.keyResult} />
          <Metric label="任务" value={space.counts.task} />
          <Metric label="归档" value={space.counts.archived} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function roleAllows(role: string | null | undefined, required: "viewer" | "editor" | "manager") {
  const levels = { viewer: 0, editor: 1, delete: 2, manager: 3 };
  return role ? levels[role as keyof typeof levels] >= levels[required] : false;
}

function sameTarget(a: WorkTarget | null | undefined, b: WorkTarget | null | undefined) {
  return Boolean(a && b && a.targetType === b.targetType && a.targetId === b.targetId);
}

function targetKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function normalizeInitialTarget(target?: WorkTarget) {
  if (!target || !Number.isFinite(target.targetId) || target.targetId <= 0) return null;
  return target;
}

function nextSortOrder(works: WorkItem[]) {
  if (works.length === 0) return 10;
  return Math.max(...works.map((work) => work.sortOrder || 0)) + 10;
}
