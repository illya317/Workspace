"use client";

import { createPageBody, PageSurface, createFieldsSection, useFeedback } from "@workspace/core/ui";
import { useScrollToAddedItem } from "../../hooks/useScrollToAddedItem";
import { formatHistoryVersion, normalizeDateValue, versionNumber } from "./draft-utils";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
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
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFieldsSection<string>(detailKey, [{
          kind: "repeatable",
          key: detailKey,
          title: label,
          addAction: disabled ? undefined : { key: "add-duty", label: `新增${label}`, icon: "add", onClick: addDuty },
          empty: "未设置",
          layout: { columns: 1 },
          items: records.map((record, index) => {
            const items = Array.isArray(record.items) ? record.items.map((item) => String(item)) : [];
            return {
              key: `duty-${index}`,
              itemRef: getItemRef(index),
              title: `职责 ${index + 1}`,
              actions: disabled ? undefined : [{ key: "delete-duty", label: "删除", icon: "delete-bin", variant: "danger", size: "sm", onClick: () => void removeDuty(index) }],
              items: [
                {
                  key: "title",
                  label: "职责标题",
                  spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
                  value: String(record.title || ""),
                  placeholder: "职责标题",
                  onChange: next => updateDuty(index, { title: String(next ?? "") }),
                },
                {
                  kind: "tagList",
                  key: "items",
                  label: "职责条目",
                  items,
                  getKey: (item, itemIndex) => `${item}-${itemIndex}`,
                  getLabel: (item) => item,
                  longTextMode: "wrap",
                  onRemove: (_, itemIndex) => updateDuty(index, { items: items.filter((__, currentIndex) => currentIndex !== itemIndex) }),
                  onUpdateLabel: (_, itemIndex, next) => updateDuty(index, { items: [...new Set(items.map((item, currentIndex) => currentIndex === itemIndex ? next : item))] }),
                  disabled,
                  confirmMessage: (item) => `确定删除「${item || "职责条目"}」吗？删除后需要保存才会生效。`,
                  emptyText: disabled ? "未设置" : undefined,
                  shellClassName: "content-start",
                  append: disabled ? undefined : {
                    field: {
                      key: "appendDutyItem",
                      label: "",
                      spec: { valueType: "string", control: "text" },
                      value: "",
                      placeholder: "新增职责条目",
                      onChange: (next) => {
                        const text = String(next ?? "").trim();
                        if (!text) return;
                        updateDuty(index, { items: [...items, text].filter((item, itemIndex, array) => array.indexOf(item) === itemIndex) });
                      },
                    },
                  },
                },
              ],
            };
          }),
        }])])}
      />
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
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createFieldsSection("change-history", [{
          kind: "repeatable",
          key: "changeHistory",
          title: "变更历史",
          addAction: disabled ? undefined : { key: "add-history", label: "新增变更历史", icon: "add", onClick: addRecord },
          empty: "未设置",
          layout: { columns: 2 },
          items: records.map((record, index) => {
            const rawDate = String(record.effectiveDate || "");
            const dateInvalid = !!rawDate && !normalizeDateValue(rawDate);
            const approverInvalid = String(record.approver || "").includes("见首页");
            return {
              key: `history-${index}`,
              itemRef: getItemRef(index),
              title: `变更历史 ${index + 1}`,
              actions: disabled ? undefined : [{ key: "delete-history", label: "删除", icon: "delete-bin", variant: "danger", size: "sm", onClick: () => void removeRecord(index) }],
              items: [
                { key: "version", label: "版本", spec: { valueType: "string", control: "text", state: "readonly" }, value: String(record.version || formatHistoryVersion(index)) },
                { key: "documentName", label: "文件名", spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: String(record.documentName || ""), onChange: next => updateRecord(index, { documentName: String(next ?? "") }) },
                { key: "effectiveDate", label: "生效日期", error: dateInvalid ? "日期格式错误，请重新选择。" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: rawDate, onChange: next => updateRecord(index, { effectiveDate: next || "" }) },
                {
                  key: "approver",
                  label: "批准",
                  error: approverInvalid ? "当前值不是有效引用，请重新选择。" : undefined,
                  spec: {
                    valueType: "reference",
                    control: "reference",
                    state: disabled ? "disabled" : "normal",
                    options: { source: "remote", fkKey: fkKeyForEntity("employee"), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
                  },
                  value: String(record.approver || ""),
                  displayValue: String(record.approver || ""),
                  placeholder: "搜索批准",
                  onChange: (next) => updateRecord(index, { approver: next || "" }),
                },
              ],
            };
          }),
        }])])}
      />
    </div>;
}
