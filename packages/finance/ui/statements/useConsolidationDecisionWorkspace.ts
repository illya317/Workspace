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
  ConsolidationOverview,
} from "@workspace/finance/types";
import { useEffect, useState } from "react";

import type { ConsolidationCapabilities } from "./statement-ui-types";
import {
  CONTROL_OPTIONS,
  ENTRY_COLUMNS,
  EVENT_COLUMNS,
  TAX_EFFECT_COLUMNS,
  choiceField,
  textField,
  type TaxEffectRow,
} from "./consolidation-decision-presenters";
import {
  nextConsolidationLifecycleAction,
  type CapitalRatePolicyDrafts,
  type CurrencyPolicyDrafts,
  type InvestmentEntitySelections,
} from "./consolidation-workbench-model";
import { buildConsolidationSourceDecisionSections } from "./consolidation-source-decision-sections";
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
  const [capitalRatePolicies, setCapitalRatePolicies] = useState<CapitalRatePolicyDrafts>({});
  const [controlKey, setControlKey] = useState<ConsolidationControlKey>("scope");
  const [decision, setDecision] = useState<"completed" | "notApplicable">("completed");
  const [conclusion, setConclusion] = useState("");
  const [decisionEvidence, setDecisionEvidence] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [entryDeleteNote, setEntryDeleteNote] = useState("");
  const [taxDeleteNote, setTaxDeleteNote] = useState("");
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
    const savedCapitalByEntityId = new Map<number, CapitalRatePolicyDrafts[number]>();
    for (const rate of batch.exchangeRates) {
      for (const application of rate.applications) {
        if (application.applicationType === "historicalInvestment" && application.voucherItemId !== null) {
          savedByVoucherItemId.set(application.voucherItemId, application.entitySnapshotId);
        }
        if (application.applicationType === "historicalCapital" && application.periodBasis === "current") {
          savedCapitalByEntityId.set(application.entitySnapshotId, {
            exchangeRateId: rate.exchangeRateId,
            contributionDate: application.targetDate,
            originalAmount: application.capitalOriginalAmount ?? 0,
            evidence: application.evidence,
          });
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
    setCapitalRatePolicies((current) => Object.fromEntries(batch.entities.map((entity) => [
      entity.id,
      current[entity.id] ?? savedCapitalByEntityId.get(entity.id) ?? {
        exchangeRateId: null,
        contributionDate: "",
        originalAmount: 0,
        evidence: "",
      },
    ])));
  }, [data?.batch, data?.fxPolicy.investmentEvidence]);

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

  const sourceDecisionSections = () => buildConsolidationSourceDecisionSections({
    data,
    canUpdate: capabilities.canUpdate,
    busy: commands.busy,
    systemEvidence,
    setSystemEvidence,
    currencyPolicies,
    setCurrencyPolicies,
    investmentEntitySelections,
    setInvestmentEntitySelections,
    capitalRatePolicies,
    setCapitalRatePolicies,
    notifyError: commands.notifyError,
    saveSources: commands.saveSources,
  });

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
      header: { title: selectedKey.startsWith("elimination:") ? "无适用抵销事项" : "记录人工判断", description: "“不适用”不能空口跳过，必须写清事实和证据；客观阻断仍由系统事实校验。" },
      content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      actions: [{ key: "save-decision", action: "save", label: "保存判断", disabled: commands.busy || !capabilities.canUpdate }],
      submit: { onSubmit: () => void commands.saveDecision({ controlKey: selectedKey, decision, conclusion, evidence: decisionEvidence }) },
    })];
  };

  const entrySections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return [];
    return [
      ...(batch.status === "draft" ? [createFormSection("consolidation-entry-generate", {
        kind: "filters",
        header: {
          title: "自动生成抵销分录",
          description: "按已绑定集团公司的双方凭证明细生成；支持多笔对多笔，净额一致才生成草稿，凭证摘要不参与公司识别。",
        },
        content: { items: [], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{
          key: "generate-entries",
          action: "create",
          label: commands.busy ? "正在生成…" : "从凭证明细生成",
          disabled: commands.busy || !capabilities.canUpdate,
          onClick: () => void commands.generateEntries(),
        }],
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
        emptyText: "暂无抵销分录",
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
        }, ...(action === "review" || action === "lock" ? [{
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

  return {
    busy: commands.busy,
    createBatchSections,
    sourceDecisionSections,
    controlDecisionSections,
    entrySections,
    taxSections,
    lifecycleSections,
  };
}
