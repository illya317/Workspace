import type {
  CreateSurfaceSectionSpec,
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
  FormSurfaceSectionSpec,
  InputOption,
} from "@workspace/core/ui";

import type {
  AccrualLineDraft,
  AllocationDraft,
  TaxDraft,
  TaxWorkspace,
} from "./tax-ui-model";

type DraftChange = (key: string, value: unknown) => void;
type LineChange = (key: string, field: keyof AccrualLineDraft, value: unknown) => void;
type AllocationChange = (key: string, field: keyof AllocationDraft, value: unknown) => void;

const TAX_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/finance/tax/reference-options";

export function taxDraftFormSections(input: {
  draft: TaxDraft;
  workspace: TaxWorkspace | null;
  allowKindChange?: boolean;
  onKindChange: (kind: TaxDraft["kind"]) => void;
  onChange: DraftChange;
  onLineChange: LineChange;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onAllocationChange: AllocationChange;
  onAddAllocation: () => void;
  onRemoveAllocation: (key: string) => void;
}): CreateSurfaceSectionSpec[] {
  const { draft } = input;
  const main = draft.kind === "registration"
    ? registrationItems(draft, input)
    : draft.kind === "workpaper"
      ? workpaperItems(draft, input)
      : draft.kind === "filing"
        ? filingItems(draft, input)
        : paymentItems(draft, input);
  return [
    {
      key: `${draft.kind}-main`,
      title: main.title,
      items: [
        ...(input.allowKindChange ? [choice("draftKind", "事项类型", draft.kind, [
          option("registration", "纳税登记"),
          option("workpaper", "计税底稿"),
          option("filing", "申报"),
          option("payment", "缴款/退税/冲销"),
        ], (value) => input.onKindChange(value as TaxDraft["kind"]), true)] : []),
        ...main.items,
      ],
      layout: { columns: 2 },
    },
    ...(draft.kind === "workpaper" ? [accrualLinesSection(draft, input)] : []),
    ...(draft.kind === "payment" && draft.paymentKind !== "reversal" ? [allocationsSection(draft, input)] : []),
    { key: `${draft.kind}-source`, title: "来源追溯", items: sourceItems(draft, input.onChange), layout: { columns: 2 } },
  ];
}

export function taxDraftFormItems(input: Parameters<typeof taxDraftFormSections>[0]): FormSurfaceItemSpec[] {
  return taxDraftFormSections(input).map<FormSurfaceSectionSpec>((section) => ({
    kind: "section",
    ...section,
    chrome: "divider",
  }));
}

function registrationItems(
  draft: Extract<TaxDraft, { kind: "registration" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
) {
  return {
    title: draft.id ? "编辑纳税登记" : "新建纳税登记",
    items: [
      choice("taxTypeId", "税种", draft.taxTypeId, input.workspace?.taxTypes.map((row) => ({
        value: String(row.id), label: row.name, subtitle: row.code, searchText: `${row.code} ${row.jurisdiction}`,
      })) ?? [], (value) => input.onChange("taxTypeId", value), true),
      text("authorityName", "税务机关", draft.authorityName, (value) => input.onChange("authorityName", value)),
      text("registrationNo", "登记号", draft.registrationNo, (value) => input.onChange("registrationNo", value), true),
      text("jurisdiction", "税辖区", draft.jurisdiction, (value) => input.onChange("jurisdiction", value), true),
      choice("filingFrequency", "申报频率", draft.filingFrequency, [
        option("monthly", "月度"), option("quarterly", "季度"), option("annual", "年度"), option("event", "按事项"),
      ], (value) => input.onChange("filingFrequency", value), true),
      choice("status", "状态", draft.status, [
        option("draft", "草稿"), option("active", "启用"), option("suspended", "暂停"), option("ended", "终止"),
      ], (value) => input.onChange("status", value), true),
      date("effectiveFrom", "生效日期", draft.effectiveFrom, (value) => input.onChange("effectiveFrom", value), true),
      date("effectiveThrough", "失效日期", draft.effectiveThrough, (value) => input.onChange("effectiveThrough", value)),
    ],
  };
}

function workpaperItems(
  draft: Extract<TaxDraft, { kind: "workpaper" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
) {
  return {
    title: draft.id ? "编辑计税底稿" : "新建计税底稿",
    items: [
      registrationChoice("registrationId", draft.registrationId, input.workspace, (value) => input.onChange("registrationId", value)),
      choice("status", "状态", draft.status, [
        option("draft", "草稿"), option("prepared", "已编制"), option("reconciled", "已勾稽"), option("blocked", "阻断"),
      ], (value) => input.onChange("status", value), true),
      textarea("note", "备注", draft.note, (value) => input.onChange("note", value)),
    ],
  };
}

function filingItems(
  draft: Extract<TaxDraft, { kind: "filing" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
) {
  return {
    title: draft.id ? "编辑申报" : "新建申报",
    items: [
      registrationChoice("registrationId", draft.registrationId, input.workspace, (value) => input.onChange("registrationId", value)),
      choice("status", "状态", draft.status, [
        option("draft", "草稿"), option("filed", "已申报"), option("accepted", "已受理"), option("amended", "已更正"), option("cancelled", "已取消"),
      ], (value) => input.onChange("status", value), true),
      text("filingReference", "申报回执号", draft.filingReference, (value) => input.onChange("filingReference", value)),
      date("filedOn", "申报日期", draft.filedOn, (value) => input.onChange("filedOn", value), draft.status !== "draft"),
      text("currencyCode", "币种", draft.currencyCode, (value) => input.onChange("currencyCode", String(value).toUpperCase()), true),
      number("sourceReportedDeclaredAmount", "申报金额", draft.sourceReportedDeclaredAmount, (value) => input.onChange("sourceReportedDeclaredAmount", value)),
      number("sourceReportedPayableAmount", "应缴金额", draft.sourceReportedPayableAmount, (value) => input.onChange("sourceReportedPayableAmount", value)),
      textarea("note", "备注", draft.note, (value) => input.onChange("note", value)),
    ],
  };
}

function paymentItems(
  draft: Extract<TaxDraft, { kind: "payment" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
) {
  return {
    title: "追加缴款记录",
    items: [
      choice("paymentKind", "记录类型", draft.paymentKind, [
        option("payment", "缴款"), option("refund", "退税"), option("reversal", "冲销"),
      ], (value) => input.onChange("paymentKind", value), true),
      date("paidOn", "支付日期", draft.paidOn, (value) => input.onChange("paidOn", value), true),
      number("amount", "金额", draft.amount, (value) => input.onChange("amount", value), true),
      text("currencyCode", "币种", draft.currencyCode, (value) => input.onChange("currencyCode", String(value).toUpperCase()), true),
      text("paymentReference", "缴款凭证号", draft.paymentReference, (value) => input.onChange("paymentReference", value)),
      ...(draft.paymentKind === "reversal"
        ? [choice("reversesPaymentId", "被冲销记录", draft.reversesPaymentId, input.workspace?.payments
          .filter((row) => row.paymentKind !== "reversal")
          .map((row) => ({ value: String(row.id), label: row.paymentReference || `${paymentKindLabel(row.paymentKind)} ${row.paidOn}`, subtitle: `${row.amount.toLocaleString("zh-CN")} ${row.currencyCode}` })) ?? [], (value) => input.onChange("reversesPaymentId", value), true)]
        : []),
      textarea("note", "备注", draft.note, (value) => input.onChange("note", value)),
    ],
  };
}

function accrualLinesSection(
  draft: Extract<TaxDraft, { kind: "workpaper" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
): CreateSurfaceSectionSpec {
  return {
    key: "workpaper-lines",
    title: "计税明细",
    items: [{
      kind: "repeatable",
      key: "accrualLines",
      items: draft.accrualLines.map((line) => ({
        key: line.key,
        title: `明细 ${line.lineNo || "-"}`,
        subtitle: line.id ? "已保存明细" : "新增明细",
        items: [
          number("lineNo", "行号", line.lineNo, (value) => input.onLineChange(line.key, "lineNo", value), true),
          date("recognitionOn", "确认日期", line.recognitionOn, (value) => input.onLineChange(line.key, "recognitionOn", value)),
          text("description", "计税说明", line.description, (value) => input.onLineChange(line.key, "description", value), true),
          reference({
            key: "voucherItemId",
            label: "计提凭证明细",
            value: line.voucherItemId,
            displayValue: line.voucherItemLabel,
            fkKey: "finance.tax.accrualVoucherItem",
            queryParams: {
              companyCode: input.workspace?.scope.companyCode,
              periodId: input.workspace?.scope.periodId,
            },
            placeholder: "搜索当期凭证号、科目或摘要",
            onChange: (value, name) => {
              input.onLineChange(line.key, "voucherItemId", value);
              input.onLineChange(line.key, "voucherItemLabel", name);
            },
          }),
          choice("method", "计税方法", line.method, [option("base_rate", "计税基础 × 税率"), option("quantity_unit_rate", "数量 × 单位税额 ÷ 除数")], (value) => input.onLineChange(line.key, "method", value), true),
          ...(line.method === "base_rate" ? [
            number("taxBaseAmount", "计税基础", line.taxBaseAmount, (value) => input.onLineChange(line.key, "taxBaseAmount", value), true),
            number("taxRate", "税率（小数）", line.taxRate, (value) => input.onLineChange(line.key, "taxRate", value), true),
          ] : [
            number("quantity", "数量", line.quantity, (value) => input.onLineChange(line.key, "quantity", value), true),
            number("unitRate", "单位税额", line.unitRate, (value) => input.onLineChange(line.key, "unitRate", value), true),
            number("divisor", "除数", line.divisor, (value) => input.onLineChange(line.key, "divisor", value), true),
          ]),
          number("sourceReportedTaxAmount", "来源税额", line.sourceReportedTaxAmount, (value) => input.onLineChange(line.key, "sourceReportedTaxAmount", value)),
        ],
        actions: line.id ? [] : [{ key: `remove-${line.key}`, label: "移除", icon: "delete", variant: "danger", onClick: () => input.onRemoveLine(line.key) }],
      })),
      addAction: { key: "add-accrual", label: "新增计税明细", icon: "add", onClick: input.onAddLine },
      empty: "至少需要一条计税明细",
      layout: { columns: 2 },
    }],
  };
}

function allocationsSection(
  draft: Extract<TaxDraft, { kind: "payment" }>,
  input: Parameters<typeof taxDraftFormSections>[0],
): CreateSurfaceSectionSpec {
  const filingOptions = input.workspace?.filings
    .filter((row) => ["filed", "accepted", "amended"].includes(row.status) && row.currencyCode === draft.currencyCode)
    .map((row) => ({ value: String(row.id), label: row.filingReference || "未填写申报回执", subtitle: `${registrationDisplay(row.registrationId, input.workspace)} · ${row.status}` })) ?? [];
  return {
    key: "payment-allocations",
    title: "申报分配",
    items: [{
      kind: "repeatable",
      key: "allocations",
      items: draft.allocations.map((allocation, index) => ({
        key: allocation.key,
        title: `分配 ${index + 1}`,
        items: [
          choice("filingId", "申报记录", allocation.filingId, filingOptions, (value) => input.onAllocationChange(allocation.key, "filingId", value), true),
          reference({
            key: "voucherItemId",
            label: "缴款凭证明细",
            value: allocation.voucherItemId,
            displayValue: allocation.voucherItemLabel,
            fkKey: "finance.tax.paymentVoucherItem",
            queryParams: paymentVoucherScope(draft, input.workspace),
            placeholder: "搜索支付月份凭证号、科目或摘要",
            onChange: (value, name) => {
              input.onAllocationChange(allocation.key, "voucherItemId", value);
              input.onAllocationChange(allocation.key, "voucherItemLabel", name);
            },
          }),
          number("allocatedAmount", "分配金额", allocation.allocatedAmount, (value) => input.onAllocationChange(allocation.key, "allocatedAmount", value), true),
        ],
        actions: [{ key: `remove-${allocation.key}`, label: "移除", icon: "delete", variant: "danger", onClick: () => input.onRemoveAllocation(allocation.key) }],
      })),
      addAction: { key: "add-allocation", label: "新增分配", icon: "add", onClick: input.onAddAllocation },
      empty: "非冲销记录至少需要一条申报分配",
      layout: { columns: 2 },
    }],
  };
}

function sourceItems(draft: TaxDraft, onChange: DraftChange): FormSurfaceItemSpec[] {
  return [
    readonly("sourceKind", "来源类型", sourceKindLabel(draft.sourceKind)),
    text("sourceFile", "来源文件", draft.sourceFile, (value) => onChange("sourceFile", value)),
  ];
}

function registrationChoice(key: string, value: string, workspace: TaxWorkspace | null, onChange: (value: unknown) => void) {
  return choice(key, "纳税登记", value, workspace?.registrations.map((row) => ({
    value: String(row.id),
    label: row.taxType?.name ?? "未识别税种",
    subtitle: row.registrationNo,
    disabled: !registrationSelectableForPeriod(row, workspace),
  })) ?? [], onChange, true);
}

function registrationSelectableForPeriod(row: TaxWorkspace["registrations"][number], workspace: TaxWorkspace | null) {
  if (!workspace || !["active", "ended"].includes(row.status)) return false;
  const start = `${workspace.scope.year}-${String(workspace.scope.month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(workspace.scope.year, workspace.scope.month, 0)).toISOString().slice(0, 10);
  return row.effectiveFrom.slice(0, 10) <= end
    && Boolean(row.status !== "ended" || row.effectiveThrough)
    && (!row.effectiveThrough || row.effectiveThrough.slice(0, 10) >= start);
}

function text(key: string, label: string, value: string, onChange: (value: unknown) => void, required = false): FormSurfaceFieldSpec {
  return { key, label, value, onChange, required, spec: { control: "text", valueType: "string", validation: required ? { required: true } : undefined } };
}

function textarea(key: string, label: string, value: string, onChange: (value: unknown) => void): FormSurfaceFieldSpec {
  return { key, label, value, onChange, spec: { control: "text", valueType: "string", multiline: true }, rows: 3, span: 2 };
}

function number(key: string, label: string, value: string, onChange: (value: unknown) => void, required = false): FormSurfaceFieldSpec {
  return { key, label, value, onChange, required, inputMode: "decimal", spec: { control: "number", valueType: "number", validation: required ? { required: true } : undefined } };
}

function date(key: string, label: string, value: string, onChange: (value: unknown) => void, required = false): FormSurfaceFieldSpec {
  return { key, label, value, onChange, required, spec: { control: "temporal", valueType: "date", precision: "date", validation: required ? { required: true } : undefined } };
}

function choice(
  key: string,
  label: string,
  value: string,
  options: InputOption[],
  onChange: (value: unknown) => void,
  required = false,
): FormSurfaceFieldSpec {
  return {
    key,
    label,
    value,
    onChange,
    required,
    spec: { control: "choice", valueType: "string", options: { source: "static", items: options }, validation: required ? { required: true } : undefined },
  };
}

function readonly(key: string, label: string, value: string): FormSurfaceItemSpec {
  return { kind: "readonly", key, label, value: value || "—" };
}

function reference(input: {
  key: string;
  label: string;
  value: string;
  displayValue: string;
  fkKey: string;
  lifecycleScope?: "active" | "all" | "archived";
  queryParams?: Record<string, string | number | null | undefined>;
  placeholder: string;
  onChange: (value: string, name: string) => void;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    displayValue: input.displayValue,
    placeholder: input.placeholder,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: input.fkKey,
        endpoint: TAX_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        lifecycleScope: input.lifecycleScope,
        queryParams: input.queryParams,
      },
    },
    onChange: (value, option) => input.onChange(String(value ?? ""), referenceOptionName(option)),
  };
}

function referenceOptionName(option: unknown) {
  return option && typeof option === "object" && "name" in option && typeof option.name === "string"
    ? option.name
    : "";
}

function paymentVoucherScope(draft: Extract<TaxDraft, { kind: "payment" }>, workspace: TaxWorkspace | null) {
  const matched = /^(\d{4})-(\d{2})-\d{2}$/.exec(draft.paidOn);
  return {
    companyCode: workspace?.scope.companyCode,
    year: matched ? Number(matched[1]) : undefined,
    month: matched ? Number(matched[2]) : undefined,
  };
}

function option(value: string, label: string): InputOption {
  return { value, label };
}

function paymentKindLabel(value: "payment" | "refund" | "reversal") {
  return { payment: "缴款", refund: "退税", reversal: "冲销" }[value];
}

function sourceKindLabel(value: string) {
  return ({ manual: "手工维护", import: "受治理导入", system: "系统生成" } as Record<string, string>)[value] ?? value;
}

function registrationDisplay(id: number, workspace: TaxWorkspace | null) {
  const row = workspace?.registrations.find((registration) => registration.id === id);
  return row ? `${row.taxType?.name ?? "未识别税种"} · ${row.registrationNo}` : "未识别纳税登记";
}
