"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import NavLink from "@/app/components/NavLink";
import TargetSwitcher from "@/app/components/TargetSwitcher";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import ReportEditor from "./ReportEditor";
import { useReports } from "./useReports";

export default function ReportPage() {
  const router = useRouter();
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
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <TargetSwitcher
              value={targetId ? { targetType, targetId, targetName } : null}
              onChange={handleTargetChange}
            />
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
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
