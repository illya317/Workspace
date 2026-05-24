"use client";

import type { PeriodType } from "@/lib/period";
import { getPeriodTypeName } from "@/lib/period";
import WorkSection, { type ItemRow } from "./WorkSection";

export interface Report {
  id: number;
  date: string;
  taskName: string;
  notes: string | null;
  version: number;
  items: Array<{ id?: number; workItemId?: number | null; category: string; plan: string; completion: string; nextGoal: string; sortOrder: number }>;
  user?: { name: string; departmentName: string | null };
}

interface ReportEditorProps {
  // Period
  periodType: PeriodType;
  onPeriodTypeChange: (pt: PeriodType) => void;
  periodTypeName: string;
  selectedYear: number;
  onYearChange: (year: number) => void;
  selectedPeriodIndex: number;
  onPeriodIndexChange: (index: number) => void;
  yearOptions: number[];
  periodOptions: Array<{ value: number; label: string }>;

  // Display
  targetName: string;
  periodInfo: { label: string; dateRange: string } | null;

  // Report
  report: Report | null;
  viewingVersion: number;
  versions: Array<{ version: number; createdAt: string }>;
  onLoadVersion: (version: number) => void;
  user: { id: number; name: string; departmentId: number } | null;

  // Items
  routineItems: ItemRow[];
  nonRoutineItems: ItemRow[];
  workList: Array<{ id: number; category: string; content: string }>;
  showRoutineSelect: boolean;
  onShowRoutineSelect: (show: boolean) => void;
  showNonRoutineSelect: boolean;
  onShowNonRoutineSelect: (show: boolean) => void;

  // Routine item ops
  onUpdateRoutine: (index: number, field: keyof ItemRow, value: string) => void;
  onRemoveRoutine: (index: number) => void;
  onMoveRoutine: (index: number, direction: number) => void;
  onImportRoutine: (content: string) => void;

  // Non-routine item ops
  onUpdateNonRoutine: (index: number, field: keyof ItemRow, value: string) => void;
  onRemoveNonRoutine: (index: number) => void;
  onMoveNonRoutine: (index: number, direction: number) => void;
  onImportNonRoutine: (content: string) => void;

  // Notes
  notes: string;
  onNotesChange: (notes: string) => void;

  // Submit
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ReportEditor({
  periodType,
  onPeriodTypeChange,
  periodTypeName,
  selectedYear,
  onYearChange,
  selectedPeriodIndex,
  onPeriodIndexChange,
  yearOptions,
  periodOptions,
  targetName,
  periodInfo,
  report,
  viewingVersion,
  versions,
  onLoadVersion,
  user,
  routineItems,
  nonRoutineItems,
  workList,
  showRoutineSelect,
  onShowRoutineSelect,
  showNonRoutineSelect,
  onShowNonRoutineSelect,
  onUpdateRoutine,
  onRemoveRoutine,
  onMoveRoutine,
  onImportRoutine,
  onUpdateNonRoutine,
  onRemoveNonRoutine,
  onMoveNonRoutine,
  onImportNonRoutine,
  notes,
  onNotesChange,
  saving,
  onSubmit,
}: ReportEditorProps) {
  return (
    <>
      {/* Header */}
      <div className="mb-6 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 p-4 text-center text-white">
        {/* Period type switcher */}
        <div className="mb-3 flex items-center justify-center gap-1">
          {(["daily", "weekly", "monthly", "quarterly", "yearly"] as const).map((pt) => (
            <button key={pt} type="button" onClick={() => {
              if (pt === periodType) return;
              onPeriodTypeChange(pt);
            }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${periodType === pt ? "bg-white text-emerald-700" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >{getPeriodTypeName(pt)}</button>
          ))}
        </div>
        <div className="mb-2 flex items-center justify-center gap-3">
          {periodType === "yearly" ? (
            <select value={selectedYear} onChange={(e) => onYearChange(parseInt(e.target.value))}
              className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50">
              {yearOptions.map((y) => <option key={y} value={y} className="text-gray-800">{y} 年</option>)}
            </select>
          ) : (
            <>
              <select value={selectedYear} onChange={(e) => onYearChange(parseInt(e.target.value))}
                className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50">
                {yearOptions.map((y) => <option key={y} value={y} className="text-gray-800">{y} 年</option>)}
              </select>
              <select value={selectedPeriodIndex} onChange={(e) => onPeriodIndexChange(parseInt(e.target.value))}
                className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50">
                {periodOptions.map((p) => <option key={p.value} value={p.value} className="text-gray-800">{p.label}</option>)}
              </select>
            </>
          )}
        </div>
        <h2 className="mb-1 text-lg font-bold">
          {targetName ? `${targetName}${periodInfo?.label || ""}${periodTypeName}` : "工作汇报"}
        </h2>
        <p className="text-sm opacity-90">{periodInfo?.dateRange}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        {/* Version info bar */}
        {report && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span>填写人：{report.user?.name || user?.name}</span>
                {report.version > 1 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">V{report.version}</span>}
              </div>
              {versions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">历史版本：</span>
                  <select value={viewingVersion} onChange={(e) => onLoadVersion(parseInt(e.target.value))}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 focus:border-emerald-400 focus:outline-none">
                    <option value={0}>最新版 (V{report.version})</option>
                    {versions.map((v) => <option key={v.version} value={v.version}>V{v.version} ({new Date(v.createdAt).toLocaleDateString("zh-CN")})</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Work sections */}
        <WorkSection title="日常工作" subtitle="固定工作，自动从工作清单带入" items={routineItems} disabled={viewingVersion !== 0}
          workList={workList} category="routine" showImport={showRoutineSelect} onShowImport={onShowRoutineSelect}
          onImportWork={onImportRoutine}
          onUpdate={onUpdateRoutine} onRemove={onRemoveRoutine}
          onMove={onMoveRoutine} />

        <WorkSection title="其他工作" subtitle="" items={nonRoutineItems} disabled={viewingVersion !== 0}
          workList={workList} category="non-routine" showImport={showNonRoutineSelect} onShowImport={onShowNonRoutineSelect}
          onImportWork={onImportNonRoutine}
          onUpdate={onUpdateNonRoutine} onRemove={onRemoveNonRoutine}
          onMove={onMoveNonRoutine} />

        {/* Notes */}
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
          <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} disabled={viewingVersion !== 0}
            className={`w-full rounded-md border px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none ${viewingVersion !== 0 ? "border-gray-200 bg-gray-100 text-gray-500" : "border-gray-300"}`}
            placeholder="其他补充说明..." />
        </div>

        {viewingVersion !== 0 && (
          <div className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700">当前查看历史版本 V{viewingVersion}，不可编辑</div>
        )}

        {viewingVersion === 0 && (
          <button type="submit" disabled={saving}
            className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-700 py-3 text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {saving ? "保存中..." : report ? "更新报告" : "提交报告"}
          </button>
        )}
      </form>
    </>
  );
}
