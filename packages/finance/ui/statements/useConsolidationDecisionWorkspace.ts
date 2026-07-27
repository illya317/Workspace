"use client";

import {
  createFormSection,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceRowActionSpec,
  type FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useEffect, useState } from "react";

import type { ConsolidationCapabilities } from "./statement-ui-types";
import {
  EVENT_COLUMNS,
  TAX_EFFECT_COLUMNS,
  choiceField,
  textField,
  type TaxEffectRow,
} from "./consolidation-decision-presenters";
import {
  nextConsolidationLifecycleAction,
} from "./consolidation-workbench-model";
import { useConsolidationCommands } from "./useConsolidationCommands";

export function useConsolidationDecisionWorkspace(input: {
  data: ConsolidationOverview | null;
  capabilities: ConsolidationCapabilities;
  onRefresh: (freshBatch?: NonNullable<ConsolidationOverview["batch"]>) => void;
  onBatchDeleted: () => void;
}) {
  const { capabilities, data, onRefresh, onBatchDeleted } = input;
  const commands = useConsolidationCommands(data, onRefresh, onBatchDeleted);
  const [returnReason, setReturnReason] = useState("");
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
    const firstDraft = data?.batch?.entries.find((item) => item.status === "draft");
    setTaxEntryId((current) => current ?? firstDraft?.id ?? null);
    setTaxEntitySnapshotId((current) => current ?? entities[0]?.id ?? null);
  }, [data?.batch?.entities, data?.batch?.entries]);

  const preparationSections = (onWorkpaperBuilt: () => void): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch && !data?.batchCreation.allowed) {
      return [createStatusSection("consolidation-preparation-unavailable", {
        kind: "empty",
        content: `当前合并范围尚未就绪：${data?.batchCreation.unavailableReasons.join("；") || "请先维护并表公司关系"}`,
      })];
    }
    if (batch && batch.status !== "draft") return [];
    const sourcesReady = Boolean(data?.metrics.totalSources
      && data.metrics.coveredSources === data.metrics.totalSources);
    const canSubmit = sourcesReady
      && (batch ? capabilities.canUpdate : capabilities.canCreate && capabilities.canUpdate);
    return [createFormSection("consolidation-preparation-submit", {
      kind: "filters",
      header: {
        title: "提交合并准备",
        description: sourcesReady
          ? "全部单体报表已就绪。提交后系统会保存来源与汇率证据、生成合并凭证，并直接进入合并工作底稿。"
          : `全部单体报表就绪后才能生成工作底稿；当前已就绪 ${data?.metrics.coveredSources ?? 0}/${data?.metrics.totalSources ?? 0} 份。`,
      },
      content: { items: [], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
      actions: [{
        key: "complete-preparation",
        action: "submit",
        label: commands.busy ? "正在生成…" : "生成合并工作底稿",
        disabled: commands.busy || !canSubmit,
        onClick: () => void (batch ? commands.completePreparation() : commands.ensureBatch()).then((saved) => {
          if (saved) onWorkpaperBuilt();
        }),
      }, ...(batch ? [{
        key: "delete-batch",
        action: "delete" as const,
        label: "删除草稿",
        disabled: commands.busy || !capabilities.canDelete,
        onClick: () => void commands.deleteBatch(),
      }] : [])],
    })];
  };

  const confirmNoElimination = (key: "investment-equity" | "intercompany-balances", label: string) => commands.saveDecision({
    mode: "notApplicable",
    controlKey: key === "investment-equity" ? "elimination:investmentEquity" : "elimination:intercompanyBalance",
    conclusion: `${label}：本期无适用事项`,
    evidence: "系统未形成该类双方匹配事项；编制人已核对抵销项目清单并确认本期无适用事项",
  });

  const taxSections = (): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return [];
    const draftEntries = batch.entries.filter((item) => item.status === "draft");
    const taxRows: TaxEffectRow[] = batch.entries.flatMap((item) => item.taxEffects.map((tax) => ({
      ...tax,
      entryId: item.id,
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
      choiceField("taxEntry", "关联抵销分录", taxEntryId ? String(taxEntryId) : "", draftEntries.map((item) => ({ value: String(item.id), label: item.title })), (value) => setTaxEntryId(Number(value))),
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

  const lifecycleSections = (onConfirmed?: () => void): BodySurfaceSectionSpec[] => {
    const batch = data?.batch;
    if (!batch) return [];
    const action = nextConsolidationLifecycleAction(batch.status);
    const labels = {
      submit: "提交复核",
      review: "完成独立复核",
      lock: batch.status === "draft" ? "确认工作底稿并生成合并报表" : "锁定批次",
      publish: "发布合并报表",
    };
    return [
      ...(action ? [createFormSection("consolidation-lifecycle-action", {
        kind: "filters",
        header: {
          title: labels[action],
          description: action === "review"
            ? "复核人必须独立于当前批次编制人与提交人。"
            : batch.status === "draft"
              ? "确认后系统批准当前合并凭证、冻结工作底稿，并直接生成合并报表。"
              : undefined,
        },
        content: { items: action === "review" || action === "lock" ? [textField("returnReason", "仅退回时填写原因", returnReason, setReturnReason, { span: 3 })] : [], layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{
          key: action,
          action: action === "submit" ? "submit" : action === "review" ? "approve" : "confirm",
          label: labels[action],
          disabled: commands.busy
            || (action === "submit" ? !capabilities.canSubmit : action === "lock" ? !capabilities.canLock : !capabilities.canApprove),
          onClick: () => void commands.advanceLifecycle().then((saved) => {
            if (saved && action === "lock") onConfirmed?.();
          }),
        }, ...(batch.status === "draft" ? [{
          key: "delete-batch",
          action: "delete" as const,
          label: "删除草稿",
          disabled: commands.busy || !capabilities.canDelete,
          onClick: () => void commands.deleteBatch(),
        }] : []), ...(action === "review" || action === "lock" ? [{
          key: "return",
          action: "reject" as const,
          label: "退回修改",
          disabled: commands.busy || !capabilities.canReject || !returnReason.trim(),
          onClick: () => void commands.returnBatch(returnReason).then((saved) => { if (saved) setReturnReason(""); }),
        }] : [])],
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
    reviewEntries: commands.reviewEntries,
    preparationSections,
    confirmNoElimination,
    taxSections,
    lifecycleSections,
  };
}
