"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  createPageTabBar,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import type { FormSurfaceSectionSpec, PageSurfaceTabBarItemSpec, SelectorSurfaceProps } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import {
  CONTRACT_LIFECYCLE_OPTIONS,
  contractOptionLabel,
  type Contract,
  type ContractEditorMode,
  type ContractWorkView,
} from "@workspace/administration/types";
import { useContracts } from "./hooks/useContracts";
import { useContractArchivePackage } from "./hooks/useContractArchivePackage";
import getContractFilterToolbarItems from "./components/ContractFilters";
import { contractFormSections } from "./components/contract-form";

const CONTRACT_LEDGER_TAB: PageSurfaceTabBarItemSpec = {
  key: "contract-ledger",
  label: "合同台账",
  children: [
    { key: "needs_attention", label: "待补全" },
    { key: "expiring", label: "即将到期" },
    { key: "expired", label: "已到期" },
  ],
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || `${fallback} (${response.status})`;
}

export default function ContractsClient({
  user: _user,
  hideShell: _hideShell,
  canCreate,
  canUpdate,
  canDelete,
  canArchive,
  canExport,
}: {
  user: SessionUser;
  hideShell?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canArchive?: boolean;
  canExport?: boolean;
}) {
  const {
    contracts, total, page, setPage, totalPages, pageSize, setPageSize,
    view, setView, q, setQ, locationFilter, setLocationFilter,
    categoryFilter, setCategoryFilter, lifecycleStatusFilter, setLifecycleStatusFilter,
    locations, categories, refresh,
  } = useContracts();
  const feedback = useFeedback();
  const [editorMode, setEditorMode] = useState<ContractEditorMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const updateContractApproval = useCallback((
    version: number,
    approval: {
      sourceKey: string;
      externalRecordId: string;
      externalUrl: string;
      statusSnapshot: string;
      approvedOn: string;
    },
    syncedAt: string | null,
  ) => {
    setEditing((previous) => ({
      ...previous,
      version,
      approvalSourceKey: approval.sourceKey,
      approvalRecordId: approval.externalRecordId,
      approvalRecordUrl: approval.externalUrl.trim() || null,
      approvalStatusSnapshot: approval.statusSnapshot.trim() || null,
      approvedOn: approval.approvedOn,
      approvalSyncedAt: syncedAt,
    }));
  }, []);

  const archivePackage = useContractArchivePackage({
    contractId: editorMode === "edit" ? editing.id ?? null : null,
    contractVersion: editorMode === "edit" ? editing.version ?? null : null,
    lifecycleStatus: editorMode === "edit" ? editing.lifecycleStatus ?? null : null,
    canUpdate: Boolean(canUpdate),
    onContractVersionChange: updateContractApproval,
  });

  const closeEditor = () => {
    setEditorMode(null);
    setEditing({});
  };

  const openCreate = () => {
    if (!canCreate) return;
    setEditing({
      lifecycleStatus: "active",
      signatureStatus: "unknown",
      performanceStatus: "not_started",
      currencyCode: "CNY",
      confidentialityLevel: 2,
    });
    setEditorMode("create");
  };

  const openEdit = (contract: Contract) => {
    setEditing({ ...contract });
    setEditorMode("edit");
  };

  const changeView = (key: string) => {
    closeEditor();
    setView(key as ContractWorkView);
  };

  const toolbarItems = getContractFilterToolbarItems({
    q,
    onQChange: setQ,
    locationFilter,
    onLocationChange: setLocationFilter,
    categoryFilter,
    onCategoryChange: setCategoryFilter,
    lifecycleStatusFilter,
    onLifecycleStatusChange: setLifecycleStatusFilter,
    locations,
    categories,
    pageSize,
    onPageSizeChange: setPageSize,
    canDownload: canExport,
    downloading,
    onDownload: () => void downloadContracts(),
    onReset: () => {
      setQ("");
      setLocationFilter("");
      setCategoryFilter("");
      setLifecycleStatusFilter("");
    },
  });

  async function downloadContracts() {
    if (!canExport) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams({ view });
      if (q) params.set("q", q);
      if (locationFilter) params.set("location", locationFilter);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (lifecycleStatusFilter) params.set("lifecycleStatus", lifecycleStatusFilter);
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/export?${params.toString()}`));
      if (!response.ok) throw new Error(await responseError(response, "合同下载失败"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `合同台账_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "合同下载失败");
    } finally {
      setDownloading(false);
    }
  }

  async function createContract() {
    if (!canCreate) throw new Error("无权限执行该操作");
    if (!editing.name) throw new Error("合同名称为必填");
    if (!editing.categoryId) throw new Error("合同类型为必填");
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/administration/contracts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!response.ok) throw new Error(await responseError(response, "创建失败"));
      await refresh();
      return { outcome: "saved" as const, message: "合同已创建" };
    } finally {
      setSaving(false);
    }
  }

  async function saveContract() {
    if (editorMode !== "edit" || !canUpdate || !editing.id || !editing.version) {
      feedback.error("无权限执行该操作或合同版本无效");
      return;
    }
    if (!editing.name || !editing.categoryId) {
      feedback.error("合同名称和合同类型为必填");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${editing.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": String(editing.version) },
        body: JSON.stringify(editing),
      });
      if (!response.ok) throw new Error(await responseError(response, "保存失败"));
      const body = await response.json().catch(() => null) as { record?: Contract } | null;
      if (body?.record) setEditing(body.record);
      feedback.success("保存成功");
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  async function archiveContract(contract: Pick<Contract, "id" | "version" | "name">) {
    if (!canArchive) {
      feedback.error("无权限归档合同");
      return;
    }
    const confirmed = await feedback.confirm({
      title: "归档合同",
      message: `确定归档“${contract.name}”吗？归档后不再出现在现行合同台账中。`,
      confirmLabel: "归档",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${contract.id}/archive`), {
        method: "POST",
        headers: { "If-Match": String(contract.version) },
      });
      if (!response.ok) throw new Error(await responseError(response, "归档失败"));
      feedback.success("合同已归档");
      closeEditor();
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "归档失败");
    }
  }

  async function deleteContract(contract: Pick<Contract, "id" | "version">) {
    if (!canDelete) {
      feedback.error("无权限删除合同");
      return;
    }
    const confirmed = await feedback.confirmDelete({ message: "确定删除这条草稿合同吗？此操作不可撤销。" });
    if (!confirmed) return;
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${contract.id}`), {
        method: "DELETE",
        headers: { "If-Match": String(contract.version) },
      });
      if (!response.ok) throw new Error(await responseError(response, "删除失败"));
      feedback.success("草稿已删除");
      closeEditor();
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  const updateField = (field: keyof Contract, value: string | number | null) => {
    setEditing((previous) => ({ ...previous, [field]: value }));
  };

  const selector: SelectorSurfaceProps<Contract> = {
    kind: "list",
    title: "合同台账",
    items: contracts.map((contract) => ({
      key: contract.id,
      value: contract,
      card: {
        title: contract.name,
        subtitle: [contract.partyB || "未填写签署对方", contract.expiresOn ? `至 ${contract.expiresOn}` : null].filter(Boolean).join(" · "),
        code: contract.contractNo || contract.contractUid.slice(0, 8),
        status: { label: contractOptionLabel(CONTRACT_LIFECYCLE_OPTIONS, contract.lifecycleStatus) },
        active: editorMode === "edit" && editing.id === contract.id,
        actions: [
          ...(canArchive ? [{
            key: "archive",
            label: "归档",
            icon: "archive" as const,
            onClick: () => void archiveContract(contract),
          }] : []),
          ...(canDelete && contract.canHardDelete ? [{
            key: "delete",
            label: "删除草稿",
            icon: "delete" as const,
            variant: "danger" as const,
            onClick: () => void deleteContract(contract),
          }] : []),
        ],
      },
    })),
    selectedId: editorMode === "edit" ? editing.id ?? null : null,
    onSelect: openEdit,
    emptyText: "当前视图暂无合同",
  };

  const editSections = editorMode === "edit"
    ? contractFormSections(editing, updateField, { locations, categories, readOnly: !canUpdate }).map<FormSurfaceSectionSpec>((section) => ({
        kind: "section",
        key: section.key,
        title: section.title,
        items: section.items,
        layout: section.layout,
        chrome: "divider",
      }))
    : [];

  const detailBody = createPageBody([
    {
      key: "contract-create",
      body: {
        kind: "create",
        create: {
          id: "contract-create",
          trigger: "toolbar",
          presentation: "block",
          title: "新增合同",
          open: editorMode === "create",
          canCreate,
          disabled: saving,
          content: { kind: "sections", sections: contractFormSections(editing, updateField, { locations, categories }) },
          submission: { action: "save", disabled: saving || !editing.name || !editing.categoryId, execute: createContract },
          onOpenChange: (open) => { if (open) openCreate(); else closeEditor(); },
        },
      },
    },
    ...(editorMode === "create" ? [] : editorMode === "edit"
      ? [createFieldsSection("contract-edit", editSections, {
          header: {
            title: editing.name || "合同详情",
            description: editing.dataQualityIssues?.length
              ? `待补全：${editing.dataQualityIssues.join("；")}`
              : editing.partyB || "合同主数据完整",
          },
          layout: { columns: 1 },
          submit: canUpdate ? { onSubmit: () => void saveContract() } : undefined,
          actions: canUpdate ? [
            { key: "reset", action: "reset", label: "取消编辑", disabled: saving, onClick: closeEditor },
            { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving, onClick: () => void saveContract() },
          ] : [],
        }), ...archivePackage.sections]
      : [createEmptySection("contract-detail-empty", {
          content: "从左侧选择合同查看详情，或点击新增合同",
          presentation: "card",
        })]),
  ]);

  return (
    <PageSurface
      kind="standard"
      tabbar={createPageTabBar({
        items: [CONTRACT_LEDGER_TAB],
        active: CONTRACT_LEDGER_TAB.key,
        activeChild: view === "all" ? undefined : view,
        onChange: () => changeView("all"),
        onChildChange: changeView,
        ariaLabel: "合同台账工作视图",
      })}
      toolbar={{
        items: [
          ...toolbarItems,
          { kind: "text", key: "total", content: `共 ${total} 条记录` },
        ],
      }}
      body={createMasterDetailBody({
        master: {
          label: "合同列表",
          presentation: "compact",
          body: { kind: "selector", selector },
          footer: { pagination: { page, totalPages, onPageChange: setPage, compact: true } },
        },
        detail: detailBody,
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: editorMode !== null, onNavigateToList: closeEditor },
      })}
    />
  );
}
