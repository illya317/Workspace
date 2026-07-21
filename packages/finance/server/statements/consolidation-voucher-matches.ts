import { createHash } from "node:crypto";

import {
  buildIntercompanyVoucherMatchGroups,
  buildInvestmentVoucherMatchGroups,
  type ConsolidationVoucherMatchFact,
} from "../domain/consolidation-entry-generation";
import { prisma } from "@workspace/platform/server/prisma";
import { buildFixedBalanceAssignments } from "./config/fixed-balance-definition";
import type { ConsolidationBatchRow } from "./consolidation-dto";
import { resolveMappedLineCode } from "./shared/mapping-resolver";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reportPayloadLines(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envelope = value as Record<string, unknown>;
  const payloadValue = envelope.payload ?? envelope;
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) return [];
  const payload = payloadValue as Record<string, unknown>;
  return [payload.assets, payload.liabilities, payload.equity]
    .flatMap((part) => Array.isArray(part) ? part : [])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function isInvestmentLine(lineCode: string | null) {
  return lineCode === "longTermInvest" || lineCode === "otherEquityInvest";
}

function isEquityLine(lineCode: string | null) {
  return lineCode === "paidInCapital" || lineCode === "capitalReserve";
}

export async function loadConsolidationVoucherMatchGroups(batch: ConsolidationBatchRow) {
  const entities = batch.entities.filter((entity) => entity.isConsolidated);
  const entityByCompanyId = new Map(entities.map((entity) => [entity.companyId, entity]));
  const entityByCompanyCode = new Map(entities.map((entity) => [entity.companyCode, entity]));
  const companyIds = [...entityByCompanyId.keys()];
  const companyCodes = [...entityByCompanyCode.keys()];
  const frozenLines = new Map<number, Set<string>>();
  for (const source of batch.sources) {
    if (source.reportType !== "balanceSheet") continue;
    frozenLines.set(source.entitySnapshotId, new Set(reportPayloadLines(source.reportPayload)
      .map((line) => typeof line.lineCode === "string" ? line.lineCode : null)
      .filter((line): line is string => Boolean(line))));
  }
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode: { in: companyCodes },
        date: { lte: periodEndDate(batch.year, batch.month) },
        status: "posted",
        OR: [{ sourceInvalid: false }, { sourceInvalid: null }],
      },
      OR: [
        { auxiliaryLinks: { some: { member: { linkedCompanyId: { in: companyIds } } } } },
        { account: { OR: [
          { code: { startsWith: "1511" } }, { code: { startsWith: "1512" } },
          { code: { startsWith: "4001" } }, { code: { startsWith: "4002" } },
          { code: { startsWith: "3001" } }, { code: { startsWith: "3002" } },
          { name: { contains: "长期股权投资" } }, { name: { contains: "实收资本" } },
          { name: { contains: "股本" } }, { name: { contains: "资本公积" } },
        ] } },
      ],
    },
    include: {
      voucher: { select: {
        id: true, voucherNo: true, date: true, companyCode: true,
        sourceSystem: true, sourceDatabase: true, sourceKey: true,
      } },
      account: { select: { code: true, name: true } },
      auxiliaryLinks: {
        where: { member: { linkedCompanyId: { in: companyIds } } },
        select: { member: { select: { linkedCompanyId: true } } },
      },
    },
    orderBy: [{ voucher: { date: "asc" } }, { voucherId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const { mappingMap } = buildFixedBalanceAssignments();
  const intercompanyFacts: ConsolidationVoucherMatchFact[] = [];
  const investmentFacts: ConsolidationVoucherMatchFact[] = [];
  for (const item of items) {
    const entity = entityByCompanyCode.get(item.voucher.companyCode);
    if (!entity) continue;
    const mappedLine = resolveMappedLineCode(item.account.code, new Map(), mappingMap);
    const lineCode = mappedLine && frozenLines.get(entity.id)?.has(mappedLine) ? mappedLine : null;
    const counterparties = [...new Set(item.auxiliaryLinks
      .map((link) => link.member.linkedCompanyId)
      .filter((id): id is number => id !== null && id !== entity.companyId))];
    const counterpartyCompanyId = counterparties.length === 1 ? counterparties[0]! : null;
    const fact: ConsolidationVoucherMatchFact = {
      itemId: item.id,
      voucherId: item.voucherId,
      voucherNo: item.voucher.voucherNo,
      voucherDate: item.voucher.date,
      companyId: entity.companyId,
      counterpartyCompanyId,
      accountCode: item.account.code,
      accountName: item.account.name,
      description: item.description,
      lineCode,
      signedAmount: Math.round((Number(item.debit) - Number(item.credit)) * 100) / 100,
      currencyCode: entity.functionalCurrency || "CNY",
      sourceFingerprint: fingerprint({
        itemId: item.id,
        sourceSystem: item.sourceSystem,
        sourceDatabase: item.sourceDatabase,
        sourceKey: item.sourceKey,
        importFingerprint: item.importFingerprint,
        voucherSource: [item.voucher.sourceSystem, item.voucher.sourceDatabase, item.voucher.sourceKey],
        debit: item.debit,
        credit: item.credit,
        lineCode,
        counterparties,
      }),
    };
    if (counterpartyCompanyId) intercompanyFacts.push(fact);
    if (isInvestmentLine(mappedLine)) investmentFacts.push({ ...fact, investmentRole: "investment" });
    if (isEquityLine(mappedLine)) investmentFacts.push({ ...fact, investmentRole: "equity" });
  }
  const parent = entities.find((entity) => entity.role === "parent");
  const subsidiaries = entities.filter((entity) => entity.role === "subsidiary");
  return [
    ...buildIntercompanyVoucherMatchGroups(intercompanyFacts),
    ...(parent ? buildInvestmentVoucherMatchGroups(
      investmentFacts,
      parent.companyId,
      subsidiaries.map((entity) => entity.companyId),
    ) : []),
  ];
}
