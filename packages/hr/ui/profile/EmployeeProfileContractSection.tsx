"use client";

import { FormSurface } from "@workspace/core/ui";
import { contractFields } from "@workspace/hr/constants";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";
import { contractPeriodEndDate, fieldGrid, FieldRegion, isCurrentByEndDate, normalizeContractRow, pickFields, type EditableRecord } from "./EmployeeProfileUtils";
import { ProfileAction, RowActions } from "./EmployeeProfileRowActions";
import { useScrollToAddedItem } from "../hooks/useScrollToAddedItem";

function InlineContractChip({
  label,
  tone = "gray",
  className,
}: {
  label: string;
  tone?: "green" | "blue" | "gray";
  className?: string;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass} ${className ?? ""}`}>{label}</span>;
}

export function ContractSection({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete
}: {
  rows: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}) {
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(rows);
  const cardFields = pickFields(contractFields, ["company", "isPrimary", "insuranceStatus", "legalRelation", "contractType", "employmentForm", "confidentialityDate", "nonCompeteDate", "firstContractStartDate", "firstContractEndDate", "secondContractStartDate", "secondContractEndDate", "thirdContractStartDate", "thirdContractEndDate", "permanentContractDate"]);
  function addRow() {
    requestScrollToIndex(0);
    onAdd();
  }
  return <div className="space-y-4">
      <div className="space-y-4">
        {rows.length === 0 ? <FormSurface kind="detail" fields={[{ kind: "note", key: "empty", content: "暂无合同" }]} /> : rows.map((row, index) => <div key={row.id ?? `new-contract-${index}`} ref={getItemRef(index)}>
              <ContractCard row={row} index={index} canEdit={canEdit} saving={saving} fields={cardFields} onChange={onChange} onAdd={addRow} onDelete={onDelete} />
            </div>)}
      </div>
    </div>;
}
function ContractCard({
  row,
  index,
  canEdit,
  saving,
  fields,
  onChange,
  onAdd,
  onDelete
}: {
  row: ContractRow;
  index: number;
  canEdit: boolean;
  saving: string | null;
  fields: ProfileField[];
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onAdd: () => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}) {
  const normalizedRow = normalizeContractRow(row);
  const current = isCurrentByEndDate(normalizedRow.permanentContractDate ? normalizedRow.endDate : contractPeriodEndDate(normalizedRow));
  const title = row.company || (row.isNew ? "新增合同" : "未设置公司");
  const summary = [row.contractType, row.insuranceStatus].filter(Boolean).join(" · ");
  return <FieldRegion title={<div className="flex flex-wrap items-center gap-3">
          <span>{title}</span>
          <InlineContractChip label={current ? "生效中" : "已失效"} tone={current ? "green" : "gray"} className="px-2 py-1 text-sm" />
          {row.isPrimary && <InlineContractChip label="主合同" tone="blue" className="px-2 py-1 text-sm" />}
          {summary ? <span className="text-sm font-medium text-slate-500">{summary}</span> : null}
        </div>} actions={canEdit ? <>
          <ProfileAction label="新增" variant="secondary" disabled={saving !== null} onClick={onAdd} />
          <RowActions canEdit={canEdit} saving={saving} onDelete={() => onDelete(row, index)} />
        </> : null}>
      {fieldGrid(fields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
      const field = contractFields.find(item => item.key === key);
      if (!field) return;
      if (field.key === "permanentContractDate" && value) {
        onChange(index, field, value, option);
        const endDateField = contractFields.find(item => item.key === "endDate");
        if (endDateField) onChange(index, endDateField, null);
        return;
      }
      onChange(index, field, value, option);
    })}
    </FieldRegion>;
}
