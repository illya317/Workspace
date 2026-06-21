"use client";

import type { PeriodType } from "@workspace/core/period";
import { getPeriodTypeName } from "@workspace/core/period";
import { ActionButton, EmptyStateCard, FormField, PanelCard, SectionCard, StatusBadge, TextareaField } from "@workspace/core/ui";
import SelectField from "@workspace/core/ui/SelectField";
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
  onSubmit: () => void;
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
      <PanelCard
        title={targetName ? `${targetName}${periodInfo?.label || ""}${periodTypeName}` : "工作汇报"}
        subtitle={periodInfo?.dateRange}
        bodyClassName="space-y-4 p-4"
      >
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(["daily", "weekly", "monthly", "quarterly", "yearly"] as const).map((pt) => (
            <ActionButton
              key={pt}
              type="button"
              onClick={() => {
                if (pt === periodType) return;
                onPeriodTypeChange(pt);
              }}
              variant={periodType === pt ? "primary" : "secondary"}
              className="px-3 py-1 text-xs"
            >
              {getPeriodTypeName(pt)}
            </ActionButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {periodType === "yearly" ? (
            <FormField label="年度" layout="inline">
              <SelectField
                value={String(selectedYear)}
                onChange={(nextValue) => onYearChange(parseInt(nextValue))}
                options={yearOptions.map((y) => ({ value: String(y), label: `${y} 年` }))}
                selectClassName="min-w-24 px-3 py-1.5 text-sm"
              />
            </FormField>
          ) : (
            <>
              <FormField label="年度" layout="inline">
                <SelectField
                  value={String(selectedYear)}
                  onChange={(nextValue) => onYearChange(parseInt(nextValue))}
                  options={yearOptions.map((y) => ({ value: String(y), label: `${y} 年` }))}
                  selectClassName="min-w-24 px-3 py-1.5 text-sm"
                />
              </FormField>
              <FormField label={periodTypeName} layout="inline">
                <SelectField
                  value={String(selectedPeriodIndex)}
                  onChange={(nextValue) => onPeriodIndexChange(parseInt(nextValue))}
                  options={periodOptions.map((p) => ({ value: String(p.value), label: p.label }))}
                  selectClassName="min-w-24 px-3 py-1.5 text-sm"
                />
              </FormField>
            </>
          )}
        </div>
      </PanelCard>

      <div className="space-y-8">
        {/* Version info bar */}
        {report && (
          <PanelCard bodyClassName="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span>填写人：{report.user?.name || user?.name}</span>
                {report.version > 1 && <StatusBadge label={`V${report.version}`} variant="green" className="rounded-full" />}
              </div>
              {versions.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-500">历史版本：</span>
                  <SelectField
                    value={String(viewingVersion)}
                    onChange={(nextValue) => onLoadVersion(parseInt(nextValue))}
                    options={[
                      { value: "0", label: `最新版 (V${report.version})` },
                      ...versions.map((v) => ({
                        value: String(v.version),
                        label: `V${v.version} (${new Date(v.createdAt).toLocaleDateString("zh-CN")})`,
                      })),
                    ]}
                    selectClassName="min-w-36 px-2 py-1 text-xs"
                  />
                </div>
              )}
            </div>
          </PanelCard>
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
        <SectionCard title="备注">
          <TextareaField
            value={notes}
            onChange={onNotesChange}
            rows={2}
            disabled={viewingVersion !== 0}
            placeholder="其他补充说明..."
            className="text-sm"
          />
        </SectionCard>

        {viewingVersion !== 0 && (
          <EmptyStateCard compact className="border-yellow-100 bg-yellow-50 text-yellow-700">
            当前查看历史版本 V{viewingVersion}，不可编辑
          </EmptyStateCard>
        )}

        {viewingVersion === 0 && (
          <ActionButton onClick={onSubmit} disabled={saving} variant="primary" className="w-full justify-center py-3">
            {saving ? "保存中..." : report ? "更新报告" : "提交报告"}
          </ActionButton>
        )}
      </div>
    </>
  );
}
