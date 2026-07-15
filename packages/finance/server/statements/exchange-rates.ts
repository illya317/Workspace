import type { StatementExchangeRateSnapshot } from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildSaveStatementExchangeRateCommand,
  type SaveStatementExchangeRateCommand,
} from "../domain/statement-exchange-rate-validation";

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
  status: string;
  note: string | null;
  updatedBy: number | null;
  verifiedBy: number | null;
  verifiedAt: Date | null;
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
    status: row.status as StatementExchangeRateSnapshot["status"],
    note: row.note,
    updatedBy: row.updatedBy,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

export async function saveStatementExchangeRate(command: SaveStatementExchangeRateCommand) {
  const validated = buildSaveStatementExchangeRateCommand(command.input, command.userId);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const { input, userId } = validated.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.exchangeRate.save",
    actorUserId: userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "汇率证据保存已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;
  const now = new Date();
  const verified = input.status === "verified";
  const row = await prisma.$transaction(async (tx) => {
    const latest = await tx.financeStatementExchangeRate.findFirst({
      where: {
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        rateKind: input.rateKind,
        rateDate: input.rateDate,
      },
      select: { version: true },
      orderBy: { version: "desc" },
    });
    return tx.financeStatementExchangeRate.create({
      data: {
        ...input,
        version: (latest?.version ?? 0) + 1,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        updatedBy: userId,
        verifiedBy: verified ? userId : null,
        verifiedAt: verified ? now : null,
      },
    });
  });
  return serviceOk({ rate: statementExchangeRateSnapshot(row) });
}
