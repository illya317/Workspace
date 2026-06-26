"use client";

import { FormSurface, PageSurface, useFeedback } from "@workspace/core/ui";
import { useScrollToAddedItem } from "../../hooks/useScrollToAddedItem";
import { detailFieldRows, detailValueToText, isPrimitiveArray, parseDetailsObject, textToDetailValue } from "./description-details";
import { StringListEditor } from "./detail-editor-primitives";
export function DepartmentDescriptionDetailsEditor({
  value,
  disabled,
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const feedback = useFeedback();
  const details = parseDetailsObject(value);
  const dutyKey = "部门职责描述";
  const dutyRecordsForScroll = details && Array.isArray(details[dutyKey]) ? details[dutyKey] as Array<Record<string, unknown>> : [];
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(dutyRecordsForScroll);
  if (!details) {
    return <FormSurface kind="fields" fields={[{
        key: "invalid-json",
        label: "部门说明书 JSON 格式错误",
        error: "请检查 JSON 内容后重新保存。",
        fieldClassName: "md:col-span-2",
        spec: { valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" },
        value,
        rows: 12,
        onChange: (next) => onChange(String(next ?? "")),
      }]} />;
  }
  const parsedDetails = details;
  function updateDetailValue(key: string, nextValue: unknown) {
    onChange(JSON.stringify({
      ...parsedDetails,
      [key]: nextValue
    }, null, 2));
  }
  function renderDutyDescription() {
    const key = dutyKey;
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateRecord(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? {
        ...record,
        ...patch
      } : record));
    }
    function addRecord() {
      requestScrollToIndex(records.length);
      updateDetailValue(key, [...records, {
        title: "",
        items: []
      }]);
    }
    async function removeRecord(index: number) {
      const confirmed = await feedback.confirmDelete({
        message: `确定删除部门职责 ${index + 1} 吗？删除后需要保存才会生效。`
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return <div className="space-y-3 md:col-span-2">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-1">
          <span className="text-sm font-semibold text-slate-900">部门职责描述</span>
          {!disabled && <FormSurface kind="inline" actions={[{ key: "add-duty", label: "新增职责", onClick: addRecord }]} />}
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
                    view: (
                      <>
                        <div className="mb-2 flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-500">职责 {index + 1}</span>
                          {!disabled && <FormSurface kind="inline" actions={[{ key: "delete-duty", label: "删除", variant: "danger", size: "sm", onClick: () => void removeRecord(index), className: "px-2 py-1 text-xs" }]} />}
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <FormSurface
                            kind="control"
                            control={{
                              kind: "inputControl",
                              spec: { valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" },
                              value: String(record.title || ""),
                              placeholder: "职责标题",
                              onChange: next => updateRecord(index, { title: String(next ?? "") }),
                            }}
                          />
                          <StringListEditor label="职责条目" value={items} disabled={disabled} placeholder="新增职责条目" onChange={nextItems => updateRecord(index, {
                            items: nextItems
                          })} />
                        </div>
                      </>
                    ),
                  }],
                }]}
              />
            </div>;
      })}
        {records.length === 0 && <PageSurface embedded kind="detail" empty={{ content: "未设置", compact: true }} />}
      </div>;
  }
  const remainingKeys = Object.keys(parsedDetails).filter(key => !["基本信息", "部门职责概要", "部门职责描述"].includes(key));
  return <>
      <div className="md:col-span-2">
        <StringListEditor label="部门职责概要" value={parsedDetails["部门职责概要"]} disabled={disabled} placeholder="新增概要" onChange={items => updateDetailValue("部门职责概要", items)} />
      </div>
      {renderDutyDescription()}
      {remainingKeys.length > 0 && <div className="space-y-3 md:col-span-2">
          <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">其他字段</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {remainingKeys.map(key => {
          if (isPrimitiveArray(parsedDetails[key])) {
            return <div key={key} className="md:col-span-2">
                    <StringListEditor label={key} value={parsedDetails[key]} disabled={disabled} onChange={items => updateDetailValue(key, items)} />
                  </div>;
          }
          return <FormSurface key={key} kind="fields" fields={[{
                  key,
                  label: key,
                  fieldClassName: "md:col-span-2",
                  spec: { valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" },
                  value: detailValueToText(parsedDetails[key]),
                  rows: detailFieldRows(parsedDetails[key]),
                  onChange: next => updateDetailValue(key, textToDetailValue(parsedDetails[key], String(next ?? ""))),
                }]} />;
        })}
          </div>
        </div>}
    </>;
}
