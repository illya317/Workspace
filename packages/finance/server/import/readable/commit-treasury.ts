import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import type { CoreCommitContext } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

export async function upsertTreasuryFacts(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  core: CoreCommitContext,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const existingCurrencies = await tx.financeCurrency.findMany({
    where: {
      companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
      sourceLedger: batch.spec.sourceLedger,
    },
  });
  const currenciesByCode = new Map(existingCurrencies.map((item) => [item.sourceCode, item.id]));
  for (const item of batch.currencies) {
    const data = {
      sourceName: item.sourceName, symbol: item.symbol ?? null, decimalDigits: item.decimalDigits ?? null,
      isBase: item.isBase, latestImportId: importId,
    };
    const id = currenciesByCode.get(item.sourceCode);
    if (id) await tx.financeCurrency.update({ where: { id }, data });
    else {
      const created = await tx.financeCurrency.create({
        data: {
          companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
          sourceLedger: batch.spec.sourceLedger, sourceCode: item.sourceCode, ...data,
        },
      });
      currenciesByCode.set(item.sourceCode, created.id);
    }
  }
  const existingBanks = await tx.financeBankAccount.findMany({
    where: {
      companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
      sourceLedger: batch.spec.sourceLedger,
    },
  });
  const banksByKey = new Map(existingBanks.map((item) => [item.sourceKey, item.id]));
  for (const item of batch.bankAccounts) {
    const data = {
      accountId: item.accountSourceKey ? core.accounts.get(item.accountSourceKey) ?? null : null,
      sourceCode: item.sourceCode ?? null, sourceName: item.sourceName,
      accountNo: item.accountNo ?? null, bankName: item.bankName ?? null,
      currencyCode: item.currencyCode ?? null, isActive: item.isActive, latestImportId: importId,
    };
    const id = banksByKey.get(item.sourceKey);
    if (id) await tx.financeBankAccount.update({ where: { id }, data });
    else {
      const created = await tx.financeBankAccount.create({
        data: {
          companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
          sourceLedger: batch.spec.sourceLedger, sourceKey: item.sourceKey, ...data,
        },
      });
      banksByKey.set(item.sourceKey, created.id);
    }
  }
}
