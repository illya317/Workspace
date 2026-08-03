import type { StatementExchangeRateSnapshot } from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildCapitalHistoricalAmountRateCommand,
  buildMonthlyAverageExchangeRateCommand,
  buildRefreshStatementExchangeRateCommand,
  buildVoucherHistoricalInvestmentRateCommand,
  type RefreshStatementExchangeRateCommand,
} from "../domain/statement-exchange-rate-validation";
import {
  ChinaMoneyRateError,
  fetchChinaMoneyCentralParity,
  fetchChinaMoneyMonthlyAverage,
} from "./chinamoney-exchange-rates";
import {
  chinaMoneyHistorySourceCoversTargetDate,
  isSameChinaMoneyRateEvidence,
} from "./chinamoney-rate-evidence";

export function statementExchangeRateSnapshot(row: {
  id: number;
  version: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: string;
  rateDate: string;
  rate: { toString(): string };
  sourceName: string;
  sourceField: string;
  sourceUrl: string;
  publishedAt: Date | null;
  capturedAt: Date;
  note: string | null;
  updatedBy: number | null;
}): StatementExchangeRateSnapshot {
  return {
    id: row.id,
    version: row.version,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rateKind: row.rateKind as StatementExchangeRateSnapshot["rateKind"],
    rateDate: row.rateDate,
    rate: Number(row.rate.toString()),
    sourceName: row.sourceName,
    sourceField: row.sourceField,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    capturedAt: row.capturedAt.toISOString(),
    note: row.note,
    updatedBy: row.updatedBy,
  };
}

export async function ensureCapitalHistoricalAmountRate(input: {
  sourceKind: "accountBalance" | "voucherItem";
  sourceRecordId: number;
  evidenceDate: string;
  originalCurrency: string;
  originalAmount: number;
  historicalAmountCny: number;
  evidence: string;
  userId: number;
}) {
  const validated = buildCapitalHistoricalAmountRateCommand(input, input.userId);
  if (!validated.ok) throw new ChinaMoneyRateError(validated.issue.message, validated.issue.status);
  const command = validated.data;
  const version = command.sourceRecordId * 2 + (command.sourceKind === "voucherItem" ? 1 : 0);
  const unique = {
    baseCurrency: command.currencyCode,
    quoteCurrency: "CNY",
    rateKind: "historicalCapitalAmount",
    rateDate: command.evidenceDate,
    version,
  };
  return prisma.financeStatementExchangeRate.upsert({
    where: { baseCurrency_quoteCurrency_rateKind_rateDate_version: unique },
    create: {
      ...unique,
      rate: command.weightedRate,
      sourceName: "受控历史资本证据",
      sourceField: "历史折算人民币金额",
      sourceUrl: `workspace://finance/${command.sourceKind}/${command.sourceRecordId}/capital-historical-amount`,
      note: `${command.evidence}；${command.originalAmount} ${command.currencyCode} 对应 ${command.historicalAmountCny} CNY；加权汇率由金额反算`,
      updatedBy: command.userId,
    },
    update: {
      rate: command.weightedRate,
      sourceName: "受控历史资本证据",
      sourceField: "历史折算人民币金额",
      sourceUrl: `workspace://finance/${command.sourceKind}/${command.sourceRecordId}/capital-historical-amount`,
      note: `${command.evidence}；${command.originalAmount} ${command.currencyCode} 对应 ${command.historicalAmountCny} CNY；加权汇率由金额反算`,
      capturedAt: new Date(),
      updatedBy: command.userId,
    },
  });
}

export async function ensureChinaMoneyCentralParityRate(input: {
  currencyCode: string;
  targetDate: string;
  userId: number;
  forceRefresh?: boolean;
}) {
  const validated = buildRefreshStatementExchangeRateCommand(input, input.userId);
  if (!validated.ok) throw new ChinaMoneyRateError(validated.issue.message, validated.issue.status);
  const { input: normalizedInput, userId } = validated.data;
  if (!input.forceRefresh) {
    const cached = await prisma.financeStatementExchangeRate.findFirst({
      where: {
        baseCurrency: normalizedInput.currencyCode,
        quoteCurrency: "CNY",
        rateKind: "centralParity",
        rateDate: { lte: normalizedInput.targetDate },
        sourceUrl: { contains: `endDate=${normalizedInput.targetDate}` },
      },
      orderBy: [{ rateDate: "desc" }, { capturedAt: "desc" }, { id: "desc" }],
    });
    if (cached && chinaMoneyHistorySourceCoversTargetDate(cached.sourceUrl, normalizedInput.targetDate)) {
      return cached;
    }
  }
  const quote = await fetchChinaMoneyCentralParity(normalizedInput);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeStatementExchangeRate.findMany({
      where: {
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        rateKind: "centralParity",
        rateDate: quote.rateDate,
      },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    });
    const evidence = {
      rateKind: "centralParity",
      rate: quote.rate,
      sourceName: "中国外汇交易中心",
      sourceField: `${quote.sourcePair} 人民币汇率中间价（每 ${quote.sourceUnit} ${quote.baseCurrency}）`,
      sourceUrl: quote.sourceUrl,
      publishedAt: new Date(`${quote.rateDate}T09:15:00+08:00`),
      note: `原始报价 ${quote.sourcePair}=${quote.price}；系统归一化为 1 ${quote.baseCurrency}=${quote.rate} CNY`,
    };
    if (existing[0] && isSameChinaMoneyRateEvidence(existing[0], evidence)) {
      if (existing.length > 1) {
        await tx.financeStatementExchangeRate.deleteMany({ where: { id: { in: existing.slice(1).map((item) => item.id) } } });
      }
      return existing[0];
    }
    const data = {
      ...evidence,
      capturedAt: new Date(),
      version: 1,
      updatedBy: userId,
    };
    if (existing[0]) {
      const row = await tx.financeStatementExchangeRate.update({ where: { id: existing[0].id }, data });
      if (existing.length > 1) {
        await tx.financeStatementExchangeRate.deleteMany({ where: { id: { in: existing.slice(1).map((item) => item.id) } } });
      }
      return row;
    }
    return tx.financeStatementExchangeRate.create({
      data: {
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        rateDate: quote.rateDate,
        ...data,
      },
    });
  });
}

export async function ensureChinaMoneyMonthlyAverageRate(input: {
  currencyCode: string;
  year: number;
  month: number;
  userId: number;
}) {
  const validated = buildMonthlyAverageExchangeRateCommand(input, input.userId);
  if (!validated.ok) throw new ChinaMoneyRateError(validated.issue.message, validated.issue.status);
  const command = validated.data;
  const rateDate = new Date(Date.UTC(command.year, command.month, 0)).toISOString().slice(0, 10);
  const cached = await prisma.financeStatementExchangeRate.findFirst({
    where: {
      baseCurrency: command.currencyCode,
      quoteCurrency: "CNY",
      rateKind: "monthlyAverage",
      rateDate,
    },
    orderBy: [{ version: "desc" }, { capturedAt: "desc" }, { id: "desc" }],
  });
  if (cached) return cached;
  const quote = await fetchChinaMoneyMonthlyAverage({
    currencyCode: command.currencyCode,
    year: command.year,
    month: command.month,
  });
  return prisma.financeStatementExchangeRate.create({
    data: {
      baseCurrency: quote.baseCurrency,
      quoteCurrency: quote.quoteCurrency,
      rateKind: "monthlyAverage",
      rateDate: quote.rateDate,
      rate: quote.rate,
      sourceName: "中国外汇交易中心",
      sourceField: `${quote.sourcePair} 人民币汇率中间价月度算术平均（每 ${quote.sourceUnit} ${quote.baseCurrency}）`,
      sourceUrl: quote.sourceUrl,
      publishedAt: null,
      capturedAt: new Date(),
      note: JSON.stringify({
        month: quote.month,
        observationCount: quote.observations.length,
        observations: quote.observations,
      }),
      version: 1,
      updatedBy: command.userId,
    },
  });
}

export async function ensureVoucherHistoricalInvestmentRate(input: {
  voucherItemId: number;
  contributionDate: string;
  rate: number;
  matchingLabel: string;
  userId: number;
}) {
  const validated = buildVoucherHistoricalInvestmentRateCommand(input, input.userId);
  if (!validated.ok) throw new ChinaMoneyRateError(validated.issue.message, validated.issue.status);
  const command = validated.data;
  const existing = await prisma.financeStatementExchangeRate.findMany({
    where: {
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "historicalInvestment",
      rateDate: command.contributionDate,
    },
    orderBy: [{ version: "desc" }, { id: "desc" }],
  });
  const sameRate = existing.find((row) => Number(row.rate) === command.rate);
  if (sameRate) return sameRate;
  return prisma.financeStatementExchangeRate.create({
    data: {
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "historicalInvestment",
      rateDate: command.contributionDate,
      rate: command.rate,
      sourceName: "Workspace 合并凭证",
      sourceField: "凭证匹配历史折算率",
      sourceUrl: `workspace://finance/voucher-items/${command.voucherItemId}`,
      publishedAt: null,
      capturedAt: new Date(),
      note: `匹配：${command.matchingLabel}`,
      version: (existing[0]?.version ?? 0) + 1,
      updatedBy: command.userId,
    },
  });
}

export async function refreshStatementExchangeRate(command: RefreshStatementExchangeRateCommand) {
  const validated = buildRefreshStatementExchangeRateCommand(command.input, command.userId);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const { input, userId } = validated.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.exchangeRate.save",
    actorUserId: userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "汇率自动刷新已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;
  try {
    const row = await ensureChinaMoneyCentralParityRate({ ...input, userId, forceRefresh: true });
    return serviceOk({ rate: statementExchangeRateSnapshot(row) });
  } catch (cause) {
    if (cause instanceof ChinaMoneyRateError) {
      return serviceError(cause.message, cause.status, { retryable: true });
    }
    throw cause;
  }
}
