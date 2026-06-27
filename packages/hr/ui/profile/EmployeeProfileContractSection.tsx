"use client";

import type { Ref } from "react";
import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { contractFields } from "@workspace/hr/constants";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";
import {
  contractPeriodEndDate,
  emptyFormBlock,
  fieldGridBlock,
  fieldRegionBlock,
  isCurrentByEndDate,
  normalizeContractRow,
  pickFields,
  type EditableRecord,
} from "./EmployeeProfileUtils";
import { deleteActionSpec, profileActionSpec } from "./EmployeeProfileRowActions";
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

interface ContractSectionProps {
  rows: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}

export function ContractSection(props: ContractSectionProps) {
  return <PageSurface embedded kind="detail" blocks={useContractSectionBlocks(props)} />;
}

export function useContractSectionBlocks({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete
}: ContractSectionProps): PageSurfaceBlockSpec[] {
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(rows);
  const cardFields = pickFields(contractFields, ["company", "isPrimary", "insuranceStatus", "legalRelation", "contractType", "employmentForm", "confidentialityDate", "nonCompeteDate", "firstContractStartDate", "firstContractEndDate", "secondContractStartDate", "secondContractEndDate", "thirdContractStartDate", "thirdContractEndDate", "permanentContractDate"]);
  function addRow() {
    requestScrollToIndex(0);
    onAdd();
  }
  if (rows.length === 0) return [emptyFormBlock("contracts-empty", "暂无合同")];
  return rows.map((row, index) => contractCardBlock({
    row,
    index,
    canEdit,
    saving,
    fields: cardFields,
    onChange,
    onAdd: addRow,
    onDelete,
    itemRef: getItemRef(index),
  }));
}

function contractCardBlock({
  row,
  index,
  canEdit,
  saving,
  fields,
  onChange,
  onAdd,
  onDelete,
  itemRef,
}: {
  row: ContractRow;
  index: number;
  canEdit: boolean;
  saving: string | null;
  fields: ProfileField[];
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onAdd: () => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
  itemRef: Ref<HTMLDivElement>;
}): PageSurfaceBlockSpec {
  const normalizedRow = normalizeContractRow(row);
  const current = isCurrentByEndDate(normalizedRow.permanentContractDate ? normalizedRow.endDate : contractPeriodEndDate(normalizedRow));
  const title = row.company || (row.isNew ? "新增合同" : "未设置公司");
  const summary = [row.contractType, row.insuranceStatus].filter(Boolean).join(" · ");
  return fieldRegionBlock({
    key: String(row.id ?? `new-contract-${index}`),
    itemRef,
    title: <div className="flex flex-wrap items-center gap-3">
          <span>{title}</span>
          <InlineContractChip label={current ? "生效中" : "已失效"} tone={current ? "green" : "gray"} className="px-2 py-1 text-sm" />
          {row.isPrimary && <InlineContractChip label="主合同" tone="blue" className="px-2 py-1 text-sm" />}
          {summary ? <span className="text-sm font-medium text-slate-500">{summary}</span> : null}
        </div>,
    actions: canEdit ? [
      profileActionSpec({ key: "add", label: "新增", variant: "secondary", disabled: saving !== null, onClick: onAdd }),
      ...deleteActionSpec({ canEdit, saving, onDelete: () => onDelete(row, index) }),
    ] : undefined,
    blocks: [fieldGridBlock(fields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
      const field = contractFields.find(item => item.key === key);
      if (!field) return;
      if (field.key === "permanentContractDate" && value) {
        onChange(index, field, value, option);
        const endDateField = contractFields.find(item => item.key === "endDate");
        if (endDateField) onChange(index, endDateField, null);
        return;
      }
      onChange(index, field, value, option);
    }, undefined, `contract-${index}-fields`)],
  });
}
