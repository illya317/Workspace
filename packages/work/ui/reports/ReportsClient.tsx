"use client";

import TargetSwitcher from "@workspace/platform/ui/TargetSwitcher";
import Toast from "@workspace/core/ui/Toast";
import { EmptyStateCard } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { DatabasePageFrame } from "@workspace/core/ui";
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
    return <DatabasePageFrame><EmptyStateCard>加载中...</EmptyStateCard></DatabasePageFrame>;
  }

  return (
    <>
      <DatabasePageFrame
        toolbar={(
          <TargetSwitcher
            value={targetId ? { targetType, targetId, targetName } : null}
            onChange={handleTargetChange}
          />
        )}
      >
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
      </DatabasePageFrame>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </>
  );
}
