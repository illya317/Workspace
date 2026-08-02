"use client";

import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec, ReferenceOption } from "@workspace/core/ui";
import {
  CONTRACT_CONFIDENTIALITY_OPTIONS,
  CONTRACT_LIFECYCLE_OPTIONS,
  CONTRACT_PERFORMANCE_OPTIONS,
  CONTRACT_SIGNATURE_OPTIONS,
  type Contract,
  type ContractCategoryOption,
} from "@workspace/administration/types";

import type { ContractBusinessRequiredByRelation } from "../../contract-business-required";

type ContractValue = string | number | null;

const CONTRACT_RELATION_FIELDS = [
  { relationKey: "administration.contracts.owning.company", field: "owningCompanyId", label: "归属公司" },
  { relationKey: "administration.contracts.owner.department", field: "ownerDepartmentId", label: "归口部门" },
  { relationKey: "administration.contracts.party.a", field: "partyAId", label: "甲方主体" },
  { relationKey: "administration.contracts.party.b", field: "partyBId", label: "乙方主体" },
  { relationKey: "administration.contracts.handler.employee", field: "handlerEmployeeId", label: "经办人" },
] as const;

export function missingRequiredContractRelationLabels(
  editing: Partial<Contract>,
  requiredByRelation: ContractBusinessRequiredByRelation,
) {
  return CONTRACT_RELATION_FIELDS
    .filter(({ relationKey, field }) => requiredByRelation[relationKey] && !editing[field])
    .map(({ label }) => label);
}

function staticChoice(
  key: keyof Contract,
  label: string,
  value: unknown,
  options: readonly { value: string; label: string }[],
  onChange: (field: keyof Contract, value: ContractValue) => void,
  readOnly: boolean,
  required = false,
  numeric = false,
): FormSurfaceFieldSpec {
  return {
    key: String(key),
    label,
    required,
    spec: {
      valueType: numeric ? "number" : "string",
      control: "choice",
      options: { source: "static", items: options.map((option) => ({ ...option })) },
      validation: required ? { required: true } : undefined,
    },
    value: value === null || value === undefined ? "" : String(value),
    disabled: readOnly,
    onChange: (next: unknown) => onChange(key, numeric ? (next ? Number(next) : null) : String(next ?? "")),
  };
}

function textField(
  key: keyof Contract,
  label: string,
  value: unknown,
  onChange: (field: keyof Contract, value: ContractValue) => void,
  readOnly: boolean,
  options: { required?: boolean; multiline?: boolean; span?: 2; disabled?: boolean } = {},
): FormSurfaceFieldSpec {
  return {
    key: String(key),
    label,
    required: options.required,
    span: options.span,
    spec: {
      valueType: "string",
      control: "text",
      multiline: options.multiline,
      validation: options.required ? { required: true } : undefined,
    },
    value: value === null || value === undefined ? "" : String(value),
    disabled: readOnly || options.disabled,
    onChange: (next: unknown) => onChange(key, String(next ?? "")),
    rows: options.multiline ? 2 : undefined,
  };
}

function referenceField(input: {
  key: "owningCompanyId" | "ownerDepartmentId" | "partyAId" | "partyBId" | "handlerEmployeeId";
  label: string;
  fkKey: string;
  value: number | null | undefined;
  displayValue: string | null | undefined;
  placeholder: string;
  required: boolean;
  lifecycleScope?: "active" | "all";
  readOnly: boolean;
  onChange: (value: number | null, option?: ReferenceOption) => void;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "reference",
      control: "reference",
      validation: input.required ? { required: true } : undefined,
      options: {
        source: "remote",
        fkKey: input.fkKey,
        endpoint: "/api/modules/administration/contracts/reference-options",
        returnField: "id",
        lifecycleScope: input.lifecycleScope ?? "active",
      },
    },
    value: input.value ? String(input.value) : "",
    displayValue: input.displayValue ?? "",
    placeholder: input.placeholder,
    disabled: input.readOnly,
    onChange: (value: unknown, option: unknown) => {
      const selected = option as ReferenceOption | undefined;
      input.onChange(selected?.id ?? (value ? Number(value) : null), selected);
    },
  };
}

export function contractFormFields(
  editing: Partial<Contract>,
  onChange: (field: keyof Contract, value: ContractValue) => void,
  choices: ContractFormChoices,
): FormSurfaceFieldSpec[] {
  const readOnly = Boolean(choices.readOnly);
  return [
    textField("contractNo", "合同编号", editing.contractNo, onChange, readOnly),
    textField("name", "合同名称", editing.name, onChange, readOnly, { required: true }),
    staticChoice(
      "categoryId",
      "合同类型",
      editing.categoryId,
      choices.categories.map((category) => ({ value: String(category.id), label: category.name })),
      onChange,
      readOnly,
      true,
      true,
    ),
    staticChoice("lifecycleStatus", "合同状态", editing.lifecycleStatus, CONTRACT_LIFECYCLE_OPTIONS, onChange, readOnly, true),
    referenceField({
      key: "owningCompanyId",
      label: "归属公司",
      fkKey: "administration.contracts.owning.company",
      value: editing.owningCompanyId,
      displayValue: editing.owningCompanyName,
      required: Boolean(choices.businessRequiredByRelation?.["administration.contracts.owning.company"]),
      placeholder: "搜索公司",
      readOnly,
      onChange: (value, option) => {
        onChange("owningCompanyId", value);
        onChange("owningCompanyName", option?.name ?? null);
      },
    }),
    referenceField({
      key: "ownerDepartmentId",
      label: "归口部门",
      fkKey: "administration.contracts.owner.department",
      value: editing.ownerDepartmentId,
      displayValue: editing.ownerDepartmentName,
      required: Boolean(choices.businessRequiredByRelation?.["administration.contracts.owner.department"]),
      placeholder: "搜索部门",
      readOnly,
      onChange: (value, option) => {
        onChange("ownerDepartmentId", value);
        onChange("ownerDepartmentName", option?.name ?? null);
      },
    }),
    referenceField({
      key: "partyAId",
      label: "甲方主体",
      fkKey: "administration.contracts.party.a",
      value: editing.partyAId,
      displayValue: editing.partyAIdentityName,
      required: Boolean(choices.businessRequiredByRelation?.["administration.contracts.party.a"]),
      placeholder: "搜索法定主体",
      lifecycleScope: "all",
      readOnly,
      onChange: (value, option) => {
        onChange("partyAId", value);
        onChange("partyAIdentityName", option?.name ?? null);
        if (!editing.partyA && option?.name) onChange("partyA", option.name);
      },
    }),
    textField("partyA", "合同甲方名称", editing.partyA, onChange, readOnly),
    referenceField({
      key: "partyBId",
      label: "乙方主体",
      fkKey: "administration.contracts.party.b",
      value: editing.partyBId,
      displayValue: editing.partyBIdentityName,
      required: Boolean(choices.businessRequiredByRelation?.["administration.contracts.party.b"]),
      placeholder: "搜索法定主体",
      lifecycleScope: "all",
      readOnly,
      onChange: (value, option) => {
        onChange("partyBId", value);
        onChange("partyBIdentityName", option?.name ?? null);
        if (!editing.partyB && option?.name) onChange("partyB", option.name);
      },
    }),
    textField("partyB", "合同乙方名称", editing.partyB, onChange, readOnly),
    textField("shareholder", "股东方", editing.shareholder, onChange, readOnly),
    referenceField({
      key: "handlerEmployeeId",
      label: "经办人",
      fkKey: "administration.contracts.handler.employee",
      value: editing.handlerEmployeeId,
      displayValue: editing.handlerEmployeeName,
      required: Boolean(choices.businessRequiredByRelation?.["administration.contracts.handler.employee"]),
      placeholder: "搜索员工姓名、工号",
      lifecycleScope: "all",
      readOnly,
      onChange: (value, option) => {
        onChange("handlerEmployeeId", value);
        onChange("handlerEmployeeName", option?.name ?? null);
      },
    }),
    staticChoice("signatureStatus", "签署状态", editing.signatureStatus, CONTRACT_SIGNATURE_OPTIONS, onChange, readOnly, true),
    staticChoice("performanceStatus", "履行状态", editing.performanceStatus, CONTRACT_PERFORMANCE_OPTIONS, onChange, readOnly, true),
    {
      key: "signedOn",
      label: "签订日期",
      spec: { valueType: "date", control: "temporal", precision: "date" },
      value: editing.signedOn,
      disabled: readOnly,
      onChange: (value: unknown) => onChange("signedOn", value ? String(value) : null),
    },
    {
      key: "expiresOn",
      label: "结束日期",
      spec: { valueType: "date", control: "temporal", precision: "date" },
      value: editing.expiresOn,
      disabled: readOnly,
      onChange: (value: unknown) => onChange("expiresOn", value ? String(value) : null),
    },
    {
      key: "amount",
      label: "合同金额",
      spec: { valueType: "number", control: "number" },
      value: editing.amount ?? "",
      disabled: readOnly,
      onChange: (value: unknown) => onChange("amount", value === "" ? null : Number(value)),
    },
    {
      key: "executedAmount",
      label: "台账已执行金额",
      spec: { valueType: "number", control: "number" },
      value: editing.executedAmount ?? "",
      disabled: readOnly,
      onChange: (value: unknown) => onChange("executedAmount", value === "" ? null : Number(value)),
    },
    textField("currencyCode", "币种代码", editing.currencyCode, onChange, readOnly),
    staticChoice("confidentialityLevel", "保密级别", editing.confidentialityLevel, CONTRACT_CONFIDENTIALITY_OPTIONS, onChange, readOnly, true, true),
    textField("location", "文件位置", editing.location, onChange, readOnly),
    textField("content", "合同内容", editing.content, onChange, readOnly, { multiline: true, span: 2 }),
    textField("remark", "备注", editing.remark, onChange, readOnly, { multiline: true, span: 2 }),
    ...(editing.legacySignDateRaw && editing.signedOnPrecision !== "day" ? [textField("legacySignDateRaw", "旧签订日期", editing.legacySignDateRaw, onChange, true, { disabled: true })] : []),
    ...(editing.legacyEndDateRaw && editing.expiresOnPrecision !== "day" ? [textField("legacyEndDateRaw", "旧结束日期", editing.legacyEndDateRaw, onChange, true, { disabled: true })] : []),
    ...(editing.legacyStatusRaw ? [textField("legacyStatusRaw", "旧状态", editing.legacyStatusRaw, onChange, true, { disabled: true })] : []),
  ];
}

const CONTRACT_FORM_SECTION_KEYS = [
  { key: "identity", title: "基本信息", fields: ["contractNo", "name", "categoryId", "lifecycleStatus"] },
  { key: "ownership", title: "责任归属", fields: ["owningCompanyId", "ownerDepartmentId", "handlerEmployeeId", "confidentialityLevel"] },
  { key: "parties", title: "签约主体", fields: ["partyAId", "partyA", "partyBId", "partyB", "shareholder"] },
  { key: "execution", title: "期限与履行", fields: ["signatureStatus", "performanceStatus", "signedOn", "expiresOn", "amount", "executedAmount", "currencyCode", "location"] },
  { key: "notes", title: "内容与备注", fields: ["content", "remark"] },
  { key: "legacy", title: "待核验旧值", fields: ["legacySignDateRaw", "legacyEndDateRaw", "legacyStatusRaw"] },
] as const;

export function contractFormSections(
  editing: Partial<Contract>,
  onChange: (field: keyof Contract, value: ContractValue) => void,
  choices: ContractFormChoices,
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const fieldsByKey = new Map(contractFormFields(editing, onChange, choices).map((field) => [field.key, field]));
  return CONTRACT_FORM_SECTION_KEYS.flatMap((section) => {
    const items = section.fields.flatMap((key) => {
      const field = fieldsByKey.get(key);
      return field ? [field] : [];
    });
    return items.length ? [{
      key: section.key,
      title: section.title,
      layout: { columns: 2 as const, density: "compact" as const },
      items,
    }] : [];
  });
}

export interface ContractFormChoices {
  locations: string[];
  categories: ContractCategoryOption[];
  readOnly?: boolean;
  businessRequiredByRelation?: ContractBusinessRequiredByRelation;
}
