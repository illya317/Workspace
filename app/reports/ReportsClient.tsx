"use client";

import TargetSwitcher from "@/app/components/TargetSwitcher";
import Toast from "@/app/components/Toast";
import { useToast } from "@workspace/core/hooks";
import ReportEditor from "./ReportEditor";
import { useReports } from "./useReports";

export default function ReportPage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const { toast, showToast, closeToast } = useToast();

  const {
    user,
    initialLoading,
    saving,
    viewingVersion,
    report,
    notes,
    setNotes,
    targetType,
    targetId,
    targetName,
    periodType,
    routineItems,
    nonRoutineItems,
    showRoutineSelect,
    setShowRoutineSelect,
    showNonRoutineSelect,
    setShowNonRoutineSelect,
    workList,
    periodInfo,
    versions,
    selectedYear,
    selectedPeriodIndex,
    yearOptions,
    periodOptions,
    periodTypeName,
    handlePeriodTypeChange,
    handleYearChange,
    handlePeriodIndexChange,
    handleTargetChange,
    handleSubmit,
    loadVersion,
    onUpdateRoutine,
    onRemoveRoutine,
    onMoveRoutine,
    onImportRoutine,
    onUpdateNonRoutine,
    onRemoveNonRoutine,
    onMoveNonRoutine,
    onImportNonRoutine,
  } = useReports(showToast);

  if (initialLoading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4">
          <TargetSwitcher
            value={targetId ? { targetType, targetId, targetName } : null}
            onChange={handleTargetChange}
          />
        </div>
        <ReportEditor
          periodType={periodType}
          onPeriodTypeChange={handlePeriodTypeChange}
          periodTypeName={periodTypeName}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          selectedPeriodIndex={selectedPeriodIndex}
          onPeriodIndexChange={handlePeriodIndexChange}
          yearOptions={yearOptions}
          periodOptions={periodOptions}
          targetName={targetName}
          periodInfo={periodInfo}
          report={report}
          viewingVersion={viewingVersion}
          versions={versions}
          onLoadVersion={loadVersion}
          user={user}
          routineItems={routineItems}
          nonRoutineItems={nonRoutineItems}
          workList={workList}
          showRoutineSelect={showRoutineSelect}
          onShowRoutineSelect={setShowRoutineSelect}
          showNonRoutineSelect={showNonRoutineSelect}
          onShowNonRoutineSelect={setShowNonRoutineSelect}
          onUpdateRoutine={onUpdateRoutine}
          onRemoveRoutine={onRemoveRoutine}
          onMoveRoutine={onMoveRoutine}
          onImportRoutine={onImportRoutine}
          onUpdateNonRoutine={onUpdateNonRoutine}
          onRemoveNonRoutine={onRemoveNonRoutine}
          onMoveNonRoutine={onMoveNonRoutine}
          onImportNonRoutine={onImportNonRoutine}
          notes={notes}
          onNotesChange={setNotes}
          saving={saving}
          onSubmit={handleSubmit}
        />
      </main>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
