"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState } from "react";
import { ConfirmModal, Pagination, Toast } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { DatabasePageFrame } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useContracts } from "./hooks/useContracts";
import ContractFilters from "./components/ContractFilters";
import ContractsTable, { CONTRACT_DEFAULT_VISIBLE_COLUMNS, getContractTableColumns } from "./components/ContractsTable";
import ContractModal from "./components/ContractModal";
import type { Contract, ModalMode } from "@workspace/administration/types";

export default function ContractsClient({ user: _user, hideShell: _hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const {
    contracts, total, page, setPage, totalPages,
    q, setQ, setLocationFilter,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    categories, statuses, refresh,
  } = useContracts();

  const { toast, showToast, closeToast } = useToast();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
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

  const closeModal = () => {
    setModalMode(null);
    setEditing({});
  };

  const saveContract = async () => {
    if (!editing.name) {
      showToast("合同名称为必填", "error");
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
        showToast("创建成功", "success");
      } else if (editing.id) {
        const res = await fetch(workspacePath(`/api/modules/administration/contracts/${editing.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("保存失败");
        showToast("保存成功", "success");
      }
      closeModal();
      refresh();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "操作失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(workspacePath(`/api/modules/administration/contracts/${deleteId}`), { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      showToast("删除成功", "success");
      refresh();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setDeleteId(null);
    }
  };

  const updateField = (field: keyof Contract, value: string | number | null) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <DatabasePageFrame
        contentClassName="py-6"
        toolbar={(
          <ContractFilters
          q={q} onQChange={setQ}
          categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter}
          statusFilter={statusFilter} onStatusChange={setStatusFilter}
          categories={categories} statuses={statuses}
          columns={toolbarColumns}
          visibleColumns={visibleColumns}
          onColumnsChange={setVisibleColumns}
          onCreate={openCreate}
          onReset={() => {
            setQ("");
            setLocationFilter("");
            setCategoryFilter("");
            setStatusFilter("");
            setVisibleColumns(CONTRACT_DEFAULT_VISIBLE_COLUMNS);
          }}
          />
        )}
        summary={<p className="text-sm text-slate-500">共 {total} 条记录</p>}
      >

        <ContractsTable
          contracts={contracts}
          visibleColumns={visibleColumns}
          onEdit={openEdit}
          onDelete={setDeleteId}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          compact
          className="mt-4 flex items-center justify-center gap-3"
        />
      </DatabasePageFrame>

      <ContractModal
        mode={modalMode}
        editing={editing}
        onChange={updateField}
        onSave={saveContract}
        onClose={closeModal}
        saving={saving}
      />

      <ConfirmModal
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除这条合同记录吗？此操作不可撤销。"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </>
  );
}
