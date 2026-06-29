"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { createPageBody, createPageTableBlock, PageSurface, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useContracts } from "./hooks/useContracts";
import getContractFilterToolbarItems from "./components/ContractFilters";
import { CONTRACT_DEFAULT_VISIBLE_COLUMNS, getContractTableColumns } from "./components/ContractsTable";
import ContractModal from "./components/ContractModal";
import type { Contract, ModalMode } from "@workspace/administration/types";

export default function ContractsClient({ user: _user, hideShell: _hideShell }: { user: SessionUser; hideShell?: boolean }) {
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
    setEditing({ location: "北京办公区", status: "执行中" });
    setModalMode("create");
  };

  const openEdit = (c: Contract) => {
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
    onCreate: openCreate,
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

  const saveContract = async () => {
    if (!editing.name) {
      feedback.error("合同名称为必填");
      return;
    }
    setSaving(true);
    try {
      if (modalMode === "create") {
        const res = await fetch(workspacePath("/api/modules/administration/contracts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("创建失败");
        feedback.success("创建成功");
      } else if (editing.id) {
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

  const deleteContract = async (deleteId: number) => {
    const ok = await feedback.confirmDelete({
      message: "确定要删除这条合同记录吗？此操作不可撤销。",
    });
    if (!ok) return;
    try {
      const res = await fetch(workspacePath(`/api/modules/administration/contracts/${deleteId}`), { method: "DELETE" });
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
      <PageSurface
        kind="list"
        toolbar={{
          items: [
            ...toolbarItems,
            {
              kind: "text",
              key: "total",
              section: "meta",
              content: <span className="text-sm text-slate-500">共 {total} 条记录</span>,
            },
          ],
        }}
        body={createPageBody([
          createPageTableBlock<Contract>("contracts", {
            framed: true,


            rows: contracts,
            columns: toolbarColumns,
            visibleColumns,
            rowKey: (contract) => contract.id,
            emptyText: "暂无数据",
            rowActions: (contract) => [
              { key: "edit", label: "编辑", kind: "edit", onClick: () => openEdit(contract) },
              { key: "delete", label: "删除", kind: "delete", onClick: () => void deleteContract(contract.id) },
            ],
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
