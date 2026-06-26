"use client";

import { FormSurface, PageSurface, useFeedback } from "@workspace/core/ui";
import { useScrollToAddedItem } from "../../hooks/useScrollToAddedItem";
import { formatHistoryVersion, normalizeDateValue, versionNumber } from "./draft-utils";
import { EntityValueInput, StringListEditor } from "./detail-editor-primitives";
type DetailRecord = Record<string, unknown>;
export function PositionDutyEditor({
  detailKey,
  label,
  records,
  disabled,
  onChange
}: {
  detailKey: string;
  label: string;
  records: DetailRecord[];
  disabled?: boolean;
  onChange: (records: DetailRecord[]) => void;
}) {
  const feedback = useFeedback();
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(records);
  function updateDuty(index: number, patch: DetailRecord) {
    onChange(records.map((record, recordIndex) => recordIndex === index ? {
      ...record,
      ...patch
    } : record));
  }
  function addDuty() {
    requestScrollToIndex(records.length);
    onChange([...records, {
      title: "",
      items: []
    }]);
  }
  async function removeDuty(index: number) {
    const confirmed = await feedback.confirmDelete({
      message: `确定删除「${label} ${index + 1}」吗？删除后需要保存才会生效。`
    });
    if (confirmed) onChange(records.filter((_, recordIndex) => recordIndex !== index));
  }
  return <div key={detailKey} className="space-y-3 md:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {!disabled && <FormSurface kind="inline" actions={[{ key: "add-duty", label: `新增${label}`, onClick: addDuty }]} />}
      </div>
      {records.map((record, index) => {
      const items = Array.isArray(record.items) ? record.items : [];
      return <div key={index} ref={getItemRef(index)}>
            <PageSurface
              embedded
              kind="detail"
              blocks={[{
                kind: "panel",
                key: `duty-${index}`,
                bodyClassName: "p-3",
                blocks: [{
                  kind: "moduleView",
                  key: "content",
                  view: <>
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500">职责 {index + 1}</span>
                      {!disabled && <FormSurface kind="inline" actions={[{ key: "delete-duty", label: "删除", variant: "danger", size: "sm", onClick: () => void removeDuty(index), className: "px-2 py-1 text-xs" }]} />}
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <FormSurface
                        kind="control"
                        control={{
                          kind: "inputControl",
                          spec: { valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" },
                          value: String(record.title || ""),
                          placeholder: "职责标题",
                          onChange: next => updateDuty(index, { title: String(next ?? "") }),
                        }}
                      />
                      <StringListEditor label="职责条目" value={items} disabled={disabled} placeholder="新增职责条目" onChange={nextItems => updateDuty(index, {
                        items: nextItems
                      })} />
                    </div>
                  </>,
                }],
              }]}
            />
          </div>;
    })}
      {records.length === 0 && <PageSurface embedded kind="detail" empty={{ content: "未设置", compact: true }} />}
    </div>;
}
export function PositionChangeHistoryEditor({
  records,
  disabled,
  onChange
}: {
  records: DetailRecord[];
  disabled?: boolean;
  onChange: (records: DetailRecord[]) => void;
}) {
  const feedback = useFeedback();
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(records);
  function updateRecord(index: number, patch: DetailRecord) {
    onChange(records.map((record, recordIndex) => recordIndex === index ? {
      ...record,
      ...patch
    } : record));
  }
  function addRecord() {
    const nextVersion = formatHistoryVersion(Math.max(-1, ...records.map(record => versionNumber(record.version))) + 1);
    requestScrollToIndex(records.length);
    onChange([...records, {
      version: nextVersion,
      documentName: "",
      effectiveDate: "",
      approver: ""
    }]);
  }
  async function removeRecord(index: number) {
    const confirmed = await feedback.confirmDelete({
      message: `确定删除变更历史 ${index + 1} 吗？删除后需要保存才会生效。`
    });
    if (confirmed) onChange(records.filter((_, recordIndex) => recordIndex !== index));
  }
  return <div key="changeHistory" className="space-y-3 md:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">变更历史</span>
        {!disabled && <FormSurface kind="inline" actions={[{ key: "add-history", label: "新增变更历史", onClick: addRecord }]} />}
      </div>
      {records.map((record, index) => {
      const rawDate = String(record.effectiveDate || "");
      const dateInvalid = !!rawDate && !normalizeDateValue(rawDate);
      const approverInvalid = String(record.approver || "").includes("见首页");
      return <div key={index} ref={getItemRef(index)}>
            <PageSurface
              embedded
              kind="detail"
              blocks={[{
                kind: "panel",
                key: `history-${index}`,
                bodyClassName: "grid grid-cols-1 gap-2 p-3 md:grid-cols-[88px_minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]",
                blocks: [{
                  kind: "moduleView",
                  key: "content",
                  view: <>
                    <FormSurface
                      kind="fields"
                      className="contents"
                      bodyClassName="contents"
                      fields={[
                        { key: "version", label: "版本", spec: { valueType: "string", editor: "input", state: "readonly" }, value: String(record.version || formatHistoryVersion(index)) },
                        { key: "documentName", label: "文件名", spec: { valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }, value: String(record.documentName || ""), onChange: next => updateRecord(index, { documentName: String(next ?? "") }) },
                        { key: "effectiveDate", label: "生效日期", error: dateInvalid ? "日期格式错误，请重新选择。" : undefined, spec: { valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }, value: rawDate, onChange: next => updateRecord(index, { effectiveDate: next || "" }) },
                      ]}
                    />
                    <EntityValueInput label="批准" entity="employee" value={record.approver} disabled={disabled} invalid={approverInvalid} onChange={next => updateRecord(index, {
                      approver: next || ""
                    })} />
                    {!disabled && <FormSurface kind="inline" className="md:col-span-4 md:justify-self-end" actions={[{ key: "delete-history", label: "删除", variant: "danger", size: "sm", onClick: () => void removeRecord(index), className: "px-2 py-1 text-xs" }]} />}
                  </>,
                }],
              }]}
            />
          </div>;
    })}
      {records.length === 0 && <PageSurface embedded kind="detail" empty={{ content: "未设置", compact: true }} />}
    </div>;
}
