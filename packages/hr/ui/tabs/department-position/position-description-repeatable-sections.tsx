"use client";

import {
  ActionButton,
  EmptyStateCard,
  FormField,
  PanelCard,
  TextField,
  useConfirmDelete,
} from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import { formatHistoryVersion, normalizeDateValue, versionNumber } from "./draft-utils";
import { EntityValueInput, StringListEditor, formInputClassName } from "./detail-editor-primitives";

type DetailRecord = Record<string, unknown>;

export function PositionDutyEditor({
  detailKey,
  label,
  records,
  disabled,
  onChange,
}: {
  detailKey: string;
  label: string;
  records: DetailRecord[];
  disabled?: boolean;
  onChange: (records: DetailRecord[]) => void;
}) {
  const confirmDelete = useConfirmDelete();

  function updateDuty(index: number, patch: DetailRecord) {
    onChange(records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
  }

  function addDuty() {
    onChange([...records, { title: "", items: [] }]);
  }

  async function removeDuty(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${label} ${index + 1}」吗？删除后需要保存才会生效。`,
    });
    if (confirmed) onChange(records.filter((_, recordIndex) => recordIndex !== index));
  }

  return (
    <div key={detailKey} className="space-y-3 md:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {!disabled && (
          <ActionButton onClick={addDuty} className="px-2 py-1 text-xs">
            新增
          </ActionButton>
        )}
      </div>
      {records.map((record, index) => {
        const items = Array.isArray(record.items) ? record.items : [];
        return (
          <PanelCard key={index} bodyClassName="p-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500">职责 {index + 1}</span>
              {!disabled && (
                <ActionButton
                  aria-label={`删除${label} ${index + 1}`}
                  onClick={() => void removeDuty(index)}
                  className="!h-auto rounded-full !px-2 !py-0.5 text-[11px] hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-600"
                >
                  移除
                </ActionButton>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <TextField
                value={String(record.title || "")}
                disabled={disabled}
                placeholder="职责标题"
                onChange={(next) => updateDuty(index, { title: next })}
                className={formInputClassName}
              />
              <StringListEditor
                label="职责条目"
                value={items}
                disabled={disabled}
                placeholder="新增职责条目"
                onChange={(nextItems) => updateDuty(index, { items: nextItems })}
              />
            </div>
          </PanelCard>
        );
      })}
      {records.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
    </div>
  );
}

export function PositionChangeHistoryEditor({
  records,
  disabled,
  onChange,
}: {
  records: DetailRecord[];
  disabled?: boolean;
  onChange: (records: DetailRecord[]) => void;
}) {
  const confirmDelete = useConfirmDelete();

  function updateRecord(index: number, patch: DetailRecord) {
    onChange(records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
  }

  function addRecord() {
    const nextVersion = formatHistoryVersion(Math.max(-1, ...records.map((record) => versionNumber(record.version))) + 1);
    onChange([...records, { version: nextVersion, documentName: "", effectiveDate: "", approver: "" }]);
  }

  async function removeRecord(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除变更历史 ${index + 1} 吗？删除后需要保存才会生效。`,
    });
    if (confirmed) onChange(records.filter((_, recordIndex) => recordIndex !== index));
  }

  return (
    <div key="changeHistory" className="space-y-3 md:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">变更历史</span>
        {!disabled && (
          <ActionButton onClick={addRecord} className="px-2 py-1 text-xs">
            新增
          </ActionButton>
        )}
      </div>
      {records.map((record, index) => {
        const rawDate = String(record.effectiveDate || "");
        const dateInvalid = !!rawDate && !normalizeDateValue(rawDate);
        const approverInvalid = String(record.approver || "").includes("见首页");
        return (
          <PanelCard key={index} bodyClassName="grid grid-cols-1 gap-2 p-3 md:grid-cols-[88px_minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]">
            <FormField label="版本">
              <TextField
                value={String(record.version || formatHistoryVersion(index))}
                disabled
                className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
            </FormField>
            <FormField label="文件名">
              <TextField
                value={String(record.documentName || "")}
                disabled={disabled}
                onChange={(next) => updateRecord(index, { documentName: next })}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-sky-100/60"
              />
            </FormField>
            <FormField label="生效日期" error={dateInvalid ? "日期格式错误，请重新选择。" : undefined}>
              <CalendarDateInput
                value={rawDate}
                disabled={disabled}
                onChange={(next) => updateRecord(index, { effectiveDate: next || "" })}
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-100 ${
                  dateInvalid
                    ? "border-red-300 text-red-700 focus:border-red-500 focus:ring-red-500"
                    : "border-sky-200 focus:border-sky-500 focus:ring-sky-500"
                }`}
              />
            </FormField>
            <EntityValueInput
              label="批准"
              entity="employee"
              value={record.approver}
              disabled={disabled}
              invalid={approverInvalid}
              onChange={(next) => updateRecord(index, { approver: next || "" })}
            />
            {!disabled && (
              <ActionButton
                aria-label={`删除变更历史 ${index + 1}`}
                onClick={() => void removeRecord(index)}
                className="!h-auto self-end rounded-full !px-2.5 !py-1 text-[11px] hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-600 md:col-span-4 md:justify-self-end"
              >
                移除
              </ActionButton>
            )}
          </PanelCard>
        );
      })}
      {records.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
    </div>
  );
}
