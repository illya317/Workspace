import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import { roundMoney } from "./read-jsonl";
import type { CoreCommitContext } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

export async function replaceSourceBalances(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  core: CoreCommitContext,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  await tx.financeSourceAccountBalance.deleteMany({ where: { importId } });
  const rows = batch.sourceBalances.flatMap((item) => {
    const periodId = core.periods.get(item.month);
    const accountId = core.accounts.get(item.accountSourceKey);
    if (!periodId || !accountId) {
      batch.warnings.push(`来源余额未映射科目/期间：${item.accountCode}/${item.month}`);
      return [];
    }
    return [{
      importId, periodId, accountId, companyCode: batch.spec.companyCode,
      sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
      sourceKey: item.sourceKey, openingDebit: item.openingDebit, openingCredit: item.openingCredit,
      currentDebit: item.currentDebit, currentCredit: item.currentCredit,
      closingDebit: item.closingDebit, closingCredit: item.closingCredit,
    }];
  });
  if (rows.length) await tx.financeSourceAccountBalance.createMany({ data: rows });
}

function addCurrent(
  target: Map<string, { debit: number; credit: number }>,
  key: string,
  debit: number,
  credit: number,
) {
  const current = target.get(key) ?? { debit: 0, credit: 0 };
  current.debit = roundMoney(current.debit + debit);
  current.credit = roundMoney(current.credit + credit);
  target.set(key, current);
}

function rollUpAccountMap(
  batch: NormalizedReadableBatch,
  current: Map<string, { debit: number; credit: number }>,
) {
  const deepestFirst = [...batch.accounts].sort((left, right) => (
    (right.subjectLevel ?? right.code.length) - (left.subjectLevel ?? left.code.length)
  ));
  for (const account of deepestFirst) {
    if (!account.parentSourceKey) continue;
    const own = current.get(account.sourceKey);
    if (own) addCurrent(current, account.parentSourceKey, own.debit, own.credit);
  }
}

function rollUpMonthlyCurrent(batch: NormalizedReadableBatch) {
  const monthly = new Map<number, Map<string, { debit: number; credit: number }>>();
  for (const voucher of batch.vouchers.filter((item) => item.status === "posted")) {
    const current = monthly.get(voucher.month) ?? new Map<string, { debit: number; credit: number }>();
    for (const item of voucher.items) addCurrent(current, item.accountSourceKey, item.debit, item.credit);
    monthly.set(voucher.month, current);
  }
  for (const current of monthly.values()) rollUpAccountMap(batch, current);
  return monthly;
}

function closingSides(
  direction: "debit" | "credit",
  openingDebit: number,
  openingCredit: number,
  currentDebit: number,
  currentCredit: number,
) {
  const signed = direction === "debit"
    ? openingDebit - openingCredit + currentDebit - currentCredit
    : openingCredit - openingDebit + currentCredit - currentDebit;
  if (direction === "debit") {
    return signed >= 0 ? { debit: roundMoney(signed), credit: 0 } : { debit: 0, credit: roundMoney(-signed) };
  }
  return signed >= 0 ? { debit: 0, credit: roundMoney(signed) } : { debit: roundMoney(-signed), credit: 0 };
}

async function materializeDerivedBalances(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  core: CoreCommitContext,
) {
  const openings = new Map<string, { debit: number; credit: number }>();
  for (const item of batch.sourceBalances.filter((candidate) => candidate.month === 1)) {
    const current = openings.get(item.accountSourceKey) ?? { debit: 0, credit: 0 };
    current.debit = roundMoney(current.debit + item.openingDebit);
    current.credit = roundMoney(current.credit + item.openingCredit);
    openings.set(item.accountSourceKey, current);
  }
  if (batch.spec.sourceSystem === "TPLUS") rollUpAccountMap(batch, openings);
  const monthly = rollUpMonthlyCurrent(batch);
  for (const account of batch.accounts) {
    const accountId = core.accounts.get(account.sourceKey);
    if (!accountId) continue;
    let opening = openings.get(account.sourceKey) ?? { debit: 0, credit: 0 };
    for (let month = 1; month <= 12; month += 1) {
      const periodId = core.periods.get(month);
      if (!periodId) continue;
      const current = monthly.get(month)?.get(account.sourceKey) ?? { debit: 0, credit: 0 };
      const closing = closingSides(
        account.balanceDirection, opening.debit, opening.credit, current.debit, current.credit,
      );
      const data = {
        openingDebit: opening.debit, openingCredit: opening.credit,
        currentDebit: current.debit, currentCredit: current.credit,
        closingDebit: closing.debit, closingCredit: closing.credit,
        companyCode: batch.spec.companyCode,
      };
      await tx.financeAccountBalance.upsert({
        where: { accountId_periodId: { accountId, periodId } },
        create: { accountId, periodId, ...data }, update: data,
      });
      opening = closing;
    }
  }
}

export async function materializeReadableBalances(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  core: CoreCommitContext,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  await materializeDerivedBalances(tx, batch, core);
}
