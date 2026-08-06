import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import type { RemittanceFxEntryLine } from "./consolidation-remittance-fx-types";
import {
  allocateEquityAmount,
  equityMoney as money,
} from "./consolidation-equity-continuity-ledger";
import { buildConsolidationPreviewPackage } from "./consolidation-replay";
import { translateSourceLines } from "./consolidated-output-translation";

const COMPONENTS = [
  "otherEquityInstruments",
  "otherComprehensiveIncome",
  "surplusReserve",
  "undistributedProfit",
  "treasuryStock",
] as const;
type Component = typeof COMPONENTS[number];

const ACCOUNT_CODES: Record<Component, string> = {
  otherEquityInstruments: "4004",
  otherComprehensiveIncome: "4003/4005",
  surplusReserve: "4101",
  undistributedProfit: "4104/310415",
  treasuryStock: "4006",
};

interface ConsolidationCutoverBaseline {
  baselineDate: string;
  parentCompanyCode: string;
  parentLongTermInvestmentAmount: number;
  historicalDifferenceLineCode: string;
  components: { lineCode: string; amount: number }[];
  amountExplanations: Array<{
    key: string;
    classification: "parentInvestmentOpeningAdjustment";
    targetAmount: string;
    outputFingerprint: string;
    evidence: Array<{
      evidenceId: string;
      sourceRecordId: string;
      sourceFingerprint: string;
      label: string;
    }>;
  }>;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function translatedEquityAmounts(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  functionalCurrency: string,
) {
  if (!Array.isArray(batch.entries) || !Array.isArray(batch.controlDecisions) || !Array.isArray(batch.events)) return null;
  const source = (batch.sources ?? []).find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "balanceSheet"
  ));
  const envelope = record(source?.reportPayload);
  const payload = record(envelope?.payload ?? envelope);
  const rows = payload
    ? [payload.assets, payload.liabilities, payload.equity].flatMap((value) => Array.isArray(value) ? value : [])
    : [];
  if (!source || rows.length === 0) return null;
  const translated = translateSourceLines(
    buildConsolidationPreviewPackage(batch), entitySnapshotId, functionalCurrency,
    "balanceSheet", source.reportPayload, rows, batch.priorReferences,
  );
  return translated.ok
    ? new Map(translated.data.map((line) => [line.lineCode, {
        amount: line.amount,
        previousAmount: line.previousAmount,
      }] as const))
    : null;
}

export function priorEquityAmounts(batch: ConsolidationBatchSnapshot, companyId: number) {
  const lines = batch.priorReferences?.yearOpening?.companies[companyId]?.balanceSheet ?? [];
  return new Map(lines.map((line) => [line.lineCode, line.cnyAmount] as const));
}

export function monthOpeningEquityAmounts(batch: ConsolidationBatchSnapshot, companyId: number) {
  const lines = batch.priorReferences?.monthOpening?.companies[companyId]?.balanceSheet ?? [];
  return new Map(lines.map((line) => [line.lineCode, line.cnyAmount] as const));
}

export function consolidationCutoverBaseline(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
): ConsolidationCutoverBaseline | null {
  const source = (batch.sources ?? []).find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "balanceSheet"
  ));
  const envelope = record(source?.reportPayload);
  const translationFacts = record(envelope?.translationFacts);
  const baseline = record(translationFacts?.consolidationCutoverBaseline);
  const components = Array.isArray(baseline?.equityComponents)
    ? baseline.equityComponents.flatMap((value) => {
        const item = record(value);
        return typeof item?.lineCode === "string" && typeof item.amount === "number"
          ? [{ lineCode: item.lineCode, amount: money(item.amount) }]
          : [];
      })
    : [];
  const amountExplanations = Array.isArray(baseline?.amountExplanations)
    ? baseline.amountExplanations.flatMap((value) => {
        const item = record(value);
        const evidence = Array.isArray(item?.evidence)
          ? item.evidence.flatMap((candidate) => {
              const ref = record(candidate);
              return typeof ref?.evidenceId === "string"
                && typeof ref.sourceRecordId === "string"
                && typeof ref.sourceFingerprint === "string"
                && typeof ref.label === "string"
                ? [{
                    evidenceId: ref.evidenceId,
                    sourceRecordId: ref.sourceRecordId,
                    sourceFingerprint: ref.sourceFingerprint,
                    label: ref.label,
                  }]
                : [];
            })
          : [];
        return typeof item?.key === "string"
          && item.classification === "parentInvestmentOpeningAdjustment"
          && typeof item.targetAmount === "string"
          && typeof item.outputFingerprint === "string"
          && evidence.length > 0
          ? [{
              key: item.key,
              classification: "parentInvestmentOpeningAdjustment" as const,
              targetAmount: item.targetAmount,
              outputFingerprint: item.outputFingerprint,
              evidence,
            }]
          : [];
      })
    : [];
  return typeof baseline?.baselineDate === "string"
    && typeof baseline.parentCompanyCode === "string"
    && typeof baseline.parentLongTermInvestmentAmount === "number"
    && typeof baseline.historicalDifferenceLineCode === "string"
    && components.length > 0
    ? {
        baselineDate: baseline.baselineDate,
        parentCompanyCode: baseline.parentCompanyCode,
        parentLongTermInvestmentAmount: money(baseline.parentLongTermInvestmentAmount),
        historicalDifferenceLineCode: baseline.historicalDifferenceLineCode,
        components,
        amountExplanations,
      }
    : null;
}

export function openingEquityAmounts(
  batch: ConsolidationBatchSnapshot,
  entity: ConsolidationBatchSnapshot["entities"][number],
) {
  const baseline = consolidationCutoverBaseline(batch, entity.id);
  if (baseline) return new Map(baseline.components.map((item) => [item.lineCode, item.amount] as const));
  const prior = priorEquityAmounts(batch, entity.companyId);
  if (prior.size > 0) return prior;
  const translated = translatedEquityAmounts(batch, entity.id, entity.functionalCurrency ?? "CNY");
  return new Map([...(translated?.entries() ?? [])].map(([lineCode, amounts]) => (
    [lineCode, amounts.previousAmount] as const
  )));
}

export function consolidationCutoverDate(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
) {
  const baselineDate = consolidationCutoverBaseline(batch, entitySnapshotId)?.baselineDate;
  if (typeof baselineDate === "string") return nextDate(baselineDate);
  const source = (batch.sources ?? []).find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "balanceSheet"
  ));
  const envelope = record(source?.reportPayload);
  const translationFacts = record(envelope?.translationFacts);
  const opening = record(translationFacts?.retainedEarningsOpening);
  const openingDate = typeof opening?.openingDate === "string" ? opening.openingDate : "";
  return nextDate(openingDate);
}

function nextDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return next.toISOString().slice(0, 10);
}

function creditSideAmounts(delta: number) {
  const amount = money(delta);
  return amount >= 0
    ? { debit: 0, credit: amount }
    : { debit: Math.abs(amount), credit: 0 };
}

function openingAllocationLines(input: {
  lineNo: number;
  amount: number;
  lineCode: Component;
  entity: ConsolidationBatchSnapshot["entities"][number];
  investor: ConsolidationBatchSnapshot["entities"][number];
  minorityRatio: number;
  generationKey: string;
  note: string;
}): RemittanceFxEntryLine[] {
  const amount = money(input.amount);
  if (Math.abs(amount) < 0.005) return [];
  const { parent: parentAmount, nci: minorityAmount } = allocateEquityAmount(
    amount,
    1 - input.minorityRatio,
  );
  const sourceFingerprint = fingerprint({
    version: "opening-equity-component-v1",
    amount,
    lineCode: input.lineCode,
    entitySnapshotId: input.entity.id,
    investorSnapshotId: input.investor.id,
    minorityRatio: input.minorityRatio,
    generationKey: input.generationKey,
    note: input.note,
  });
  const common = {
    entitySnapshotId: input.entity.id,
    companyId: input.entity.companyId,
    companyCode: input.entity.companyCode,
    statementType: "balanceSheet" as const,
    currencyCode: "CNY" as const,
    periodBasis: "current" as const,
    sourceKind: "workpaper" as const,
    sourceFingerprint,
    sourceCurrency: "CNY",
    counterpartyEntitySnapshotId: input.investor.id,
    counterpartyCompanyId: input.investor.companyId,
  };
  const component = {
    lineCode: input.lineCode,
    accountCode: ACCOUNT_CODES[input.lineCode],
  };
  return [{
    lineNo: input.lineNo,
    ...common,
    ...component,
    ...creditSideAmounts(-amount),
    note: `${input.note}；全额抵销期初权益项目`,
    matchSide: "right" as const,
    sourceId: `${input.generationKey}:component:opening:eliminate:${input.lineCode}`,
    sourceAmount: Math.abs(amount),
  }, {
    lineNo: input.lineNo + 1,
    ...common,
    ...component,
    ...creditSideAmounts(parentAmount),
    note: `${input.note}；归母份额按原权益项目承接`,
    matchSide: null,
    sourceId: `${input.generationKey}:component:opening:parent:${input.lineCode}`,
    sourceAmount: Math.abs(parentAmount),
  }, {
    lineNo: input.lineNo + 2,
    ...common,
    lineCode: "nonControllingInterests",
    accountCode: "410401",
    ...creditSideAmounts(minorityAmount),
    note: `${input.note}；少数股东份额转至少数股东权益`,
    matchSide: null,
    sourceId: `${input.generationKey}:nci:opening:${input.lineCode}`,
    sourceAmount: Math.abs(minorityAmount),
  }];
}

export function nonCapitalNciAllocationLines(input: {
  batch: ConsolidationBatchSnapshot;
  entity: ConsolidationBatchSnapshot["entities"][number];
  investor: ConsolidationBatchSnapshot["entities"][number];
  minorityRatio: number;
  generationKey: string;
  lineNo: number;
}) {
  const prior = priorEquityAmounts(input.batch, input.entity.companyId);
  const baseline = consolidationCutoverBaseline(input.batch, input.entity.id);
  const opening = openingEquityAmounts(input.batch, input.entity);
  const current = translatedEquityAmounts(input.batch, input.entity.id, input.entity.functionalCurrency ?? "CNY");
  const hasControlledOpening = Boolean(baseline) || prior.size > 0;
  if (!hasControlledOpening && !current) return [];
  const lines: RemittanceFxEntryLine[] = [];
  for (const lineCode of COMPONENTS) {
    const openingComponent = hasControlledOpening
      ? opening.get(lineCode) ?? 0
      : current?.get(lineCode)?.previousAmount ?? 0;
    lines.push(...openingAllocationLines({
      ...input,
      lineNo: input.lineNo + lines.length,
      amount: openingComponent,
      lineCode,
      note: hasControlledOpening
        ? `${lineCode} 上期已锁定折算金额；少数股东比例 ${(input.minorityRatio * 100).toFixed(2)}%`
        : `${lineCode} 首次并表期初折算金额；少数股东比例 ${(input.minorityRatio * 100).toFixed(2)}%`,
    }));
  }
  return lines;
}
