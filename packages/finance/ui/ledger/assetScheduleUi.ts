import type {
  CreateSurfaceSectionSpec,
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type {
  CreateFinanceAssetAdjustmentInput,
  CreateFinanceAssetCardInput,
  FinanceAssetAdjustmentDto,
  FinanceAssetCardDto,
  FinanceAssetPeriodRowDto,
  FinanceAssetReconciliationDto,
} from "../../types/assets";
import { formatFinanceAmount } from "../formatters";

const KIND_LABELS = {
  fixed_asset: "固定资产",
  intangible: "无形资产",
  prepaid: "预付及其他流动资产",
  long_term_deferred: "长期待摊费用",
} as const;

export function emptyAssetDraft(companyCode: string): CreateFinanceAssetCardInput {
  return { companyCode, assetCode: "", name: "", assetKind: "fixed_asset", category: null, assetAccountCode: "1601", accumulatedAccountCode: "1602", acquisitionDate: null, depreciationStartDate: null, originalCost: 0, residualRate: 0.03, usefulLifeMonths: 60, openingAccumulatedAmount: 0, note: null };
}

export function emptyAdjustmentDraft(companyCode: string, year: number, month: number): CreateFinanceAssetAdjustmentInput {
  return { companyCode, year, month, assetId: null, accountCode: "1602", amount: 0, reason: "" };
}

function textField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void, required = false): FormSurfaceFieldSpec {
  return { key: String(key), label, required, spec: { valueType: "string", control: "text", validation: required ? { required: true } : undefined }, value: String(draft[key] ?? ""), onChange: (value) => onChange(key, String(value ?? "")) };
}

function numberField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void, options: { min?: number; max?: number; step?: number } = {}): FormSurfaceFieldSpec {
  return { key: String(key), label, spec: { valueType: "number", control: "number", validation: { min: options.min, max: options.max } }, value: draft[key] == null ? "" : Number(draft[key]), step: options.step, onChange: (value) => onChange(key, String(value ?? "").trim() ? Number(value) : null) };
}

function dateField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void): FormSurfaceFieldSpec {
  return { key: String(key), label, spec: { valueType: "date", control: "temporal", precision: "date" }, value: String(draft[key] ?? ""), onChange: (value) => onChange(key, value ? String(value) : null) };
}

export function assetFormSections(draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [
    { key: "identity", title: "资产识别", layout: { columns: 2, density: "compact" }, items: [
      textField("assetCode", "资产编号", draft, onChange, true),
      textField("name", "资产名称", draft, onChange, true),
      { key: "assetKind", label: "资产类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })) } }, value: draft.assetKind, onChange: (value) => onChange("assetKind", String(value)) },
      textField("category", "资产分类", draft, onChange),
      textField("assetAccountCode", "资产科目", draft, onChange, true),
      textField("accumulatedAccountCode", "累计折旧/摊销科目", draft, onChange),
    ] },
    { key: "schedule", title: "计算政策", layout: { columns: 3, density: "compact" }, items: [
      dateField("acquisitionDate", "取得日期", draft, onChange),
      dateField("depreciationStartDate", "起算日期", draft, onChange),
      numberField("usefulLifeMonths", "期限（月）", draft, onChange, { min: 1, step: 1 }),
      numberField("originalCost", "入账原值", draft, onChange, { min: 0, step: 0.01 }),
      numberField("residualRate", "残值率", draft, onChange, { min: 0, max: 0.999999, step: 0.01 }),
      numberField("openingAccumulatedAmount", "期初累计金额", draft, onChange, { min: 0, step: 0.01 }),
    ] },
    { key: "notes", title: "说明", layout: { columns: 1, density: "compact" }, items: [{ ...textField("note", "备注", draft, onChange), spec: { valueType: "string", control: "text", multiline: true }, rows: 2 }] },
  ];
}

export function adjustmentFormSections(draft: CreateFinanceAssetAdjustmentInput, cards: FinanceAssetCardDto[], onChange: (key: keyof CreateFinanceAssetAdjustmentInput, value: unknown) => void): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{ key: "adjustment", title: "调整事实", layout: { columns: 2, density: "compact" }, items: [
    { key: "assetId", label: "关联资产（可选）", spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "", label: "期间级调整" }, ...cards.map((card) => ({ value: String(card.id), label: `${card.assetCode} · ${card.name}` }))] } }, value: draft.assetId ? String(draft.assetId) : "", onChange: (value) => onChange("assetId", value ? Number(value) : null) },
    { key: "accountCode", label: "累计折旧/摊销科目", required: true, spec: { valueType: "string", control: "text", validation: { required: true } }, value: draft.accountCode, onChange: (value) => onChange("accountCode", String(value ?? "")) },
    { key: "amount", label: "调整金额", required: true, spec: { valueType: "number", control: "number" }, value: draft.amount, step: 0.01, onChange: (value) => onChange("amount", Number(value)) },
    { key: "reason", label: "调整原因", required: true, span: 2, spec: { valueType: "string", control: "text", multiline: true, validation: { required: true } }, value: draft.reason, rows: 2, onChange: (value) => onChange("reason", String(value ?? "")) },
  ] }];
}

const amountCell = (value: number) => ({ kind: "amount" as const, value, minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const assetCardColumns: DataSurfaceColumnSpec<FinanceAssetCardDto>[] = [
  { key: "code", label: "资产编号", required: true, font: "mono", cell: (row) => row.assetCode },
  { key: "name", label: "资产名称", required: true, cell: (row) => row.name },
  { key: "kind", label: "类型", cell: (row) => KIND_LABELS[row.assetKind] },
  { key: "account", label: "资产/累计科目", cell: (row) => `${row.assetAccountCode}${row.accumulatedAccountCode ? ` / ${row.accumulatedAccountCode}` : ""}` },
  { key: "start", label: "起算日期", cell: (row) => row.depreciationStartDate || "—" },
  { key: "life", label: "期限", align: "right", cell: (row) => row.usefulLifeMonths ? `${row.usefulLifeMonths}个月` : "不摊销" },
  { key: "gross", label: "发票/成本依据", align: "right", cell: (row) => amountCell(row.grossCost) },
  { key: "waived", label: "免除", align: "right", cell: (row) => amountCell(row.waivedCost) },
  { key: "cost", label: "入账原值", required: true, align: "right", cell: (row) => amountCell(row.originalCost) },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.status === "active" ? "使用中" : row.status, tone: row.status === "active" ? "green" : "gray" }) },
];

export const assetPeriodColumns: DataSurfaceColumnSpec<FinanceAssetPeriodRowDto>[] = [
  { key: "code", label: "资产编号", required: true, font: "mono", cell: (row) => row.assetCode },
  { key: "name", label: "资产名称", required: true, cell: (row) => row.name },
  { key: "account", label: "累计科目", font: "mono", cell: (row) => row.accountCode },
  { key: "start", label: "起算日期", cell: (row) => row.depreciationStartDate || "—" },
  { key: "cost", label: "原值", align: "right", cell: (row) => amountCell(row.originalCost) },
  { key: "normal", label: "正常计算", align: "right", cell: (row) => amountCell(row.normalAmount) },
  { key: "adjustment", label: "调整", align: "right", cell: (row) => amountCell(row.adjustmentAmount) },
  { key: "period", label: "本期入账", required: true, align: "right", emphasis: "strong", cell: (row) => amountCell(row.periodAmount) },
  { key: "voucher", label: "凭证", cell: (row) => row.voucherNo || "待关联" },
];

export const assetAdjustmentColumns: DataSurfaceColumnSpec<FinanceAssetAdjustmentDto>[] = [
  { key: "account", label: "累计科目", required: true, font: "mono", cell: (row) => row.accountCode },
  { key: "asset", label: "关联资产", cell: (row) => row.assetName || "期间级调整" },
  { key: "amount", label: "调整金额", required: true, align: "right", cell: (row) => amountCell(row.amount) },
  { key: "reason", label: "调整原因", required: true, wrap: "wrap", cell: (row) => row.reason },
  { key: "voucher", label: "凭证", cell: (row) => row.voucherNo || "待关联" },
  { key: "source", label: "来源", cell: (row) => row.sourceSheet ? `${row.sourceSheet}${row.sourceRow ? ` 第${row.sourceRow}行` : ""}` : "手工" },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.status === "confirmed" ? "已确认" : row.status, tone: row.status === "confirmed" ? "green" : "gray" }) },
];

export const assetReconciliationColumns: DataSurfaceColumnSpec<FinanceAssetReconciliationDto>[] = [
  { key: "account", label: "科目", required: true, font: "mono", cell: (row) => row.accountCode },
  { key: "schedule", label: "折旧摊销表", align: "right", cell: (row) => amountCell(row.scheduleAmount) },
  { key: "voucher", label: "关联凭证", align: "right", cell: (row) => amountCell(row.voucherAmount) },
  { key: "ledger", label: "总账本期净额", align: "right", cell: (row) => amountCell(row.ledgerAmount) },
  { key: "voucherDiff", label: "凭证差异", align: "right", cell: (row) => amountCell(row.voucherDifference) },
  { key: "ledgerDiff", label: "总账差异", align: "right", cell: (row) => amountCell(row.ledgerDifference) },
  { key: "status", label: "勾稽", required: true, cell: (row) => ({ kind: "badge", label: row.status === "matched" ? "已勾稽" : "有差异", tone: row.status === "matched" ? "green" : "red" }) },
];

export { KIND_LABELS, formatFinanceAmount };
