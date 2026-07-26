"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { createEmptySection, createFieldsSection, createMasterDetailBody, createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { FormSurfaceSectionSpec, SelectorSurfaceProps } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useContracts } from "./hooks/useContracts";
import getContractFilterToolbarItems from "./components/ContractFilters";
import { contractFormSections } from "./components/contract-form";
import type { Contract, ContractEditorMode } from "@workspace/administration/types";

export default function ContractsClient({
  user: _user,
  hideShell: _hideShell,
  canCreate,
  canUpdate,
  canDelete,
  canExport,
}: {
  user: SessionUser;
  hideShell?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}) {
  const {
    contracts, total, page, setPage, totalPages, pageSize, setPageSize,
    q, setQ, locationFilter, setLocationFilter,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    locations, categories, statuses, refresh,
  } = useContracts();

  const feedback = useFeedback();
  const [editorMode, setEditorMode] = useState<ContractEditorMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const openCreate = () => {
    if (!canCreate) return;
    setEditing({ location: "上海办公区", status: "执行中" });
    setEditorMode("create");
  };

  const openEdit = (c: Contract) => {
    setEditing({ ...c });
    setEditorMode("edit");
  };

  const toolbarItems = getContractFilterToolbarItems({
    q,
    onQChange: setQ,
    categoryFilter,
    onCategoryChange: setCategoryFilter,
    statusFilter,
    onStatusChange: setStatusFilter,
    categories,
    statuses,
    pageSize,
    onPageSizeChange: setPageSize,
    canDownload: canExport,
    downloading,
    onDownload: () => void downloadContracts(),
    onReset: () => {
      setQ("");
      setLocationFilter("");
      setCategoryFilter("");
      setStatusFilter("");
    },
  });

  async function downloadContracts() {
    if (!canExport) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (locationFilter) params.set("location", locationFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/export?${params.toString()}`));
      if (!response.ok) throw new Error("合同下载失败");
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

  const closeEditor = () => {
    setEditorMode(null);
    setEditing({});
  };

  const createContract = async () => {
    if (!canCreate) throw new Error("无权限执行该操作");
    if (!editing.name) throw new Error("合同名称为必填");
    if (!editing.category) throw new Error("合同类型为必填");
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/modules/administration/contracts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error("创建失败");
      refresh();
      return { outcome: "saved" as const, message: "合同已创建" };
    } finally {
      setSaving(false);
    }
  };

  const saveContract = async () => {
    if (editorMode !== "edit" || !canUpdate) {
      feedback.error("无权限执行该操作");
      return;
    }
    if (!editing.name) {
      feedback.error("合同名称为必填");
      return;
    }
    if (!editing.category) {
      feedback.error("合同类型为必填");
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        const res = await fetch(workspacePath(`/api/modules/administration/contracts/${editing.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("保存失败");
        feedback.success("保存成功");
      }
      refresh();
    } catch (e: unknown) {
      feedback.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteContract = async (contract: Pick<Contract, "id" | "version">) => {
    if (!canDelete) {
      feedback.error("无权限删除合同");
      return;
    }
    const ok = await feedback.confirmDelete({
      message: "确定要删除这条合同记录吗？此操作不可撤销。",
    });
    if (!ok) return;
    try {
      const res = await fetch(workspacePath(`/api/modules/administration/contracts/${contract.id}`), {
        method: "DELETE",
        headers: { "If-Match": String(contract.version) },
      });
      if (!res.ok) throw new Error("删除失败");
      feedback.success("删除成功");
      refresh();
    } catch (e: unknown) {
      feedback.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const updateField = (field: keyof Contract, value: string | number | null) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  const selector: SelectorSurfaceProps<Contract> = {
    kind: "list",
    title: "合同台账",
    items: contracts.map((contract) => ({
      key: contract.id,
      value: contract,
      card: {
        title: contract.name,
        subtitle: contract.partyB || "未填写签署对方",
        code: contract.contractNo || undefined,
        status: contract.status ? { label: contract.status } : undefined,
        active: editorMode === "edit" && editing.id === contract.id,
        actions: canDelete ? [{
          key: "delete",
          label: "删除",
          icon: "delete",
          variant: "danger",
          onClick: () => void deleteContract(contract),
        }] : undefined,
      },
    })),
    selectedId: editorMode === "edit" ? editing.id ?? null : null,
    onSelect: openEdit,
    emptyText: "暂无合同",
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
          submission: { action: "save", disabled: saving || !editing.name || !editing.category, execute: createContract },
          onOpenChange: (open) => { if (open) openCreate(); else closeEditor(); },
        },
      },
    },
    ...(editorMode === "create" ? [] : editorMode === "edit"
      ? [createFieldsSection("contract-edit", editSections, {
          header: {
            title: editing.name || "合同详情",
            description: editing.partyB || "未填写签署对方",
          },
          layout: { columns: 1 },
          submit: canUpdate ? { onSubmit: () => void saveContract() } : undefined,
          actions: canUpdate ? [
            { key: "reset", action: "reset", label: "取消编辑", disabled: saving, onClick: closeEditor },
            { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving, onClick: () => void saveContract() },
          ] : [],
        })]
      : [createEmptySection("contract-detail-empty", {
          content: "从左侧选择合同查看详情，或点击新增合同",
          presentation: "card",
        })]),
  ]);

  return (
      <PageSurface kind="standard"
        toolbar={{
          items: [
            ...toolbarItems,
            {
              kind: "text",
              key: "total",
              content: `共 ${total} 条记录`,
            },
          ],
        }}
        body={createMasterDetailBody({
          master: { label: "合同列表", presentation: "compact", body: { kind: "selector", selector } },
          detail: detailBody,
          desktop: { ratio: [3, 7] },
          mobile: { detailActive: editorMode !== null, onNavigateToList: closeEditor },
        })}
        footer={{
          pagination: {
            page,
            totalPages,
            onPageChange: setPage,
            compact: true,

          },
        }}
      />
  );
}
