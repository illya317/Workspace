"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { createPageBody, createPageTableSection, PageSurface, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useContracts } from "./hooks/useContracts";
import getContractFilterToolbarItems from "./components/ContractFilters";
import { CONTRACT_DEFAULT_VISIBLE_COLUMNS, getContractTableColumns } from "./components/ContractsTable";
import ContractModal, { contractFormFields } from "./components/ContractModal";
import type { Contract, ModalMode } from "@workspace/administration/types";

export default function ContractsClient({
  user: _user,
  hideShell: _hideShell,
  canCreate,
  canUpdate,
  canDelete,
}: {
  user: SessionUser;
  hideShell?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const {
    contracts, total, page, setPage, totalPages,
    q, setQ, setLocationFilter,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    categories, statuses, refresh,
  } = useContracts();

  const feedback = useFeedback();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [saving, setSaving] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(CONTRACT_DEFAULT_VISIBLE_COLUMNS);

  const openCreate = () => {
    if (!canCreate) return;
    setEditing({ location: "北京办公区", status: "执行中" });
    setModalMode("create");
  };

  const openEdit = (c: Contract) => {
    if (!canUpdate) return;
    setEditing({ ...c });
    setModalMode("edit");
  };

  const toolbarColumns = getContractTableColumns();
  const toolbarItems = getContractFilterToolbarItems({
    q,
    onQChange: setQ,
    categoryFilter,
    onCategoryChange: setCategoryFilter,
    statusFilter,
    onStatusChange: setStatusFilter,
    categories,
    statuses,
    columns: toolbarColumns,
    visibleColumns,
    onColumnsChange: setVisibleColumns,
    onReset: () => {
      setQ("");
      setLocationFilter("");
      setCategoryFilter("");
      setStatusFilter("");
      setVisibleColumns(CONTRACT_DEFAULT_VISIBLE_COLUMNS);
    },
  });

  const closeModal = () => {
    setModalMode(null);
    setEditing({});
  };

  const createContract = async () => {
    if (!canCreate) throw new Error("无权限执行该操作");
    if (!editing.name) throw new Error("合同名称为必填");
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
    if (modalMode !== "edit" || !canUpdate) {
      feedback.error("无权限执行该操作");
      return;
    }
    if (!editing.name) {
      feedback.error("合同名称为必填");
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
      closeModal();
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

  return (
    <>
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
        body={createPageBody([
          {
            key: "contract-create",
            chrome: "plain",
            body: {
              kind: "create",
              create: {
                id: "contract-create",
                trigger: "toolbar",
                presentation: "inline",
                title: "新增合同",
                open: modalMode === "create",
                canCreate,
                disabled: saving,
                content: { kind: "form", form: { items: contractFormFields(editing, updateField), layout: { columns: 2 } } },
                submission: { action: "save", disabled: saving || !editing.name, execute: createContract },
                onOpenChange: (open) => { if (open) openCreate(); else closeModal(); },
              },
            },
          },
          createPageTableSection<Contract>("contracts", {


            rows: contracts,
            columns: toolbarColumns,
            visibleColumns,
            rowKey: (contract) => contract.id,
            emptyText: "暂无数据",
            rowActions: canUpdate || canDelete ? (contract) => [
              ...(canUpdate ? [{ key: "edit", label: "编辑", kind: "edit" as const, onClick: () => openEdit(contract) }] : []),
              ...(canDelete ? [{ key: "delete", label: "删除", kind: "delete" as const, onClick: () => void deleteContract(contract) }] : []),
            ] : undefined,
            actionsColumn: { align: "center", },
          }),
        ])}
        footer={{
          pagination: {
            page,
            totalPages,
            onPageChange: setPage,
            compact: true,

          },
        }}
      />

      <ContractModal
        mode={modalMode}
        editing={editing}
        onChange={updateField}
        onSave={saveContract}
        onClose={closeModal}
        saving={saving}
      />

    </>
  );
}
