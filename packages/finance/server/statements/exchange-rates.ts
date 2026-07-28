import type { StatementExchangeRateSnapshot } from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildRefreshStatementExchangeRateCommand,
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
        rateKind: "monthlyAverage",
        rateDate: normalizedInput.targetDate,
        sourceUrl: { contains: `endDate=${normalizedInput.targetDate}` },
      },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    });
    if (cached && chinaMoneyHistorySourceCoversTargetDate(cached.sourceUrl, normalizedInput.targetDate)) return cached;
  }
  const quote = await fetchChinaMoneyMonthlyAverage(normalizedInput);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeStatementExchangeRate.findMany({
      where: {
        baseCurrency: quote.baseCurrency,
        quoteCurrency: quote.quoteCurrency,
        rateKind: "monthlyAverage",
        rateDate: quote.rateDate,
      },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    });
    const evidence = {
      rateKind: "monthlyAverage",
      rate: quote.rate,
      sourceName: "中国外汇交易中心",
      sourceField: `${quote.sourcePair} 月平均人民币汇率中间价（每 ${quote.sourceUnit} ${quote.baseCurrency}）`,
      sourceUrl: quote.sourceUrl,
      publishedAt: new Date(`${quote.lastRateDate}T09:15:00+08:00`),
      note: `${quote.periodStartDate}至${quote.periodEndDate}共${quote.observationCount}个工作日中间价算术平均；首个牌价日${quote.firstRateDate}，末个牌价日${quote.lastRateDate}；系统归一化为1 ${quote.baseCurrency}=${quote.rate} CNY`,
    };
    if (existing[0] && isSameChinaMoneyRateEvidence(existing[0], evidence)) {
      if (existing.length > 1) {
        await tx.financeStatementExchangeRate.deleteMany({ where: { id: { in: existing.slice(1).map((item) => item.id) } } });
      }
      return existing[0];
    }
    const data = { ...evidence, capturedAt: new Date(), version: 1, updatedBy: userId };
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
