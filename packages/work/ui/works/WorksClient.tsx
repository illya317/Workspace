"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabasePageFrame, EmptyStateCard, PanelCard, SectionCard, TabBar, Toolbar, useFeedback, type ToolbarItem } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type { SessionUser } from "@workspace/platform/types";
import { listTaskSpaces } from "./api";
import { createEmptyWorkDraft, getPeriodTypeLabel, getWorkSpacePath, getWorkTargetFromPath, WORK_ITEM_TYPE_OPTIONS, WORK_SOURCE_TYPE_OPTIONS } from "./model";
import { useWorks } from "./useWorks";
import { SpaceHeader } from "./WorkSpaceHeaderControls";
import WorkPermissionsPanel from "./WorkPermissionsPanel";
import WorkReportsPanel, { useWorkReportsController } from "./WorkReportsPanel";
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
  const feedback = useFeedback();
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
  const showReportToast = useCallback(
    (toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type),
    [showToast],
  );
  const reportsState = useWorkReportsController({
    target: currentSpace,
    canEdit,
    onToast: showReportToast,
  });

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
    const ok = await feedback.confirmDelete({
      title: "删除工作项",
      message: `确定删除「${work.content}」吗？`,
      confirmLabel: "删除工作项",
    });
    if (!ok) return;
    await worksState.handleDelete(work);
    await loadSpaces();
  }

  const tabs = canManage
    ? [{ key: "tasks", label: "任务列表" }, { key: "reports", label: "工作汇报" }, { key: "permissions", label: "权限设置" }]
    : [{ key: "tasks", label: "任务列表" }, { key: "reports", label: "工作汇报" }];
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
              <TabBar
                ariaLabel="工作计划主标签"
                variant="small"
                tabs={tabs}
                active={activeTab}
                onChange={setActiveTab}
              />
              <Toolbar
                items={[
                  {
                    kind: "panel-toggle",
                    key: "mobile-side-toggle",
                    icon: "panel-open",
                    label: "显示工作空间",
                    className: "!h-9 !w-10 !px-0 xl:hidden",
                    onClick: () => setDrawerOpen(true),
                  },
                  {
                    kind: "panel-toggle",
                    key: "desktop-side-toggle",
                    icon: sideOpen ? "panel-open" : "panel-close",
                    label: `${sideOpen ? "隐藏" : "显示"}工作空间`,
                    variant: sideOpen ? "primary" : "secondary",
                    className: "!h-9 !w-10 !px-0 hidden xl:inline-flex",
                    onClick: () => setSideOpen(!sideOpen),
                  },
                  ...(activeTab === "tasks"
                    ? [
                        {
                          kind: "option-group" as const,
                          key: "status",
                          section: "filter" as const,
                          value: statusFilter,
                          options: [
                            { value: "active", label: "进行中" },
                            { value: "done", label: "已完成" },
                            { value: "archived", label: "已归档" },
                          ],
                          onChange: (value: string) => setStatusFilter(value as typeof statusFilter),
                          ariaLabel: "任务状态",
                        },
                        {
                          kind: "option-group" as const,
                          key: "period",
                          section: "filter" as const,
                          value: periodFilter,
                          options: [
                            { value: "all", label: "全部周期" },
                            { value: "long-term", label: "长期" },
                            { value: "daily", label: getPeriodTypeLabel("daily") },
                            { value: "weekly", label: getPeriodTypeLabel("weekly") },
                            { value: "monthly", label: getPeriodTypeLabel("monthly") },
                            { value: "quarterly", label: getPeriodTypeLabel("quarterly") },
                            { value: "yearly", label: getPeriodTypeLabel("yearly") },
                          ],
                          onChange: setPeriodFilter,
                          ariaLabel: "计划周期",
                        },
                        {
                          kind: "option-group" as const,
                          key: "type",
                          section: "filter" as const,
                          value: itemTypeFilter,
                          options: [
                            { value: "all", label: "全部类型" },
                            ...WORK_ITEM_TYPE_OPTIONS,
                          ],
                          onChange: setItemTypeFilter,
                          ariaLabel: "节点类型",
                        },
                        {
                          kind: "option-group" as const,
                          key: "source",
                          section: "filter" as const,
                          value: sourceFilter,
                          options: [
                            { value: "all", label: "全部来源" },
                            ...WORK_SOURCE_TYPE_OPTIONS,
                          ],
                          onChange: setSourceFilter,
                          ariaLabel: "来源类型",
                        },
                      ]
                    : []),
                  ...(activeTab === "reports" ? reportsState.toolbarItems : []),
                  ...(activeTab === "tasks" && canEdit
                    ? [
                        {
                          kind: "create" as const,
                          key: "create",
                          label: "新增工作项",
                          active: worksState.creating,
                          disabled: worksState.saving || editing,
                          onClick: () => {
                            worksState.setCreating(true);
                            worksState.setCreateDraft(createEmptyWorkDraft(nextSortOrder(worksState.works)));
                          },
                        },
                        ...(worksState.creating
                          ? [
                              {
                                kind: "action-group" as const,
                                key: "create-actions",
                                section: "edit" as const,
                                actions: [
                                  {
                                    key: "cancel",
                                    kind: "cancel" as const,
                                    label: "取消新增",
                                    onClick: () => worksState.setCreating(false),
                                  },
                                  {
                                    key: "save",
                                    kind: "check" as const,
                                    label: "保存工作项",
                                    variant: "primary" as const,
                                    disabled: worksState.saving || !worksState.createDraft.content.trim(),
                                    onClick: () => void worksState.handleCreate().then(loadSpaces),
                                  },
                                ],
                              },
                            ]
                          : []),
                      ]
                    : []),
                ] satisfies ToolbarItem[]}
              />
              {activeTab === "permissions" ? (
                <WorkPermissionsPanel
                  target={currentSpace} canManage={canManage} onToast={(toast) => worksState.showToast(toast.message, toast.type)}
                />
              ) : activeTab === "reports" ? (
                <SectionCard title="工作汇报">
                  <WorkReportsPanel controller={reportsState} />
                </SectionCard>
              ) : (
                <SectionCard title="工作项">
                  {worksState.creating && (
                    <PanelCard className="mb-4" bodyClassName="p-3">
                      <WorkTaskForm
                        draft={worksState.createDraft}
                        works={worksState.works}
                        disabled={worksState.saving}
                        excludedWorkId={null}
                        targetType={currentSpace.targetType}
                        onChange={worksState.setCreateDraft}
                      />
                    </PanelCard>
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
    </DatabasePageFrame>
  );
}

function roleAllows(role: string | null | undefined, required: "viewer" | "editor" | "manager") {
  const levels = { viewer: 0, editor: 1, delete: 2, manager: 3 };
  return role ? levels[role as keyof typeof levels] >= levels[required] : false;
}

function sameTarget(a: WorkTarget | null | undefined, b: WorkTarget | null | undefined) {
  return Boolean(a && b && a.targetType === b.targetType && a.targetId === b.targetId);
}

function normalizeInitialTarget(target?: WorkTarget) {
  if (!target || !Number.isFinite(target.targetId) || target.targetId <= 0) return null;
  return target;
}

function nextSortOrder(works: WorkItem[]) {
  if (works.length === 0) return 10;
  return Math.max(...works.map((work) => work.sortOrder || 0)) + 10;
}
