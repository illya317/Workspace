import type { DataSurfaceColumnSpec, SurfaceColumnOptionSpec } from "@workspace/core/ui";
import type { ExternalParty, ExternalPartyCategory } from "@workspace/external/types";
import { EXTERNAL_PARTY_RELATED_PARTY_LABELS } from "./external-party-form";

function text(value: string | null | undefined, options: { font?: "mono"; wrap?: "wrap" | "nowrap" } = {}) {
  return { kind: "text" as const, value: value || "—", ...options };
}

export function externalPartyColumns(category: ExternalPartyCategory): DataSurfaceColumnSpec<ExternalParty>[] {
  const singular = category === "customer" ? "客户" : "供应商";
  return [
    { key: "code", label: `${singular}编码`, required: true, cell: (row) => text(row.code, { font: "mono", wrap: "nowrap" }) },
    { key: "subjectType", label: "主体类型", defaultVisible: true, cell: (row) => ({ kind: "badge", label: row.subjectType === "individual" ? "个人" : "单位", tone: row.subjectType === "individual" ? "blue" : "gray" }) },
    { key: "relatedPartyType", label: "关系性质", defaultVisible: true, cell: (row) => ({ kind: "badge", label: EXTERNAL_PARTY_RELATED_PARTY_LABELS[row.relatedPartyType], tone: row.relatedPartyType === "unrelated" ? "gray" : "amber" }) },
    { key: "name", label: "名称", required: true, cell: (row) => text(row.name, { wrap: "nowrap" }) },
    { key: "fullName", label: "全称", defaultVisible: true, cell: (row) => text(row.fullName) },
    { key: "classification", label: "业务分类", defaultVisible: true, cell: (row) => text(row.classification, { wrap: "nowrap" }) },
    { key: "identityNumber", label: "证件/统一代码", cell: (row) => text(row.identityNumber, { font: "mono", wrap: "nowrap" }) },
    { key: "legalRepresentative", label: "法定代表人", cell: (row) => text(row.legalRepresentative, { wrap: "nowrap" }) },
    { key: "contactPerson", label: "联系人", defaultVisible: true, cell: (row) => text(row.contactPerson, { wrap: "nowrap" }) },
    { key: "phone", label: "联系电话", defaultVisible: true, cell: (row) => text(row.phone, { wrap: "nowrap" }) },
    { key: "email", label: "邮箱", cell: (row) => text(row.email, { wrap: "nowrap" }) },
    { key: "bankName", label: "开户行", cell: (row) => text(row.bankName) },
    { key: "bankAccount", label: "银行账号", cell: (row) => text(row.bankAccount, { font: "mono", wrap: "nowrap" }) },
    { key: "address", label: "地址", cell: (row) => text(row.address) },
    { key: "invoiceTitle", label: "开票抬头", cell: (row) => text(row.invoiceTitle) },
    { key: "invoiceAddressPhone", label: "开票地址及电话", cell: (row) => text(row.invoiceAddressPhone) },
    { key: "settlementTerms", label: "结算条件", cell: (row) => text(row.settlementTerms) },
    { key: "creditLimit", label: "信用额度", cell: (row) => text(row.creditLimit == null ? null : String(row.creditLimit)) },
    { key: "creditDays", label: category === "customer" ? "信用期限（天）" : "付款期限（天）", cell: (row) => text(row.creditDays == null ? null : String(row.creditDays)) },
    { key: "taxRate", label: "税率（%）", cell: (row) => text(row.taxRate == null ? null : String(row.taxRate)) },
    { key: "isActive", label: "状态", defaultVisible: true, cell: (row) => ({ kind: "badge", label: row.isActive ? "开启" : "关闭", tone: row.isActive ? "green" : "gray" }) },
    { key: "remark", label: "备注", cell: (row) => text(row.remark) },
  ];
}

export function externalPartyColumnOptions(columns: DataSurfaceColumnSpec<ExternalParty>[]): SurfaceColumnOptionSpec[] {
  return columns.map(({ key, label, defaultVisible, required }) => ({ key, label, defaultVisible, required }));
}

export function defaultExternalPartyColumns(columns: DataSurfaceColumnSpec<ExternalParty>[]) {
  return columns.filter((column) => column.required || column.defaultVisible).map((column) => column.key);
}
