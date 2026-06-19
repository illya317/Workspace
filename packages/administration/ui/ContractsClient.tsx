"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ConfirmModal, Toast } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { UserMenu } from "@workspace/platform/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useContracts } from "./hooks/useContracts";
import ContractFilters from "./components/ContractFilters";
import ContractsTable from "./components/ContractsTable";
import ContractPagination from "./components/ContractPagination";
import ContractModal from "./components/ContractModal";
import type { Contract, ModalMode } from "@workspace/administration/types";

export default function ContractsClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const {
    contracts, total, page, setPage, totalPages,
    q, setQ, locationFilter, setLocationFilter,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    locations, categories, statuses, refresh,
  } = useContracts();

  const { toast, showToast, closeToast } = useToast();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing({ location: "北京办公区", status: "执行中" });
    setModalMode("create");
  };

  const openEdit = (c: Contract) => {
    setEditing({ ...c });
    setModalMode("edit");
  };

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
        const res = await fetch("/workspace/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("创建失败");
        showToast("创建成功", "success");
      } else if (editing.id) {
        const res = await fetch(`/workspace/api/contracts/${editing.id}`, {
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
      const res = await fetch(`/workspace/api/contracts/${deleteId}`, { method: "DELETE" });
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
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/workspace/company/logo.png" alt="公司" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">合同台账</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/administration")} className="text-sm text-gray-500 hover:text-emerald-600">返回</button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        <ContractFilters
          q={q} onQChange={setQ}
          locationFilter={locationFilter} onLocationChange={setLocationFilter}
          categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter}
          statusFilter={statusFilter} onStatusChange={setStatusFilter}
          locations={locations} categories={categories} statuses={statuses}
          onCreate={openCreate}
        />

        <p className="mb-2 text-xs text-gray-500">共 {total} 条记录</p>

        <ContractsTable
          contracts={contracts}
          onEdit={openEdit}
          onDelete={setDeleteId}
        />

        <ContractPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </main>

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
    </div>
  );
}
