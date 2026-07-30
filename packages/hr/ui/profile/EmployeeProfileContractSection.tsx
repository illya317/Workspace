"use client";

import type { Ref } from "react";
import { createPageBody, BodySurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { contractFields, withTenantProfileFieldOptions } from "@workspace/hr/constants";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";
import { createSectionShellSection } from "./ProfileFormControls";
import {
  contractPeriodEndDate,
  createEmptyFormSection,
  createFieldGridSection,
  createFieldRegionSection,
  isCurrentByEndDate,
  normalizeContractRow,
  pickFields,
  type EditableRecord,
} from "./EmployeeProfileUtils";
import { deleteActionSpec, profileActionSpec } from "./EmployeeProfileRowActions";
import { useScrollToAddedItem } from "../hooks/useScrollToAddedItem";

interface ContractSectionProps {
  rows: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}

export function ContractSection(props: ContractSectionProps) {
  return <BodySurface {...createPageBody(useContractSections(props))} />;
}

export function useContractSections({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete
}: ContractSectionProps): BodySurfaceSectionSpec[] {
  const resolvedContractFields = withTenantProfileFieldOptions(contractFields, useTenantConfig());
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(rows);
  const cardFields = pickFields(resolvedContractFields, ["company", "isPrimary", "insuranceStatus", "legalRelation", "contractType", "employmentForm", "confidentialityDate", "nonCompeteDate", "firstContractStartDate", "firstContractEndDate", "secondContractStartDate", "secondContractEndDate", "thirdContractStartDate", "thirdContractEndDate", "permanentContractDate"]);
  function addRow() {
    requestScrollToIndex(0);
    onAdd();
  }
  const sections = rows.length === 0
    ? [createEmptyFormSection("contracts-empty", "暂无合同")]
    : rows.map((row, index) => createContractCardSection({
      row,
      index,
      canEdit,
      saving,
      fields: cardFields,
      onChange,
      onDelete,
      itemRef: getItemRef(index),
    }));
  return [createSectionShellSection({
    key: "contracts",
    title: "合同记录",
    actions: canEdit ? [profileActionSpec({ key: "add-contract", label: "新增合同", variant: "secondary", disabled: saving !== null, onClick: addRow })] : undefined,
    sections,
  })];
}

function createContractCardSection({
  row,
  index,
  canEdit,
  saving,
  fields,
  onChange,
  onDelete,
  itemRef,
}: {
  row: ContractRow;
  index: number;
  canEdit: boolean;
  saving: string | null;
  fields: ProfileField[];
  onChange: (index: number, field: ProfileField, value: unknown, option?: ReferenceOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
  itemRef: Ref<HTMLDivElement>;
}): BodySurfaceSectionSpec {
  const normalizedRow = normalizeContractRow(row);
  const current = isCurrentByEndDate(normalizedRow.permanentContractDate ? normalizedRow.endDate : contractPeriodEndDate(normalizedRow));
  const title = row.company || (row.isNew ? "新增合同" : "未设置公司");
  const summary = [row.contractType, row.insuranceStatus].filter(Boolean).join(" · ");
  return createFieldRegionSection({
    key: String(row.id ?? `new-contract-${index}`),
    itemRef,
    title: [title, current ? "生效中" : "已失效", row.isPrimary ? "主合同" : null, summary || null].filter(Boolean).join(" · "),
    actions: deleteActionSpec({ canEdit, saving, onDelete: () => onDelete(row, index) }),
    sections: [createFieldGridSection(fields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
      const field = fields.find(item => item.key === key);
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
