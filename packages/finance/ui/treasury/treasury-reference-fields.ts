import type { FormSurfaceFieldSpec } from "@workspace/core/ui";

const ENDPOINT = "/api/modules/finance/treasury/reference-options";

type ReferenceInput = {
  key: string;
  label: string;
  fkKey: string;
  value: number | null | undefined;
  displayValue?: string | null;
  placeholder: string;
  queryParams?: Record<string, string | number>;
  required?: boolean;
  readOnly?: boolean;
  onChange: (value: number | null) => void;
};

function referenceField(input: ReferenceInput): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: input.fkKey,
        endpoint: ENDPOINT,
        returnField: "id",
        lifecycleScope: "active",
        ...(input.queryParams ? { queryParams: input.queryParams } : {}),
      },
      validation: input.required ? { required: true } : undefined,
    },
    value: input.value && input.value > 0 ? String(input.value) : "",
    displayValue: input.displayValue || undefined,
    placeholder: input.placeholder,
    readOnly: input.readOnly,
    onChange: (value) => input.onChange(String(value ?? "").trim() ? Number(value) : null),
  };
}

export function lenderPartyReferenceField(input: Omit<ReferenceInput, "key" | "label" | "fkKey" | "placeholder">) {
  return referenceField({
    ...input,
    key: "lenderPartyId",
    label: "贷款方主体",
    fkKey: "finance.treasury.lenderParty",
    placeholder: "搜索贷款方名称或证件号",
  });
}

export function financeAccountReferenceField(input: Omit<ReferenceInput, "fkKey" | "placeholder"> & { companyCode: string; year: number }) {
  return referenceField({
    ...input,
    fkKey: "finance.treasury.bankAccount.financeAccount",
    placeholder: "搜索科目名称或编码",
    queryParams: { companyCode: input.companyCode, year: input.year },
  });
}

export function voucherItemReferenceField(input: Omit<ReferenceInput, "fkKey" | "placeholder"> & { companyCode: string; periodId: number }) {
  return referenceField({
    ...input,
    fkKey: "finance.treasury.voucherItem",
    placeholder: "搜索凭证号、科目或摘要",
    queryParams: { companyCode: input.companyCode, periodId: input.periodId },
  });
}
