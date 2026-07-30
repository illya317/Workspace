import type {
  CreateSurfaceSectionSpec,
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type {
  BankReconciliationItemInput,
  InterestVoucherLinkInput,
  InterestWorkpaperLineInput,
  LoanRateTermInput,
  TreasuryBankAccountDto,
  TreasuryLoanDto,
} from "../../types/treasury";
import {
  DAY_COUNT_OPTIONS,
  TREASURY_STATUS_OPTIONS,
  type BankAccountDraft,
  type InterestWorkpaperDraft,
  type LoanDraft,
  type PrincipalEventDraft,
  type ReconciliationDraft,
  uniqueLoanConvention,
} from "./treasury-model";
import {
  financeAccountReferenceField,
  lenderPartyReferenceField,
  voucherItemReferenceField,
} from "./treasury-reference-fields";

type DraftSetter<T> = (update: (current: T) => T) => void;

const LOAN_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "执行中" },
  { value: "settled", label: "已结清" },
  { value: "cancelled", label: "已取消" },
];

function textField(input: {
  key: string;
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  span?: FormSurfaceFieldSpec["span"];
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    span: input.span,
    spec: {
      valueType: "string",
      control: "text",
      multiline: input.multiline,
      validation: input.required ? { required: true } : undefined,
    },
    value: input.value ?? "",
    readOnly: input.readOnly,
    rows: input.multiline ? 2 : undefined,
    onChange: (value) => input.onChange(String(value ?? "").trim() || null),
  };
}

function numberField(input: {
  key: string;
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  required?: boolean;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "number",
      control: "number",
      validation: { min: input.min, max: input.max, required: input.required },
    },
    value: input.value ?? "",
    readOnly: input.readOnly,
    step: input.step,
    onChange: (value) => {
      const normalized = String(value ?? "").trim();
      input.onChange(normalized ? Number(value) : null);
    },
  };
}

function dateField(input: {
  key: string;
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
  readOnly?: boolean;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "date",
      control: "temporal",
      precision: "date",
      validation: input.required ? { required: true } : undefined,
    },
    value: input.value ?? "",
    readOnly: input.readOnly,
    onChange: (value) => input.onChange(value ? String(value) : null),
  };
}

function choiceField(input: {
  key: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
}): FormSurfaceFieldSpec {
  return {
    key: input.key,
    label: input.label,
    required: input.required,
    spec: {
      valueType: "string",
      control: "choice",
      options: { source: "static", items: input.options },
      state: input.readOnly ? "readonly" : "normal",
      validation: input.required ? { required: true } : undefined,
    },
    value: input.value,
    onChange: (value) => input.onChange(String(value ?? "")),
  };
}
export function bankAccountSections(
  draft: BankAccountDraft,
  setDraft: DraftSetter<BankAccountDraft>,
  readOnly = false,
  accountName?: string | null,
): CreateSurfaceSectionSpec[] {
  const update = <K extends keyof BankAccountDraft>(key: K, value: BankAccountDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return [
    {
      key: "account-identity",
      title: "账户识别",
      layout: { columns: 2, density: "compact" },
      items: [
        textField({ key: "sourceName", label: "账户名称", value: draft.sourceName, required: true, readOnly, onChange: (value) => update("sourceName", value ?? "") }),
        textField({ key: "accountNo", label: "银行账号", value: draft.accountNo, readOnly, onChange: (value) => update("accountNo", value) }),
        textField({ key: "bankName", label: "开户行", value: draft.bankName, readOnly, onChange: (value) => update("bankName", value) }),
        textField({ key: "currencyCode", label: "币种", value: draft.currencyCode, readOnly, onChange: (value) => update("currencyCode", value?.toUpperCase() ?? null) }),
        choiceField({ key: "isActive", label: "状态", value: draft.isActive ? "active" : "inactive", options: [{ value: "active", label: "启用" }, { value: "inactive", label: "停用" }], readOnly, onChange: (value) => update("isActive", value === "active") }),
        textField({ key: "sourceCode", label: "来源编码", value: draft.sourceCode, readOnly, onChange: (value) => update("sourceCode", value) }),
      ],
    },
    {
      key: "account-link",
      title: "总账关联",
      layout: { columns: 2, density: "compact" },
      items: [
        financeAccountReferenceField({ key: "accountId", label: "银行科目", value: draft.accountId, displayValue: accountName, companyCode: draft.companyCode, year: draft.accountYear ?? 0, readOnly, onChange: (value) => update("accountId", value) }),
        numberField({ key: "accountYear", label: "科目年度", value: draft.accountYear, min: 2000, max: 2099, step: 1, readOnly, onChange: (value) => update("accountYear", value) }),
        dateField({ key: "openedOn", label: "开户日期", value: draft.openedOn, readOnly, onChange: (value) => update("openedOn", value) }),
        dateField({ key: "closedOn", label: "销户日期", value: draft.closedOn, readOnly, onChange: (value) => update("closedOn", value) }),
      ],
    },
    {
      key: "account-source",
      title: "来源追溯",
      layout: { columns: 3, density: "compact" },
      items: [
        textField({ key: "sourceSystem", label: "来源系统", value: draft.sourceSystem, required: true, readOnly, onChange: (value) => update("sourceSystem", value ?? "") }),
        textField({ key: "sourceLedger", label: "来源账套", value: draft.sourceLedger, required: true, readOnly, onChange: (value) => update("sourceLedger", value ?? "") }),
      ],
    },
  ];
}

export function reconciliationSections(
  draft: ReconciliationDraft,
  setDraft: DraftSetter<ReconciliationDraft>,
  bankAccounts: TreasuryBankAccountDto[],
  readOnly = false,
  voucherItemNames: Readonly<Record<number, string>> = {},
): CreateSurfaceSectionSpec[] {
  const update = <K extends keyof ReconciliationDraft>(key: K, value: ReconciliationDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateItem = (index: number, patch: Partial<BankReconciliationItemInput>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };
  return [
    {
      key: "reconciliation-summary",
      title: "对账结论",
      layout: { columns: 3, density: "compact" },
      items: [
        choiceField({
          key: "bankAccountId",
          label: "银行账户",
          value: draft.bankAccountId ? String(draft.bankAccountId) : "",
          options: bankAccounts.map((account) => ({ value: String(account.id), label: `${account.sourceName}${account.accountNo ? ` · ${account.accountNo}` : ""}` })),
          required: true,
          readOnly,
          onChange: (value) => update("bankAccountId", Number(value)),
        }),
        dateField({ key: "statementDate", label: "对账单日期", value: draft.statementDate, required: true, readOnly, onChange: (value) => update("statementDate", value ?? "") }),
        choiceField({ key: "status", label: "状态", value: draft.status, options: TREASURY_STATUS_OPTIONS, required: true, readOnly, onChange: (value) => update("status", value as ReconciliationDraft["status"]) }),
        numberField({ key: "statementEndingBalance", label: "银行余额", value: draft.statementEndingBalance, required: true, step: 0.01, readOnly, onChange: (value) => update("statementEndingBalance", value ?? 0) }),
        numberField({ key: "ledgerEndingBalance", label: "账面余额", value: draft.ledgerEndingBalance, required: true, step: 0.01, readOnly, onChange: (value) => update("ledgerEndingBalance", value ?? 0) }),
        textField({ key: "evidenceRef", label: "证据引用", value: draft.evidenceRef, readOnly, onChange: (value) => update("evidenceRef", value) }),
        textField({ key: "conclusion", label: "对账结论", value: draft.conclusion, multiline: true, span: "full", readOnly, onChange: (value) => update("conclusion", value) }),
      ],
    },
    {
      key: "reconciliation-items",
      title: "未达项",
      layout: { columns: 1, density: "compact" },
      items: [{
        kind: "repeatable",
        key: "items",
        title: "未达项",
        empty: "当前没有未达项",
        layout: { columns: 3, density: "compact" },
        addAction: readOnly ? undefined : {
          key: "add-item",
          label: "新增未达项",
          icon: "add",
          onClick: () => update("items", [...draft.items, emptyReconciliationItem()]),
        },
        items: draft.items.map((item, index) => ({
          key: String(item.id ?? `new-${index}`),
          title: `未达项 ${index + 1}`,
          subtitle: item.id ? "已保存明细只能更新，不能在本次保存中删除" : undefined,
          actions: readOnly || item.id ? undefined : [{
            key: `remove-item-${index}`,
            label: "删除",
            icon: "delete",
            variant: "danger",
            onClick: () => update("items", draft.items.filter((_, itemIndex) => itemIndex !== index)),
          }],
          items: [
            choiceField({ key: `item-kind-${index}`, label: "调整侧", value: item.itemKind, options: [{ value: "bank_adjustment", label: "银行侧调整" }, { value: "ledger_adjustment", label: "账面侧调整" }], readOnly, onChange: (value) => updateItem(index, { itemKind: value as BankReconciliationItemInput["itemKind"] }) }),
            textField({ key: `item-description-${index}`, label: "摘要", value: item.description, required: true, readOnly, onChange: (value) => updateItem(index, { description: value ?? "" }) }),
            numberField({ key: `item-amount-${index}`, label: "金额", value: item.amount, required: true, step: 0.01, readOnly, onChange: (value) => updateItem(index, { amount: value ?? 0 }) }),
            dateField({ key: `item-occurred-${index}`, label: "发生日期", value: item.occurredOn, readOnly, onChange: (value) => updateItem(index, { occurredOn: value }) }),
            dateField({ key: `item-cleared-${index}`, label: "清账日期", value: item.clearedOn, readOnly, onChange: (value) => updateItem(index, { clearedOn: value }) }),
            choiceField({ key: `item-status-${index}`, label: "状态", value: item.status, options: [{ value: "open", label: "未清" }, { value: "review", label: "待复核" }, { value: "cleared", label: "已清" }], readOnly, onChange: (value) => updateItem(index, { status: value as BankReconciliationItemInput["status"] }) }),
            voucherItemReferenceField({ key: `item-voucher-${index}`, label: "关联凭证分录", value: item.voucherItemId, displayValue: item.voucherItemId ? voucherItemNames[item.voucherItemId] : undefined, companyCode: draft.companyCode, periodId: draft.periodId, readOnly, onChange: (value) => updateItem(index, { voucherItemId: value }) }),
            textField({ key: `item-reference-${index}`, label: "参考号", value: item.referenceNo, readOnly, onChange: (value) => updateItem(index, { referenceNo: value }) }),
          ],
        })),
      }],
    },
  ];
}

export function loanSections(
  draft: LoanDraft,
  setDraft: DraftSetter<LoanDraft>,
  readOnly = false,
  lenderPartyName?: string | null,
): CreateSurfaceSectionSpec[] {
  const update = <K extends keyof LoanDraft>(key: K, value: LoanDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateTerm = (index: number, patch: Partial<LoanRateTermInput>) => {
    setDraft((current) => ({
      ...current,
      rateTerms: current.rateTerms.map((term, termIndex) => termIndex === index ? { ...term, ...patch } : term),
    }));
  };
  return [
    {
      key: "loan-contract",
      title: "借款合同",
      layout: { columns: 3, density: "compact" },
      items: [
        textField({ key: "loanNo", label: "合同编号", value: draft.loanNo, required: true, readOnly, onChange: (value) => update("loanNo", value ?? "") }),
        textField({ key: "name", label: "借款名称", value: draft.name, required: true, readOnly, onChange: (value) => update("name", value ?? "") }),
        lenderPartyReferenceField({ value: draft.lenderPartyId, displayValue: lenderPartyName, required: true, readOnly, onChange: (value) => update("lenderPartyId", value ?? 0) }),
        textField({ key: "currencyCode", label: "币种", value: draft.currencyCode, required: true, readOnly, onChange: (value) => update("currencyCode", value?.toUpperCase() ?? "") }),
        numberField({ key: "contractPrincipalAmount", label: "合同本金", value: draft.contractPrincipalAmount, min: 0.01, step: 0.01, required: true, readOnly, onChange: (value) => update("contractPrincipalAmount", value ?? 0) }),
        choiceField({ key: "status", label: "状态", value: draft.status, options: LOAN_STATUS_OPTIONS, required: true, readOnly, onChange: (value) => update("status", value as LoanDraft["status"]) }),
        dateField({ key: "startOn", label: "开始日期", value: draft.startOn, required: true, readOnly, onChange: (value) => update("startOn", value ?? "") }),
        dateField({ key: "endOn", label: "结束日期", value: draft.endOn, readOnly, onChange: (value) => update("endOn", value) }),
        textField({ key: "note", label: "备注", value: draft.note, multiline: true, span: "full", readOnly, onChange: (value) => update("note", value) }),
      ],
    },
    {
      key: "loan-rate-terms",
      title: "利率条款",
      items: [{
        kind: "repeatable",
        key: "rateTerms",
        title: "利率条款",
        empty: "至少需要一条利率条款",
        layout: { columns: 3, density: "compact" },
        addAction: readOnly ? undefined : {
          key: "add-rate-term",
          label: "新增利率条款",
          icon: "add",
          onClick: () => update("rateTerms", [...draft.rateTerms, emptyRateTerm(draft.startOn)]),
        },
        items: draft.rateTerms.map((term, index) => ({
          key: String(term.id ?? `new-${index}`),
          title: `利率条款 ${index + 1}`,
          subtitle: term.id ? "已保存条款只能更新，不能在本次保存中删除" : undefined,
          actions: readOnly || term.id ? undefined : [{
            key: `remove-term-${index}`,
            label: "删除",
            icon: "delete",
            variant: "danger",
            onClick: () => update("rateTerms", draft.rateTerms.filter((_, termIndex) => termIndex !== index)),
          }],
          items: [
            dateField({ key: `term-from-${index}`, label: "生效日期", value: term.effectiveFrom, required: true, readOnly, onChange: (value) => updateTerm(index, { effectiveFrom: value ?? "" }) }),
            dateField({ key: `term-through-${index}`, label: "截止日期", value: term.effectiveThrough, readOnly, onChange: (value) => updateTerm(index, { effectiveThrough: value }) }),
            choiceField({ key: `term-kind-${index}`, label: "利率类型", value: term.rateKind, options: [{ value: "fixed", label: "固定利率" }, { value: "floating", label: "浮动利率" }], readOnly, onChange: (value) => updateTerm(index, { rateKind: value as LoanRateTermInput["rateKind"] }) }),
            numberField({ key: `term-rate-${index}`, label: "年利率（小数）", value: term.annualRate, min: 0, max: 1, step: 0.000001, required: true, readOnly, onChange: (value) => updateTerm(index, { annualRate: value ?? 0 }) }),
            numberField({ key: `term-spread-${index}`, label: "加点（小数）", value: term.spreadRate, min: 0, max: 1, step: 0.000001, readOnly, onChange: (value) => updateTerm(index, { spreadRate: value }) }),
            textField({ key: `term-benchmark-${index}`, label: "基准利率", value: term.benchmark, required: term.rateKind === "floating", readOnly, onChange: (value) => updateTerm(index, { benchmark: value }) }),
            choiceField({ key: `term-convention-${index}`, label: "计息天数口径", value: term.dayCountConvention, options: DAY_COUNT_OPTIONS, required: true, readOnly, onChange: (value) => updateTerm(index, { dayCountConvention: value as LoanRateTermInput["dayCountConvention"] }) }),
          ],
        })),
      }],
    },
  ];
}

export function principalEventSections(
  draft: PrincipalEventDraft,
  setDraft: DraftSetter<PrincipalEventDraft>,
  loan: TreasuryLoanDto,
): CreateSurfaceSectionSpec[] {
  const update = <K extends keyof PrincipalEventDraft>(key: K, value: PrincipalEventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const reversibleEvents = loan.principalEvents.filter((event) => event.eventKind !== "reversal");
  return [{
    key: "principal-event",
    title: "本金变动",
    layout: { columns: 2, density: "compact" },
    items: [
      choiceField({ key: "eventKind", label: "变动类型", value: draft.eventKind, options: [{ value: "drawdown", label: "放款" }, { value: "repayment", label: "还款" }, { value: "reversal", label: "冲销" }], required: true, onChange: (value) => update("eventKind", value as PrincipalEventDraft["eventKind"]) }),
      dateField({ key: "occurredOn", label: "发生日期", value: draft.occurredOn, required: true, onChange: (value) => update("occurredOn", value ?? "") }),
      numberField({ key: "amount", label: "金额", value: draft.amount, min: 0.01, step: 0.01, required: true, onChange: (value) => update("amount", value ?? 0) }),
      voucherItemReferenceField({ key: "voucherItemId", label: "关联凭证分录", value: draft.voucherItemId, companyCode: draft.companyCode, periodId: draft.periodId, onChange: (value) => update("voucherItemId", value) }),
      ...(draft.eventKind === "reversal" ? [choiceField({
        key: "reversesEventId",
        label: "被冲销事件",
        value: draft.reversesEventId ? String(draft.reversesEventId) : "",
        options: reversibleEvents.map((event) => ({ value: String(event.id), label: `${event.occurredOn} · ${event.eventKind} · ${event.amount}` })),
        required: true,
        onChange: (value) => {
          const reversed = reversibleEvents.find((event) => event.id === Number(value));
          update("reversesEventId", reversed?.id ?? null);
          if (reversed) update("amount", reversed.amount);
        },
      })] : []),
      textField({ key: "referenceNo", label: "参考号", value: draft.referenceNo, onChange: (value) => update("referenceNo", value) }),
      textField({ key: "note", label: "备注", value: draft.note, multiline: true, span: "full", onChange: (value) => update("note", value) }),
    ],
  }];
}

export function interestSections(
  draft: InterestWorkpaperDraft,
  setDraft: DraftSetter<InterestWorkpaperDraft>,
  loans: TreasuryLoanDto[],
  readOnly = false,
  voucherItemNames: Readonly<Record<number, string>> = {},
): CreateSurfaceSectionSpec[] {
  const update = <K extends keyof InterestWorkpaperDraft>(key: K, value: InterestWorkpaperDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateLine = (index: number, patch: Partial<InterestWorkpaperLineInput>) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  };
  const updateLink = (index: number, patch: Partial<InterestVoucherLinkInput>) => {
    setDraft((current) => ({
      ...current,
      voucherLinks: current.voucherLinks.map((link, linkIndex) => linkIndex === index ? { ...link, ...patch } : link),
    }));
  };
  return [
    {
      key: "interest-summary",
      title: "底稿结论",
      layout: { columns: 3, density: "compact" },
      items: [
        choiceField({ key: "loanId", label: "借款", value: draft.loanId ? String(draft.loanId) : "", options: loans.map((loan) => ({ value: String(loan.id), label: `${loan.loanNo} · ${loan.name}` })), required: true, readOnly, onChange: (value) => {
          const loan = loans.find((item) => item.id === Number(value)) ?? null;
          update("loanId", Number(value));
          const convention = uniqueLoanConvention(loan);
          if (convention) update("dayCountConvention", convention);
        } }),
        choiceField({ key: "status", label: "状态", value: draft.status, options: TREASURY_STATUS_OPTIONS, required: true, readOnly, onChange: (value) => update("status", value as InterestWorkpaperDraft["status"]) }),
        choiceField({ key: "dayCountConvention", label: "计息天数口径", value: draft.dayCountConvention, options: DAY_COUNT_OPTIONS, required: true, readOnly, onChange: (value) => update("dayCountConvention", value as InterestWorkpaperDraft["dayCountConvention"]) }),
        textField({ key: "note", label: "备注", value: draft.note, multiline: true, span: "full", readOnly, onChange: (value) => update("note", value) }),
      ],
    },
    {
      key: "interest-lines",
      title: "计息明细",
      items: [{
        kind: "repeatable",
        key: "lines",
        title: "计息行",
        empty: "至少需要一条计息行",
        layout: { columns: 3, density: "compact" },
        addAction: readOnly ? undefined : { key: "add-line", label: "新增计息行", icon: "add", onClick: () => update("lines", [...draft.lines, emptyInterestLine(draft)]) },
        items: draft.lines.map((line, index) => ({
          key: String(line.id ?? `new-${index}`),
          title: `计息行 ${index + 1}`,
          subtitle: line.id ? "已保存明细只能更新，不能在本次保存中删除" : undefined,
          actions: readOnly || line.id ? undefined : [{ key: `remove-line-${index}`, label: "删除", icon: "delete", variant: "danger", onClick: () => update("lines", draft.lines.filter((_, lineIndex) => lineIndex !== index)) }],
          items: [
            numberField({ key: `line-no-${index}`, label: "行号", value: line.lineNo, min: 1, step: 1, required: true, readOnly, onChange: (value) => updateLine(index, { lineNo: value ?? index + 1 }) }),
            dateField({ key: `line-from-${index}`, label: "计息开始", value: line.accrualFrom, required: true, readOnly, onChange: (value) => updateLine(index, { accrualFrom: value ?? "" }) }),
            dateField({ key: `line-through-${index}`, label: "计息结束", value: line.accrualThrough, required: true, readOnly, onChange: (value) => updateLine(index, { accrualThrough: value ?? "" }) }),
            numberField({ key: `line-principal-${index}`, label: "计息本金", value: line.principalBasis, min: 0, step: 0.01, required: true, readOnly, onChange: (value) => updateLine(index, { principalBasis: value ?? 0 }) }),
            numberField({ key: `line-rate-${index}`, label: "年利率（小数）", value: line.annualRate, min: 0, max: 1, step: 0.000001, required: true, readOnly, onChange: (value) => updateLine(index, { annualRate: value ?? 0 }) }),
            numberField({ key: `line-days-${index}`, label: "计息天数", value: line.dayCount, min: 1, max: 366, step: 1, required: true, readOnly, onChange: (value) => updateLine(index, { dayCount: value ?? 0 }) }),
            numberField({ key: `line-source-${index}`, label: "来源利息金额", value: line.sourceReportedInterestAmount, step: 0.01, readOnly, onChange: (value) => updateLine(index, { sourceReportedInterestAmount: value }) }),
            textField({ key: `line-note-${index}`, label: "备注", value: line.note, readOnly, onChange: (value) => updateLine(index, { note: value }) }),
          ],
        })),
      }],
    },
    {
      key: "interest-vouchers",
      title: "凭证勾稽",
      items: [{
        kind: "repeatable",
        key: "voucherLinks",
        title: "凭证链接",
        empty: "当前没有凭证链接",
        layout: { columns: 3, density: "compact" },
        addAction: readOnly ? undefined : { key: "add-voucher", label: "新增凭证链接", icon: "add", onClick: () => update("voucherLinks", [...draft.voucherLinks, emptyVoucherLink()]) },
        items: draft.voucherLinks.map((link, index) => ({
          key: String(link.id ?? `new-${index}`),
          title: `凭证链接 ${index + 1}`,
          subtitle: link.id ? "已保存链接只能更新，不能在本次保存中删除" : undefined,
          actions: readOnly || link.id ? undefined : [{ key: `remove-voucher-${index}`, label: "删除", icon: "delete", variant: "danger", onClick: () => update("voucherLinks", draft.voucherLinks.filter((_, linkIndex) => linkIndex !== index)) }],
          items: [
            voucherItemReferenceField({ key: `voucher-id-${index}`, label: "凭证分录", value: link.voucherItemId, displayValue: voucherItemNames[link.voucherItemId], companyCode: draft.companyCode, periodId: draft.periodId, required: true, readOnly, onChange: (value) => updateLink(index, { voucherItemId: value ?? 0 }) }),
            choiceField({ key: `voucher-kind-${index}`, label: "勾稽类型", value: link.linkKind, options: [{ value: "accrual", label: "计提" }, { value: "payment", label: "支付" }, { value: "reversal", label: "冲销" }], required: true, readOnly, onChange: (value) => updateLink(index, { linkKind: value as InterestVoucherLinkInput["linkKind"] }) }),
            numberField({ key: `voucher-amount-${index}`, label: "金额", value: link.amount, min: 0.01, step: 0.01, required: true, readOnly, onChange: (value) => updateLink(index, { amount: value ?? 0 }) }),
            textField({ key: `voucher-note-${index}`, label: "备注", value: link.note, readOnly, onChange: (value) => updateLink(index, { note: value }) }),
          ],
        })),
      }],
    },
  ];
}

export function asFormItems(sections: CreateSurfaceSectionSpec[]): FormSurfaceItemSpec[] {
  return sections.map((section) => ({
    kind: "section",
    ...section,
    chrome: "divider",
  }));
}

function emptyReconciliationItem(): BankReconciliationItemInput {
  return {
    itemKind: "bank_adjustment",
    occurredOn: null,
    referenceNo: null,
    description: "",
    amount: 0,
    clearedOn: null,
    status: "open",
    voucherItemId: null,
    sourceKind: "manual",
  };
}

function emptyRateTerm(startOn: string): LoanRateTermInput {
  return {
    effectiveFrom: startOn,
    effectiveThrough: null,
    annualRate: 0,
    spreadRate: null,
    rateKind: "fixed",
    benchmark: null,
    dayCountConvention: "actual_365",
    sourceKind: "manual",
  };
}

function emptyInterestLine(draft: InterestWorkpaperDraft): InterestWorkpaperLineInput {
  return {
    lineNo: draft.lines.length + 1,
    accrualFrom: "",
    accrualThrough: "",
    principalBasis: 0,
    annualRate: 0,
    dayCount: 0,
    sourceReportedInterestAmount: null,
    note: null,
    sourceKind: "manual",
  };
}

function emptyVoucherLink(): InterestVoucherLinkInput {
  return {
    voucherItemId: 0,
    linkKind: "accrual",
    amount: 0,
    note: null,
    sourceKind: "manual",
  };
}
