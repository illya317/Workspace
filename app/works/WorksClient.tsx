"use client";

import { useEffect, useState } from "react";
import { PageContent } from "@workspace/core/ui";
import WorkFormSection, { type WorkFormData } from "./WorkFormSection";
import WorksList from "./WorksList";
import WorksHeader from "./WorksHeader";
import DepartmentSwitcher from "@workspace/platform/ui/DepartmentSwitcher";
import { useWorks } from "./useWorks";
import ConfirmModal from "@workspace/core/ui/ConfirmModal";
import Toast from "@workspace/core/ui/Toast";
import type { SessionUser } from "@workspace/platform/types";

export default function WorksClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const {
    works, loading, showForm, setShowForm, editingWork, setEditingWork,
    toast, closeToast, fetchWorks, handleCreate, handleUpdate,
    handleDelete, handleArchive, handleRestore, handleMove,
  } = useWorks();

  const [routineExpanded, setRoutineExpanded] = useState(true);
  const [nonRoutineExpanded, setNonRoutineExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  }>({ show: false, title: "", message: "", onConfirm: null });

  function openConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmModal({ show: true, title, message, onConfirm });
  }
  function closeConfirm() {
    setConfirmModal({ show: false, title: "", message: "", onConfirm: null });
  }

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  const onFormSave = async (data: WorkFormData) => { await handleCreate(data); };
  const onEditSave = async (data: WorkFormData) => { await handleUpdate(data); };

  const isAdmin = user.isWorkListAdmin ?? false;

  const routineWorks = works
    .filter((w) => w.category === "routine" && !w.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const nonRoutineWorks = works
    .filter((w) => w.category === "non-routine" && !w.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedWorks = works
    .filter((w) => w.isArchived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WorksHeader user={user} onDeptChange={fetchWorks} hideShell={hideShell} />
      <PageContent className="py-8">
        {hideShell && <div className="mb-4"><DepartmentSwitcher onChange={fetchWorks} /></div>}
        <WorkFormSection
          isAdmin={isAdmin}
          showForm={showForm}
          editingWork={editingWork}
          onAddClick={() => setShowForm(true)}
          onCancelForm={() => setShowForm(false)}
          onSave={onFormSave}
        />

        <WorksList
          routineWorks={routineWorks}
          nonRoutineWorks={nonRoutineWorks}
          archivedWorks={archivedWorks}
          routineExpanded={routineExpanded}
          nonRoutineExpanded={nonRoutineExpanded}
          archivedExpanded={archivedExpanded}
          onToggleRoutine={() => setRoutineExpanded(!routineExpanded)}
          onToggleNonRoutine={() => setNonRoutineExpanded(!nonRoutineExpanded)}
          onToggleArchived={() => setArchivedExpanded(!archivedExpanded)}
          editingWork={editingWork}
          isAdmin={isAdmin}
          onEdit={setEditingWork}
          onCancelEdit={() => setEditingWork(null)}
          onSaveEdit={onEditSave}
          onDelete={(id) => openConfirm("确认删除", "确定删除该工作项？", () => { handleDelete(id); closeConfirm(); })}
          onMove={handleMove}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      </PageContent>

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={closeToast}
      />

      <ConfirmModal
        open={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => confirmModal.onConfirm?.()}
        onCancel={closeConfirm}
      />
    </div>
  );
}
