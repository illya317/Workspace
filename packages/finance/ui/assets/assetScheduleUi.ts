import type {
  CreateSurfaceSectionSpec,
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type {
  ConfirmFinanceAssetImpairmentAssessmentInput,
  ConfirmFinanceAssetDisposalInput,
  CreateFinanceAssetCardInput,
  FinanceAssetAdjustmentDto,
  FinanceAssetCardDto,
  FinanceAssetPeriodRowDto,
  FinanceAssetWorkspaceDto,
  LinkFinanceAssetPeriodVoucherInput,
  UpdateFinanceAssetCardInput,
} from "../../types/assets";
import { formatFinanceAmount } from "../formatters";

const KIND_LABELS = {
  fixed_asset: "固定资产",
  intangible: "无形资产",
  prepaid: "预付及其他流动资产",
  long_term_deferred: "长期待摊费用",
} as const;
const ASSET_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/finance/assets/reference-options";

export function emptyAssetDraft(companyCode: string, accountYear: number): CreateFinanceAssetCardInput {
  return { companyCode, accountYear, assetCode: "", idempotencyKey: crypto.randomUUID(), name: "", assetKind: "fixed_asset", categoryId: 0, acquisitionDate: null, depreciationStartDate: null, originalCost: 0, residualRatePercent: 3, usefulLifeMonths: 60, openingAccumulatedAmount: 0, note: null };
}

export function emptyDisposalDraft(companyCode: string, year: number, month: number): ConfirmFinanceAssetDisposalInput {
  return { companyCode, year, month, assetId: 0, assetVersion: 0, disposalDate: "", disposalType: "sold", proceedsAmount: 0, reason: "", evidenceRef: "", voucherNo: "" };
}

export function periodVoucherLinkDraft(companyCode: string, year: number, month: number, expectedLinkFingerprint: string): LinkFinanceAssetPeriodVoucherInput {
  return { companyCode, year, month, voucherNo: "", expectedLinkFingerprint };
}

export function impairmentAssessmentDraft(
  companyCode: string,
  year: number,
  month: number,
  assessment: FinanceAssetWorkspaceDto["impairmentAssessment"],
): ConfirmFinanceAssetImpairmentAssessmentInput {
  return assessment ? {
    companyCode,
    year,
    month,
    version: assessment.version,
    conclusion: assessment.conclusion,
    basis: assessment.basis,
    evidenceRef: assessment.evidenceRef,
    impairmentAmount: assessment.impairmentAmount,
    voucherNo: assessment.voucherNo,
    allocations: assessment.allocations.map((row) => ({ assetId: row.assetId, amount: row.amount })),
  } : {
    companyCode,
    year,
    month,
    version: 0,
    conclusion: "no_indication",
    basis: "",
    evidenceRef: "",
    impairmentAmount: 0,
    voucherNo: null,
    allocations: [],
  };
}

export function impairmentAssessmentFormSections(
  draft: ConfirmFinanceAssetImpairmentAssessmentInput,
  onChange: (key: keyof ConfirmFinanceAssetImpairmentAssessmentInput, value: unknown) => void,
  readOnly: boolean,
  cards: FinanceAssetCardDto[] = [],
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const recorded = draft.conclusion === "impairment_recorded";
  const allocationByAsset = new Map(draft.allocations.map((row) => [row.assetId, row.amount]));
  const allocationItems: FormSurfaceFieldSpec[] = recorded ? cards.map((card) => ({
    key: `allocation-${card.id}`,
    label: `${card.assetCode} · ${card.name}`,
    spec: { valueType: "number", control: "number", validation: { min: 0 } },
    value: allocationByAsset.get(card.id) ?? "",
    readOnly,
    step: 0.01,
    onChange: (value) => {
      const amount = Number(value ?? 0);
      const allocations = draft.allocations.filter((row) => row.assetId !== card.id);
      if (Number.isFinite(amount) && amount > 0) allocations.push({ assetId: card.id, amount });
      onChange("allocations", allocations.sort((left, right) => left.assetId - right.assetId));
    },
  })) : [];
  return [{ key: "impairment-assessment", title: "本期减值结论", layout: { columns: 2, density: "compact" }, items: [
    {
      key: "conclusion",
      label: "评估结论",
      required: true,
      spec: { valueType: "string", control: "choice", options: { source: "static", items: [
        { value: "no_indication", label: "未发现减值迹象" },
        { value: "no_impairment", label: "已测试，无需计提" },
        { value: "impairment_recorded", label: "已确认并计提减值" },
      ] } },
      value: draft.conclusion,
      disabled: readOnly,
      onChange: (value) => onChange("conclusion", String(value)),
    },
    {
      key: "evidenceRef",
      label: "证据引用",
      required: true,
      spec: { valueType: "string", control: "text", validation: { required: true } },
      value: draft.evidenceRef,
      readOnly,
      placeholder: "底稿编号、受控文档或附件引用",
      onChange: (value) => onChange("evidenceRef", String(value ?? "")),
    },
    {
      key: "basis",
      label: "评估依据",
      required: true,
      span: 2,
      spec: { valueType: "string", control: "text", multiline: true, validation: { required: true } },
      value: draft.basis,
      readOnly,
      rows: 3,
      onChange: (value) => onChange("basis", String(value ?? "")),
    },
    {
      key: "impairmentAmount",
      label: "减值金额",
      required: recorded,
      spec: { valueType: "number", control: "number", validation: { min: 0 } },
      value: draft.impairmentAmount,
      readOnly: readOnly || !recorded,
      step: 0.01,
      onChange: (value) => onChange("impairmentAmount", Number(value ?? 0)),
    },
    {
      key: "voucherNo",
      label: "减值专用已过账凭证号",
      required: recorded,
      spec: { valueType: "string", control: "text", validation: recorded ? { required: true } : undefined },
      value: draft.voucherNo ?? "",
      readOnly: readOnly || !recorded,
      placeholder: "整张凭证借贷总额须等于减值金额",
      onChange: (value) => onChange("voucherNo", String(value ?? "")),
    },
    ...allocationItems,
  ] }];
}

export function editAssetDraft(card: FinanceAssetCardDto, accountYear: number): UpdateFinanceAssetCardInput {
  return {
    id: card.id,
    version: card.version,
    companyCode: card.companyCode,
    assetCode: card.assetCode,
    name: card.name,
    assetKind: card.assetKind,
    categoryId: card.categoryId,
    accountYear,
    acquisitionDate: card.acquisitionDate,
    depreciationStartDate: card.depreciationStartDate,
    originalCost: card.originalCost,
    residualRatePercent: Math.round(card.residualRate * 100),
    usefulLifeMonths: card.usefulLifeMonths,
    method: card.method,
    openingAccumulatedAmount: card.openingAccumulatedAmount,
    openingAsOfDate: card.openingAsOfDate,
    nonAmortizationReason: card.nonAmortizationReason,
    note: card.note,
  };
}

function textField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void, required = false, readOnly = false): FormSurfaceFieldSpec {
  return { key: String(key), label, required, spec: { valueType: "string", control: "text", validation: required ? { required: true } : undefined }, value: String(draft[key] ?? ""), readOnly, onChange: (value) => onChange(key, String(value ?? "")) };
}

function numberField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void, options: { min?: number; max?: number; step?: number; readOnly?: boolean } = {}): FormSurfaceFieldSpec {
  return { key: String(key), label, spec: { valueType: "number", control: "number", validation: { min: options.min, max: options.max } }, value: draft[key] == null ? "" : Number(draft[key]), readOnly: options.readOnly, step: options.step, onChange: (value) => onChange(key, String(value ?? "").trim() ? Number(value) : null) };
}

function dateField(key: keyof CreateFinanceAssetCardInput, label: string, draft: CreateFinanceAssetCardInput, onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void, readOnly = false): FormSurfaceFieldSpec {
  return { key: String(key), label, spec: { valueType: "date", control: "temporal", precision: "date" }, value: String(draft[key] ?? ""), readOnly, onChange: (value) => onChange(key, value ? String(value) : null) };
}

function derivedAccountField(key: string, label: string, displayValue?: string | null, required = false): FormSurfaceFieldSpec {
  return {
    key,
    label,
    required,
    spec: { valueType: "string", control: "text" },
    value: displayValue ?? "",
    readOnly: true,
    onChange: () => undefined,
  };
}

function categoryReferenceField(input: {
  draft: CreateFinanceAssetCardInput;
  displayValue?: string | null;
  readOnly?: boolean;
  onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void;
}): FormSurfaceFieldSpec {
  return {
    key: "categoryId",
    label: "资产分类",
    required: true,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: "finance.assets.category",
        endpoint: ASSET_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        queryParams: { assetKind: input.draft.assetKind, companyCode: input.draft.companyCode, year: input.draft.accountYear },
      },
      validation: { required: true },
    },
    value: input.draft.categoryId > 0 ? String(input.draft.categoryId) : "",
    displayValue: input.displayValue || undefined,
    placeholder: "搜索资产分类",
    readOnly: input.readOnly,
    onChange: (value) => input.onChange("categoryId", String(value ?? "").trim() ? Number(value) : 0),
  };
}

export function assetFormSections(
  draft: CreateFinanceAssetCardInput,
  onChange: (key: keyof CreateFinanceAssetCardInput, value: unknown) => void,
  readOnly = false,
  displayValues: { companyName?: string | null; assetCodePlaceholder?: string; categoryName?: string | null; assetAccountName?: string | null; accumulatedAccountName?: string | null; reviewRequired?: boolean } = {},
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [
    { key: "identity", title: "资产识别", layout: { columns: 2, density: "compact" }, items: [
      derivedAccountField("companyCode", "公司", displayValues.companyName || draft.companyCode, true),
      derivedAccountField("assetCode", "资产编号", draft.assetCode || displayValues.assetCodePlaceholder, true),
      textField("name", "资产名称", draft, onChange, true, readOnly),
      { key: "assetKind", label: "资产类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })) } }, value: draft.assetKind, disabled: readOnly, onChange: (value) => onChange("assetKind", String(value)) },
      categoryReferenceField({ draft, displayValue: displayValues.categoryName, readOnly, onChange }),
      derivedAccountField("assetAccountId", "资产科目", displayValues.assetAccountName, true),
      derivedAccountField("accumulatedAccountId", "累计折旧/摊销科目", displayValues.accumulatedAccountName),
    ] },
    { key: "schedule", title: "计算政策", layout: { columns: 3, density: "compact" }, items: [
      dateField("acquisitionDate", "取得日期", draft, onChange, readOnly),
      dateField("depreciationStartDate", "起算日期", draft, onChange, readOnly),
      numberField("usefulLifeMonths", "期限（月）", draft, onChange, { min: 1, step: 1, readOnly }),
      numberField("originalCost", "入账原值", draft, onChange, { min: 0, step: 0.01, readOnly }),
      numberField("residualRatePercent", "残值率（%）", draft, onChange, { min: 0, max: 99, step: 1, readOnly }),
      numberField("openingAccumulatedAmount", "期初累计金额", draft, onChange, { min: 0, step: 0.01, readOnly }),
    ] },
    { key: "notes", title: "说明", layout: { columns: 1, density: "compact" }, items: [{ ...textField("note", "备注", draft, onChange, false, readOnly), spec: { valueType: "string", control: "text", multiline: true }, rows: 2 }] },
  ];
}

export function disposalFormSections(draft: ConfirmFinanceAssetDisposalInput, cards: FinanceAssetCardDto[], onChange: (key: keyof ConfirmFinanceAssetDisposalInput, value: unknown) => void): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{ key: "disposal", title: "处置事实", layout: { columns: 2, density: "compact" }, items: [
    { key: "assetId", label: "资产卡片", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: cards.filter((card) => card.status === "active").map((card) => ({ value: String(card.id), label: `${card.assetCode} · ${card.name}` })) } }, value: draft.assetId ? String(draft.assetId) : "", onChange: (value) => {
      const asset = cards.find((card) => card.id === Number(value));
      onChange("assetId", asset?.id ?? 0);
      onChange("assetVersion", asset?.version ?? 0);
    } },
    { key: "disposalDate", label: "处置日期", required: true, spec: { valueType: "date", control: "temporal", precision: "date", validation: { required: true } }, value: draft.disposalDate, onChange: (value) => onChange("disposalDate", String(value ?? "")) },
    { key: "disposalType", label: "处置类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "sold", label: "出售" }, { value: "scrapped", label: "报废" }, { value: "retired", label: "退役" }, { value: "other", label: "其他" }] } }, value: draft.disposalType, onChange: (value) => onChange("disposalType", String(value)) },
    { key: "proceedsAmount", label: "处置收入", spec: { valueType: "number", control: "number", validation: { min: 0 } }, value: draft.proceedsAmount, step: 0.01, onChange: (value) => onChange("proceedsAmount", Number(value ?? 0)) },
    { key: "voucherNo", label: "已过账处置凭证号", required: true, spec: { valueType: "string", control: "text", validation: { required: true } }, value: draft.voucherNo, onChange: (value) => onChange("voucherNo", String(value ?? "")) },
    { key: "evidenceRef", label: "证据引用", required: true, spec: { valueType: "string", control: "text", validation: { required: true } }, value: draft.evidenceRef, onChange: (value) => onChange("evidenceRef", String(value ?? "")) },
    { key: "reason", label: "处置原因", required: true, span: 2, spec: { valueType: "string", control: "text", multiline: true, validation: { required: true } }, value: draft.reason, rows: 2, onChange: (value) => onChange("reason", String(value ?? "")) },
  ] }];
}

export function periodVoucherLinkFormSections(draft: LinkFinanceAssetPeriodVoucherInput, onChange: (value: string) => void): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{ key: "period-voucher", title: "专用凭证", layout: { columns: 1, density: "compact" }, items: [{
    key: "voucherNo", label: "折旧摊销专用已过账凭证号", required: true,
    spec: { valueType: "string", control: "text", validation: { required: true } }, value: draft.voucherNo,
    placeholder: "整张借贷总额及逐累计科目须与本期台账一致", onChange: (value) => onChange(String(value ?? "")),
  }] }];
}

const amountCell = (value: number) => ({ kind: "amount" as const, value, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const assetNameCell = (value: string) => {
  const characters = Array.from(value);
  return { kind: "text" as const, value: characters.length > 10 ? `${characters.slice(0, 10).join("")}...` : value, title: value };
};

export const assetCardColumns: DataSurfaceColumnSpec<FinanceAssetCardDto>[] = [
  { key: "code", label: "资产编号", required: true, font: "mono", cell: (row) => row.assetCode },
  { key: "name", label: "资产名称", required: true, cell: (row) => assetNameCell(row.name) },
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
  { key: "name", label: "资产名称", required: true, cell: (row) => assetNameCell(row.name) },
  { key: "account", label: "累计科目", font: "mono", cell: (row) => row.accountCode },
  { key: "start", label: "起算日期", cell: (row) => row.depreciationStartDate || "—" },
  { key: "cost", label: "原值", align: "right", cell: (row) => amountCell(row.originalCost) },
  { key: "residual", label: "残值率", align: "right", cell: (row) => `${Math.round(row.residualRate * 100)}%` },
  { key: "life", label: "期限", align: "right", cell: (row) => row.usefulLifeMonths != null ? `${row.usefulLifeMonths}个月` : "—" },
  { key: "monthly", label: "月折旧额", align: "right", cell: (row) => row.monthlyAmount != null ? amountCell(row.monthlyAmount) : "—" },
  { key: "accumulatedBefore", label: "期初累计", align: "right", cell: (row) => amountCell(row.accumulatedBefore) },
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

export { KIND_LABELS, formatFinanceAmount };
