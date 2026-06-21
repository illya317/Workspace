"use client";

import {
  ActionButton,
  EmptyStateCard,
  FormField,
  PanelCard,
  TextareaField,
  TextField,
  useConfirmDelete,
} from "@workspace/core/ui";
import { detailFieldRows, detailValueToText, isPrimitiveArray, parseDetailsObject, textToDetailValue } from "./description-details";
import { StringListEditor } from "./detail-editor-primitives";

export function DepartmentDescriptionDetailsEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const confirmDelete = useConfirmDelete();
  const details = parseDetailsObject(value);
  if (!details) {
    return (
      <FormField
        label="部门说明书 JSON 格式错误"
        error="请检查 JSON 内容后重新保存。"
        className="md:col-span-2"
      >
        <TextareaField
          value={value}
          disabled={disabled}
          rows={12}
          onChange={onChange}
          className="resize-y border-red-300 font-mono leading-5 focus:border-red-500 focus:ring-red-500"
        />
      </FormField>
    );
  }

  const parsedDetails = details;

  function updateDetailValue(key: string, nextValue: unknown) {
    onChange(JSON.stringify({ ...parsedDetails, [key]: nextValue }, null, 2));
  }

  function renderDutyDescription() {
    const key = "部门职责描述";
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateRecord(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
    }
    function addRecord() {
      updateDetailValue(key, [...records, { title: "", items: [] }]);
    }
    async function removeRecord(index: number) {
      const confirmed = await confirmDelete({
        message: `确定删除部门职责 ${index + 1} 吗？删除后需要保存才会生效。`,
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return (
      <div className="space-y-3 md:col-span-2">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-1">
          <span className="text-sm font-semibold text-slate-900">部门职责描述</span>
          {!disabled && (
            <ActionButton
              onClick={addRecord}
              className="px-2 py-1 text-xs"
            >
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
                  <button
                    type="button"
                    aria-label={`删除部门职责 ${index + 1}`}
                    onClick={() => void removeRecord(index)}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    移除
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <TextField
                  value={String(record.title || "")}
                  disabled={disabled}
                  placeholder="职责标题"
                  onChange={(next) => updateRecord(index, { title: next })}
                  className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-sky-100/60"
                />
                <StringListEditor
                  label="职责条目"
                  value={items}
                  disabled={disabled}
                  placeholder="新增职责条目"
                  onChange={(nextItems) => updateRecord(index, { items: nextItems })}
                />
              </div>
            </PanelCard>
          );
        })}
        {records.length === 0 && <EmptyStateCard compact>未设置</EmptyStateCard>}
      </div>
    );
  }

  const remainingKeys = Object.keys(parsedDetails).filter((key) => !["基本信息", "部门职责概要", "部门职责描述"].includes(key));

  return (
    <>
      <div className="md:col-span-2">
        <StringListEditor
          label="部门职责概要"
          value={parsedDetails["部门职责概要"]}
          disabled={disabled}
          placeholder="新增概要"
          onChange={(items) => updateDetailValue("部门职责概要", items)}
        />
      </div>
      {renderDutyDescription()}
      {remainingKeys.length > 0 && (
        <div className="space-y-3 md:col-span-2">
          <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">其他字段</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {remainingKeys.map((key) => {
              if (isPrimitiveArray(parsedDetails[key])) {
                return (
                  <div key={key} className="md:col-span-2">
                    <StringListEditor
                      label={key}
                      value={parsedDetails[key]}
                      disabled={disabled}
                      onChange={(items) => updateDetailValue(key, items)}
                    />
                  </div>
                );
              }
              return (
                <FormField key={key} label={key} className="md:col-span-2">
                  <TextareaField
                    value={detailValueToText(parsedDetails[key])}
                    disabled={disabled}
                    rows={detailFieldRows(parsedDetails[key])}
                    onChange={(next) => updateDetailValue(key, textToDetailValue(parsedDetails[key], next))}
                    className="w-full resize-y rounded-md border border-sky-200 px-3 py-2 font-mono text-xs leading-5 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-sky-100/60"
                  />
                </FormField>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
