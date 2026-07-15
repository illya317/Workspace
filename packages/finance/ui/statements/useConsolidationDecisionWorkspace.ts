"use client";

import {
  createFormSection,
  createMessageSection,
  createPageTableSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceRowActionSpec,
  type FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type {
  ConsolidationControlKey,
  ConsolidationEntryType,
  ConsolidationOverview,
  SaveConsolidationEntryInput,
  StatementExchangeRateSnapshot,
  StatementReportType,
} from "@workspace/finance/types";
import { useEffect, useMemo, useState } from "react";

import type { ConsolidationCapabilities } from "./statement-ui-types";
import {
  CONTROL_OPTIONS,
  ENTRY_COLUMNS,
  ENTRY_TYPE_OPTIONS,
  EVENT_COLUMNS,
  MATCH_SOURCE_OPTIONS,
  MATCHED_ENTRY_TYPES,
  REPORT_OPTIONS,
  TAX_EFFECT_COLUMNS,
  choiceField,
  defaultEntry,
  textField,
  type EntryDraft,
  type TaxEffectRow,
} from "./consolidation-decision-presenters";
import {
  buildSourceFreezeInput,
  nextConsolidationLifecycleAction,
  statementLineOptions,
  type CurrencyPolicyDrafts,
  type InvestmentEntitySelections,
} from "./consolidation-workbench-model";
import { useConsolidationCommands } from "./useConsolidationCommands";

export function useConsolidationDecisionWorkspace(input: {
  data: ConsolidationOverview | null;
  capabilities: ConsolidationCapabilities;
  onRefresh: () => void;
}) {
  const { capabilities, data, onRefresh } = input;
  const commands = useConsolidationCommands(data, onRefresh);
  const [systemEvidence, setSystemEvidence] = useState("");
  const [currencyPolicies, setCurrencyPolicies] = useState<CurrencyPolicyDrafts>({});
  const [investmentEntitySelections, setInvestmentEntitySelections] = useState<InvestmentEntitySelections>({});
  const [controlKey, setControlKey] = useState<ConsolidationControlKey>("scope");
  const [decision, setDecision] = useState<"completed" | "notApplicable">("completed");
  const [conclusion, setConclusion] = useState("");
  const [decisionEvidence, setDecisionEvidence] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rateReviewNote, setRateReviewNote] = useState("");
  const [entryDeleteNote, setEntryDeleteNote] = useState("");
  const [taxDeleteNote, setTaxDeleteNote] = useState("");
  const [entry, setEntry] = useState<EntryDraft>(defaultEntry);
  const [taxEntryId, setTaxEntryId] = useState<number | null>(null);
  const [taxEffectKey, setTaxEffectKey] = useState("");
  const [taxDifference, setTaxDifference] = useState(0);
  const [taxRate, setTaxRate] = useState(0.25);
  const [taxRecognition, setTaxRecognition] = useState<"asset" | "liability" | "unrecognized">("asset");
  const [taxPeriodBasis, setTaxPeriodBasis] = useState<"current" | "comparative">("current");
  const [taxEntitySnapshotId, setTaxEntitySnapshotId] = useState<number | null>(null);
  const [taxJurisdiction, setTaxJurisdiction] = useState("");
  const [taxRecognitionLocation, setTaxRecognitionLocation] = useState<"profitOrLoss" | "otherComprehensiveIncome" | "equity">("profitOrLoss");
  const [taxCounterpartLineCode, setTaxCounterpartLineCode] = useState("incomeTax");
  const [taxConclusion, setTaxConclusion] = useState("");
  const [taxEvidence, setTaxEvidence] = useState("");

  useEffect(() => {
    const entities = data?.batch?.entities ?? [];
    setCurrencyPolicies((current) => Object.fromEntries(entities.map((entity) => [
      entity.id,
      current[entity.id] ?? {
        functionalCurrency: entity.functionalCurrency === "CNY" || entity.functionalCurrency === "CAD"
          ? entity.functionalCurrency
          : "",
        evidence: entity.currencyEvidence ?? "",
      },
    ])));
    setEntry((current) => ({
      ...current,
      debitCompanyId: current.debitCompanyId ?? entities[0]?.companyId ?? null,
      creditCompanyId: current.creditCompanyId ?? entities[1]?.companyId ?? entities[0]?.companyId ?? null,
    }));
    const firstDraft = data?.batch?.entries.find((item) => item.status === "draft");
    setTaxEntryId((current) => current ?? firstDraft?.id ?? null);
    setTaxEntitySnapshotId((current) => current ?? entities[0]?.id ?? null);
  }, [data?.batch?.entities, data?.batch?.entries]);

  useEffect(() => {
    const batch = data?.batch;
    const investments = data?.fxPolicy.investmentEvidence ?? [];
    if (!batch) {
      setInvestmentEntitySelections({});
      return;
    }
    const batchEntityIds = new Set(batch.entities.map((entity) => entity.id));
    const savedByVoucherItemId = new Map<number, number>();
    for (const rate of batch.exchangeRates) {
      for (const application of rate.applications) {
        if (application.applicationType === "historicalInvestment" && application.voucherItemId !== null) {
          savedByVoucherItemId.set(application.voucherItemId, application.entitySnapshotId);
        }
      }
    }
    setInvestmentEntitySelections((current) => {
      const next: InvestmentEntitySelections = {};
      for (const investment of investments) {
        const currentEntityId = current[investment.id];
        const selectedEntityId = currentEntityId && batchEntityIds.has(currentEntityId)
          ? currentEntityId
          : savedByVoucherItemId.get(investment.id);
        if (selectedEntityId) next[investment.id] = selectedEntityId;
      }
      return next;
    });
  }, [data?.batch, data?.fxPolicy.investmentEvidence]);

  const companyOptions = useMemo(() => data?.batch?.entities.map((entity) => ({
    value: String(entity.companyId),
    label: `${entity.companyCode} · ${entity.companyName}`,
  })) ?? [], [data?.batch?.entities]);
  const debitLineOptions = useMemo(() => statementLineOptions(data?.batch ?? null, entry.debitReportType), [data?.batch, entry.debitReportType]);
  const creditLineOptions = useMemo(() => statementLineOptions(data?.batch ?? null, entry.creditReportType), [data?.batch, entry.creditReportType]);

  const createBatchSections = (): BodySurfaceSectionSpec[] => data?.batch ? [] : [
    createMessageSection("consolidation-batch-required", {
      tone: "warning",
      content: "先创建期间批次，系统才会冻结股权范围、个别三表、汇率和后续人工分录。批次不是页面筛选状态，而是可审计版本。",
    }),
    createFormSection("consolidation-batch-create", {
      kind: "filters",
      content: { items: [], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      actions: [{ key: "ensure", action: "create", label: commands.busy ? "正在创建…" : "创建合并批次", disabled: commands.busy || !capabilities.canCreate, onClick: () => void commands.ensureBatch() }],
    }),
  ];

  const sourceDecisionSections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch || batch.status !== "draft") return [];
    const cadEntityOptions = batch.entities
      .filter((entity) => entity.role === "subsidiary" && currencyPolicies[entity.id]?.functionalCurrency === "CAD")
      .map((entity) => ({ value: String(entity.id), label: `${entity.companyCode} · ${entity.companyName}` }));
    const fields: FormSurfaceFieldSpec[] = [
      textField("systemEvidence", "系统账快照核对依据", systemEvidence, setSystemEvidence, { span: 3, multiline: true }),
      ...batch.entities.flatMap((entity) => {
        const policy = currencyPolicies[entity.id] ?? { functionalCurrency: "" as const, evidence: "" };
        return [
          choiceField(
            `currency-${entity.id}`,
            `${entity.companyName}本位币`,
            policy.functionalCurrency,
            [{ value: "CNY", label: "人民币 CNY" }, { value: "CAD", label: "加拿大元 CAD" }],
            (value) => {
              const functionalCurrency = value as "CNY" | "CAD";
              setCurrencyPolicies((current) => ({
                ...current,
                [entity.id]: { ...(current[entity.id] ?? policy), functionalCurrency },
              }));
              if (functionalCurrency !== "CAD") {
                setInvestmentEntitySelections((current) => {
                  const next = { ...current };
                  for (const [voucherItemId, selectedEntityId] of Object.entries(next)) {
                    if (selectedEntityId === entity.id) delete next[Number(voucherItemId)];
                  }
                  return next;
                });
              }
            },
          ),
          textField(`currency-evidence-${entity.id}`, `${entity.companyName}本位币依据`, policy.evidence, (value) => {
            setCurrencyPolicies((current) => ({
              ...current,
              [entity.id]: { ...(current[entity.id] ?? policy), evidence: value },
            }));
          }, { required: true, span: 2 }),
        ];
      }),
      ...data.fxPolicy.investmentEvidence.map((investment) => choiceField(
        `investment-entity-${investment.id}`,
        `投资凭证 ${investment.companyCode} · ${investment.voucherNo} 被投资主体`,
        investmentEntitySelections[investment.id]
          ? String(investmentEntitySelections[investment.id])
          : "",
        cadEntityOptions,
        (value) => setInvestmentEntitySelections((current) => {
          const next = { ...current };
          if (value) next[investment.id] = Number(value);
          else delete next[investment.id];
          return next;
        }),
      )),
    ];
    return [createFormSection("consolidation-source-freeze", {
      kind: "filters",
      header: { title: "冻结来源与折算口径", description: "逐主体确认本位币；CAD 三表绑定已独立复核的本期期末中行折算价，冻结来源含非零上期数时同时绑定比较期期末牌价；每笔投资付款还需人工选择被投资 CAD 主体并按期间冻结投资日历史汇率。" },
      content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      actions: [{ key: "freeze", action: "save", label: commands.busy ? "正在冻结…" : "冻结当前来源", disabled: commands.busy || !capabilities.canUpdate }],
      submit: { onSubmit: () => {
        if (!data) return;
        const built = buildSourceFreezeInput(data, currencyPolicies, investmentEntitySelections, systemEvidence);
        if (!built.ok) {
          commands.notifyError(built.error);
          return;
        }
        void commands.saveSources(built.input);
      } },
    })];
  };

  const controlDecisionSections = (defaultControlKey?: ConsolidationControlKey): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch || batch.status !== "draft") return [];
    const selectedKey = defaultControlKey ?? controlKey;
    const fields = [
      choiceField("controlKey", "控制事项", selectedKey, CONTROL_OPTIONS, (value) => setControlKey(value as ConsolidationControlKey)),
      choiceField("decision", "处理结论", decision, [{ value: "completed", label: "已完成" }, { value: "notApplicable", label: "不适用" }], (value) => setDecision(value as typeof decision)),
      textField("conclusion", "判断结论", conclusion, setConclusion, { required: true, span: 3, multiline: true }),
      textField("evidence", "结论依据", decisionEvidence, setDecisionEvidence, { required: true, span: 3, multiline: true }),
    ];
    return [createFormSection(`consolidation-control-${selectedKey}`, {
      kind: "filters",
      header: { title: "记录人工判断", description: "“不适用”不能空口跳过，必须写清事实和证据；客观阻断仍由系统事实校验。" },
      content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      actions: [{ key: "save-decision", action: "save", label: "保存判断", disabled: commands.busy || !capabilities.canUpdate }],
      submit: { onSubmit: () => void commands.saveDecision({ controlKey: selectedKey, decision, conclusion, evidence: decisionEvidence }) },
    })];
  };

  const entrySections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return [];
    const requiresMatching = MATCHED_ENTRY_TYPES.has(entry.entryType);
    const matchDifference = Math.round(Math.abs(entry.debitSourceAmount - entry.creditSourceAmount) * 100) / 100;
    const fields: FormSurfaceFieldSpec[] = [
      textField("entryNo", "分录编号", entry.entryNo, (value) => setEntry((current) => ({ ...current, entryNo: value })), { required: true }),
      choiceField("entryType", "抵销类别", entry.entryType, ENTRY_TYPE_OPTIONS, (value) => setEntry((current) => ({ ...current, entryType: value as ConsolidationEntryType }))),
      choiceField("periodBasis", "作用期间", entry.periodBasis, [{ value: "current", label: "本期数" }, { value: "comparative", label: "比较期数" }], (value) => setEntry((current) => ({ ...current, periodBasis: value as EntryDraft["periodBasis"] }))),
      textField("title", "事项名称", entry.title, (value) => setEntry((current) => ({ ...current, title: value })), { required: true }),
      textField("description", "配对、计算与差额说明", entry.description, (value) => setEntry((current) => ({ ...current, description: value })), { required: true, span: 3, multiline: true }),
      textField("evidence", "证据索引", entry.evidence, (value) => setEntry((current) => ({ ...current, evidence: value })), { required: true, span: 3, multiline: true }),
      ...(requiresMatching ? [
        choiceField("debitSourceKind", "左侧来源类型", entry.debitSourceKind, MATCH_SOURCE_OPTIONS, (value) => setEntry((current) => ({ ...current, debitSourceKind: value as EntryDraft["debitSourceKind"] }))),
        textField("debitSourceId", "左侧来源 ID", entry.debitSourceId, (value) => setEntry((current) => ({ ...current, debitSourceId: value })), { required: true }),
        textField("debitSourceFingerprint", "左侧来源指纹", entry.debitSourceFingerprint, (value) => setEntry((current) => ({ ...current, debitSourceFingerprint: value })), { required: true }),
        { key: "debitSourceAmount", label: "左侧来源金额", required: true, spec: { valueType: "number" as const, control: "number" as const, validation: { min: 0.01 } }, value: entry.debitSourceAmount || "", step: 0.01, onChange: (value: unknown) => setEntry((current) => ({ ...current, debitSourceAmount: Number(value) })) },
        choiceField("debitSourceCurrency", "左侧来源币种", entry.debitSourceCurrency, [{ value: "CNY", label: "人民币" }, { value: "CAD", label: "加拿大元" }], (value) => setEntry((current) => ({ ...current, debitSourceCurrency: value }))),
        choiceField("creditSourceKind", "右侧来源类型", entry.creditSourceKind, MATCH_SOURCE_OPTIONS, (value) => setEntry((current) => ({ ...current, creditSourceKind: value as EntryDraft["creditSourceKind"] }))),
        textField("creditSourceId", "右侧来源 ID", entry.creditSourceId, (value) => setEntry((current) => ({ ...current, creditSourceId: value })), { required: true }),
        textField("creditSourceFingerprint", "右侧来源指纹", entry.creditSourceFingerprint, (value) => setEntry((current) => ({ ...current, creditSourceFingerprint: value })), { required: true }),
        { key: "creditSourceAmount", label: "右侧来源金额", required: true, spec: { valueType: "number" as const, control: "number" as const, validation: { min: 0.01 } }, value: entry.creditSourceAmount || "", step: 0.01, onChange: (value: unknown) => setEntry((current) => ({ ...current, creditSourceAmount: Number(value) })) },
        choiceField("creditSourceCurrency", "右侧来源币种", entry.creditSourceCurrency, [{ value: "CNY", label: "人民币" }, { value: "CAD", label: "加拿大元" }], (value) => setEntry((current) => ({ ...current, creditSourceCurrency: value }))),
        textField("differenceResolution", `差额处置（系统计算 ${matchDifference.toFixed(2)}）`, entry.differenceResolution, (value) => setEntry((current) => ({ ...current, differenceResolution: value })), { required: matchDifference > 0, span: 3, multiline: true }),
      ] : []),
      choiceField("debitCompany", "借方公司", entry.debitCompanyId ? String(entry.debitCompanyId) : "", companyOptions, (value) => setEntry((current) => ({ ...current, debitCompanyId: Number(value) }))),
      choiceField("debitReport", "借方报表", entry.debitReportType, REPORT_OPTIONS, (value) => setEntry((current) => ({ ...current, debitReportType: value as StatementReportType, debitLineCode: "" }))),
      choiceField("debitLine", "借方报表项目", entry.debitLineCode, debitLineOptions, (value) => setEntry((current) => ({ ...current, debitLineCode: value }))),
      choiceField("creditCompany", "贷方公司", entry.creditCompanyId ? String(entry.creditCompanyId) : "", companyOptions, (value) => setEntry((current) => ({ ...current, creditCompanyId: Number(value) }))),
      choiceField("creditReport", "贷方报表", entry.creditReportType, REPORT_OPTIONS, (value) => setEntry((current) => ({ ...current, creditReportType: value as StatementReportType, creditLineCode: "" }))),
      choiceField("creditLine", "贷方报表项目", entry.creditLineCode, creditLineOptions, (value) => setEntry((current) => ({ ...current, creditLineCode: value }))),
      {
        key: "amount", label: "抵销金额（人民币）", required: true,
        spec: { valueType: "number", control: "number", validation: { min: 0.01 } },
        value: entry.amount || "", step: 0.01,
        onChange: (value) => setEntry((current) => ({ ...current, amount: Number(value) })),
      },
    ];
    return [
      ...(batch.status === "draft" ? [createFormSection("consolidation-entry-editor", {
        kind: "filters",
        header: { title: "编制双边抵销分录", description: requiresMatching ? "往来、交易和资金抵销必须分别绑定双方来源、来源指纹、原币金额和对方主体；系统计算差额，人工决定差额处置。" : "每笔草稿固定借贷平衡并落到规范报表行；复杂事项可拆成多笔有证据的分录。" },
        content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{ key: "save-entry", action: "save", label: "保存分录草稿", disabled: commands.busy || !capabilities.canUpdate }],
        submit: { onSubmit: () => {
          if (!entry.description.trim() || !entry.debitCompanyId || !entry.creditCompanyId || !entry.debitLineCode || !entry.creditLineCode || entry.amount <= 0) return;
          if (requiresMatching && (
            !entry.debitSourceId.trim()
            || !entry.debitSourceFingerprint.trim()
            || entry.debitSourceAmount <= 0
            || !entry.creditSourceId.trim()
            || !entry.creditSourceFingerprint.trim()
            || entry.creditSourceAmount <= 0
            || (matchDifference > 0 && !entry.differenceResolution.trim())
          )) return;
          const payload: Omit<SaveConsolidationEntryInput, "expectedRevision"> = {
            entryNo: entry.entryNo,
            entryType: entry.entryType,
            title: entry.title,
            description: entry.description,
            evidence: entry.evidence,
            matchDifference: requiresMatching ? matchDifference : null,
            differenceResolution: requiresMatching ? entry.differenceResolution : null,
            lines: [
              {
                companyId: entry.debitCompanyId, statementType: entry.debitReportType, lineCode: entry.debitLineCode, debit: entry.amount, credit: 0, currencyCode: "CNY",
                periodBasis: entry.periodBasis,
                ...(requiresMatching ? { matchSide: "left" as const, sourceKind: entry.debitSourceKind, sourceId: entry.debitSourceId, sourceFingerprint: entry.debitSourceFingerprint, sourceAmount: entry.debitSourceAmount, sourceCurrency: entry.debitSourceCurrency, counterpartyCompanyId: entry.creditCompanyId } : {}),
              },
              {
                companyId: entry.creditCompanyId, statementType: entry.creditReportType, lineCode: entry.creditLineCode, debit: 0, credit: entry.amount, currencyCode: "CNY",
                periodBasis: entry.periodBasis,
                ...(requiresMatching ? { matchSide: "right" as const, sourceKind: entry.creditSourceKind, sourceId: entry.creditSourceId, sourceFingerprint: entry.creditSourceFingerprint, sourceAmount: entry.creditSourceAmount, sourceCurrency: entry.creditSourceCurrency, counterpartyCompanyId: entry.debitCompanyId } : {}),
              },
            ],
          };
          void commands.saveEntry(payload).then((saved) => { if (saved) setEntry(defaultEntry()); });
        } },
      })] : []),
      ...(batch.status === "draft" && batch.entries.some((item) => item.status === "draft") ? [createFormSection("consolidation-entry-delete-note", {
        kind: "filters",
        header: { title: "删除草稿说明", description: "删除只适用于未提交草稿；原因和被删分录完整快照会写入批次事件。" },
        content: { items: [textField("entryDeleteNote", "删除原因", entryDeleteNote, setEntryDeleteNote, { required: true, span: 3, multiline: true })], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      })] : []),
      createPageTableSection("consolidation-entry-list", {
        rows: batch.entries,
        columns: ENTRY_COLUMNS,
        visibleColumns: ENTRY_COLUMNS.map((column) => column.key),
        rowKey: (row) => row.id,
        presentation: { density: "compact", cellWrap: "wrap" },
        rowActions: (row): DataSurfaceRowActionSpec[] => row.status === "draft" && batch.status === "draft" ? [{
          key: "delete-entry",
          kind: "delete",
          label: "删除草稿",
          disabled: commands.busy || !capabilities.canDelete || !entryDeleteNote.trim(),
          onClick: () => void commands.deleteEntry(row.id, entryDeleteNote).then((deleted) => { if (deleted) setEntryDeleteNote(""); }),
        }] : [],
        emptyText: "尚未编制抵销分录；无适用事项时需保存不适用结论",
      }),
    ];
  };

  const taxSections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return [];
    const draftEntries = batch.entries.filter((item) => item.status === "draft");
    const taxRows: TaxEffectRow[] = batch.entries.flatMap((item) => item.taxEffects.map((tax) => ({
      ...tax,
      entryId: item.id,
      entryNo: item.entryNo,
      entryTitle: item.title,
      entryStatus: item.status,
    })));
    const taxEntityOptions = batch.entities.map((entity) => ({ value: String(entity.id), label: `${entity.companyCode} · ${entity.companyName}` }));
    const taxLocationOptions = [
      { value: "profitOrLoss", label: "当期损益" },
      { value: "otherComprehensiveIncome", label: "其他综合收益" },
      { value: "equity", label: "直接计入权益" },
    ];
    const counterpartOptions = taxRecognitionLocation === "profitOrLoss"
      ? [{ value: "incomeTax", label: "所得税费用" }]
      : taxRecognitionLocation === "otherComprehensiveIncome"
        ? [{ value: "otherComprehensiveIncome", label: "其他综合收益" }]
        : [
            { value: "undistributedProfit", label: "未分配利润" },
            { value: "capitalReserve", label: "资本公积" },
            { value: "paidInCapital", label: "实收资本" },
          ];
    const balanceSheetLineCode = taxRecognition === "asset"
      ? "deferredTaxAssets"
      : taxRecognition === "liability"
        ? "deferredTaxLiabilities"
        : "";
    const fields: FormSurfaceFieldSpec[] = [
      choiceField("taxEntry", "关联抵销分录", taxEntryId ? String(taxEntryId) : "", draftEntries.map((item) => ({ value: String(item.id), label: `${item.entryNo} · ${item.title}` })), (value) => setTaxEntryId(Number(value))),
      choiceField("taxEntity", "纳税主体", taxEntitySnapshotId ? String(taxEntitySnapshotId) : "", taxEntityOptions, (value) => setTaxEntitySnapshotId(Number(value))),
      textField("taxKey", "税务影响编号", taxEffectKey, setTaxEffectKey, { required: true }),
      { key: "difference", label: "暂时性差异", required: true, spec: { valueType: "number", control: "number" }, value: taxDifference || "", step: 0.01, onChange: (value) => setTaxDifference(Number(value)) },
      { key: "taxRate", label: "适用税率（0-1）", required: true, spec: { valueType: "number", control: "number", validation: { min: 0, max: 1 } }, value: taxRate, step: 0.0001, onChange: (value) => setTaxRate(Number(value)) },
      choiceField("recognition", "确认口径", taxRecognition, [{ value: "asset", label: "递延所得税资产" }, { value: "liability", label: "递延所得税负债" }, { value: "unrecognized", label: "不确认" }], (value) => setTaxRecognition(value as typeof taxRecognition)),
      choiceField("taxPeriodBasis", "作用期间", taxPeriodBasis, [{ value: "current", label: "本期数" }, { value: "comparative", label: "比较期数" }], (value) => setTaxPeriodBasis(value as typeof taxPeriodBasis)),
      textField("taxJurisdiction", "适用税辖区", taxJurisdiction, setTaxJurisdiction, { required: true }),
      ...(taxRecognition !== "unrecognized" ? [
        choiceField("taxLocation", "计入位置", taxRecognitionLocation, taxLocationOptions, (value) => {
          const next = value as typeof taxRecognitionLocation;
          setTaxRecognitionLocation(next);
          setTaxCounterpartLineCode(next === "profitOrLoss" ? "incomeTax" : next === "otherComprehensiveIncome" ? "otherComprehensiveIncome" : "undistributedProfit");
        }),
        choiceField("taxBalanceLine", "递延税报表行", balanceSheetLineCode, [{ value: balanceSheetLineCode, label: taxRecognition === "asset" ? "递延所得税资产" : "递延所得税负债" }], () => undefined),
        choiceField("taxCounterpart", "对应损益/权益行", taxCounterpartLineCode, counterpartOptions, setTaxCounterpartLineCode),
      ] : []),
      textField("taxConclusion", "可抵扣性/转回结论", taxConclusion, setTaxConclusion, { required: true, span: 3, multiline: true }),
      textField("taxEvidence", "税率与判断依据", taxEvidence, setTaxEvidence, { required: true, span: 3, multiline: true }),
    ];
    return [
      ...(batch.status === "draft" ? [createFormSection("consolidation-tax-editor", {
        kind: "filters",
        header: { title: "记录抵销税务影响", description: "税额由暂时性差异×税率派生；人工明确纳税主体、税辖区和计入损益/OCI/权益的位置，锁定输出自动落递延税与对应行。" },
        content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{ key: "save-tax", action: "save", label: "保存税务影响", disabled: commands.busy || !capabilities.canUpdate || !taxEntryId }],
        submit: { onSubmit: () => { if (taxEntryId && taxEntitySnapshotId) void commands.saveTaxEffect(taxEntryId, {
          entitySnapshotId: taxEntitySnapshotId,
          effectKey: taxEffectKey,
          taxEffectType: taxRecognition === "liability" ? "taxable" : "deductible",
          differenceAmount: taxDifference,
          taxRate,
          recognition: taxRecognition,
          periodBasis: taxPeriodBasis,
          jurisdiction: taxJurisdiction,
          recognitionLocation: taxRecognition === "unrecognized" ? null : taxRecognitionLocation,
          balanceSheetLineCode: taxRecognition === "unrecognized" ? null : balanceSheetLineCode,
          counterpartLineCode: taxRecognition === "unrecognized" ? null : taxCounterpartLineCode,
          recoverabilityConclusion: taxConclusion,
          evidence: taxEvidence,
        }); } },
      })] : []),
      ...(batch.status === "draft" && taxRows.some((row) => row.entryStatus === "draft") ? [createFormSection("consolidation-tax-delete-note", {
        kind: "filters",
        header: { title: "删除税效说明", description: "税效草稿删除后仍保留原因和完整快照，锁定/发布批次不能删除。" },
        content: { items: [textField("taxDeleteNote", "删除原因", taxDeleteNote, setTaxDeleteNote, { required: true, span: 3, multiline: true })], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      })] : []),
      createPageTableSection("consolidation-tax-results", {
        rows: taxRows,
        columns: TAX_EFFECT_COLUMNS,
        visibleColumns: TAX_EFFECT_COLUMNS.map((column) => column.key),
        rowKey: (row) => `${row.entryId}-${row.id}`,
        presentation: { density: "compact", cellWrap: "wrap" },
        scroll: { x: true },
        rowActions: (row): DataSurfaceRowActionSpec[] => row.entryStatus === "draft" && batch.status === "draft" ? [{
          key: "delete-tax-effect",
          kind: "delete",
          label: "删除税效",
          disabled: commands.busy || !capabilities.canDelete || !taxDeleteNote.trim(),
          onClick: () => void commands.deleteTaxEffect(row.entryId, row.id, taxDeleteNote).then((deleted) => { if (deleted) setTaxDeleteNote(""); }),
        }] : [],
        emptyText: "尚未记录抵销税务影响；不适用时需保存税务控制结论",
      }),
    ];
  };

  const lifecycleSections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return createBatchSections();
    const action = nextConsolidationLifecycleAction(batch.status);
    const labels = { submit: "提交复核", review: "完成独立复核", lock: "锁定批次", publish: "发布合并报表" };
    return [
      createMessageSection("consolidation-lifecycle-status", {
        tone: batch.status === "published" ? "muted" : "warning",
        content: `批次 #${batch.id} · v${batch.version} · 修订 r${batch.revision} · ${batch.status}。每次写入都校验修订号；提交后冻结编制事实，复核人必须独立，锁定后变更只能新建版本。`,
      }),
      ...(action ? [createFormSection("consolidation-lifecycle-action", {
        kind: "filters",
        header: { title: labels[action], description: action === "review" ? "复核意见必填，且复核人不能参与当前批次编制或提交。" : undefined },
        content: { items: [textField("reviewNote", "处理意见", reviewNote, setReviewNote, { required: action === "review", span: 3, multiline: true })], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{
          key: action,
          action: action === "submit" ? "submit" : action === "review" ? "approve" : "confirm",
          label: labels[action],
          disabled: commands.busy || (action === "submit" ? !capabilities.canSubmit : action === "lock" ? !capabilities.canLock : !capabilities.canApprove),
          ...(action === "submit" ? {} : { onClick: () => void commands.advanceLifecycle(reviewNote).then((saved) => { if (saved) setReviewNote(""); }) }),
        }, ...(action === "review" ? [{
          key: "return",
          action: "reject" as const,
          label: "退回修改",
          disabled: commands.busy || !capabilities.canReject || !reviewNote.trim(),
          onClick: () => void commands.returnBatch(reviewNote).then((saved) => { if (saved) setReviewNote(""); }),
        }] : [])],
        ...(action === "submit" ? { submit: { onSubmit: () => void commands.advanceLifecycle(reviewNote).then((saved) => { if (saved) setReviewNote(""); }) } } : {}),
      })] : []),
      createPageTableSection("consolidation-batch-events", {
        rows: [...batch.events].reverse(),
        columns: EVENT_COLUMNS,
        visibleColumns: EVENT_COLUMNS.map((column) => column.key),
        rowKey: (row) => row.id,
        presentation: { density: "compact", cellWrap: "wrap" },
        scroll: { x: true },
        emptyText: "尚无批次事件",
      }),
    ];
  };

  const rateReviewSections = (): BodySurfaceSectionSpec[] => [createFormSection("exchange-rate-review-note", {
    kind: "filters",
    header: { title: "汇率独立复核", description: "先填写复核意见，再在草稿行执行复核；录入人不能复核自己的证据。" },
    content: { items: [textField("rateReviewNote", "复核意见", rateReviewNote, setRateReviewNote, { required: true, span: 3, multiline: true })], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
  })];

  const rateRowActions = (row: StatementExchangeRateSnapshot): DataSurfaceRowActionSpec[] => row.status === "draft" ? [{
    key: "review-rate",
    kind: "save",
    label: "独立复核",
    disabled: commands.busy || !capabilities.canApprove || !rateReviewNote.trim(),
    onClick: () => void commands.reviewRate(row.id, rateReviewNote).then((saved) => { if (saved) setRateReviewNote(""); }),
  }] : [];

  return {
    busy: commands.busy,
    createBatchSections,
    sourceDecisionSections,
    controlDecisionSections,
    entrySections,
    taxSections,
    lifecycleSections,
    rateReviewSections,
    rateRowActions,
  };
}
