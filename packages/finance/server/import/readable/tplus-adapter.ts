import { join } from "node:path";
import {
  booleanValue, dateText, numberValue, optionalText, readJsonLines, roundMoney, splitBalance, textValue,
} from "./read-jsonl";
import { loadTPlusMasterIndex, tplusAuxiliaryRefs, type TPlusMasterIndex } from "./tplus-masters";
import type {
  NormalizedAccount, NormalizedBalance, NormalizedOpenItem, NormalizedReadableBatch,
  NormalizedVoucher, NormalizedVoucherItem, ReadableBatchSpec,
} from "./types";

function direction(row: Record<string, unknown>): "debit" | "credit" {
  return numberValue(row, "dcdirection") === 653 ? "credit" : "debit";
}

function category(row: Record<string, unknown>, index: TPlusMasterIndex): string {
  const source = index.accountTypeNames.get(numberValue(row, "idaccounttypeDTO"));
  if (source === "资产") return "asset";
  if (source === "负债") return "liability";
  if (source === "权益") return "equity";
  if (source === "成本") return "cost";
  if (source === "损益") return direction(row) === "credit" ? "revenue" : "expense";
  return "other";
}

function normalizeAccounts(rows: Record<string, unknown>[], index: TPlusMasterIndex): NormalizedAccount[] {
  return rows.flatMap((row) => {
    const code = textValue(row, "code");
    const name = textValue(row, "name");
    const sourceKey = textValue(row, "id");
    if (!code || !name || !sourceKey) return [];
    return [{
      sourceKey, code, name, category: category(row, index), balanceDirection: direction(row),
      parentSourceKey: optionalText(row, "idParent"), mnemonicCode: optionalText(row, "shorthand"),
      currency: index.currencyCodes.get(numberValue(row, "iddefaultcurrencyDTO")),
      subjectLevel: numberValue(row, "depth") || undefined, isActive: !booleanValue(row, "disabled"),
      isCash: booleanValue(row, "iscash"), isBank: booleanValue(row, "isbank"),
    }];
  });
}

function normalizeVouchers(
  rows: Record<string, unknown>[],
  docRows: Record<string, unknown>[],
  accounts: Map<number, NormalizedAccount>,
  index: TPlusMasterIndex,
  year: number,
): NormalizedVoucher[] {
  const validDocs = new Map(docRows.filter((row) => (
    numberValue(row, "accountingyear") === year && booleanValue(row, "ispost") && !booleanValue(row, "isinvalidate")
  )).map((row) => [numberValue(row, "id"), row]));
  const groups = new Map<number, Record<string, unknown>[]>();
  for (const row of rows) {
    const docId = numberValue(row, "docid");
    if (numberValue(row, "year") !== year || !booleanValue(row, "ispost") || booleanValue(row, "isPeriodBegin")) continue;
    if (!validDocs.has(docId)) continue;
    groups.set(docId, [...(groups.get(docId) ?? []), row]);
  }
  return [...groups.entries()].map(([docId, group]) => {
    const sorted = group.sort((left, right) => numberValue(left, "rowno") - numberValue(right, "rowno"));
    const first = sorted[0];
    const doc = validDocs.get(docId);
    const month = numberValue(first, "currentperiod");
    const docType = index.docTypeCodes.get(numberValue(first, "idDocType")) || "记";
    const docNo = textValue(first, "docno").padStart(4, "0");
    const items: NormalizedVoucherItem[] = sorted.flatMap((row) => {
      const account = accounts.get(numberValue(row, "idaccount"));
      const sourceKey = textValue(row, "entryid");
      if (!account || !sourceKey) return [];
      return [{
        sourceKey, accountSourceKey: account.sourceKey, accountCode: account.code,
        sortOrder: Math.max(0, numberValue(row, "rowno")), debit: roundMoney(numberValue(row, "amountDr")),
        credit: roundMoney(numberValue(row, "amountCr")), description: optionalText(row, "summary"),
        currencyCode: index.currencyCodes.get(numberValue(row, "idcurrency")),
        exchangeRate: numberValue(row, "exchangerate") || undefined,
        originalDebit: numberValue(row, "origAmountDr") || undefined,
        originalCredit: numberValue(row, "OrigAmountCr") || undefined,
        auxiliaryRefs: tplusAuxiliaryRefs(row, index),
      }];
    });
    return {
      sourceKey: String(docId), voucherNo: `${year}-${String(month).padStart(2, "0")}-${docType}-${docNo}`,
      date: dateText(doc?.voucherdate) ?? dateText(first.madedate) ?? `${year}-${String(month).padStart(2, "0")}-01`,
      month, description: optionalText(doc ?? {}, "name") ?? items[0]?.description ?? "",
      totalDebit: roundMoney(items.reduce((sum, item) => sum + item.debit, 0)),
      totalCredit: roundMoney(items.reduce((sum, item) => sum + item.credit, 0)), status: "posted", items,
    };
  });
}

function normalizeOpeningBalances(
  rows: Record<string, unknown>[],
  accounts: Map<number, NormalizedAccount>,
  year: number,
): NormalizedBalance[] {
  return rows.flatMap((row) => {
    if (numberValue(row, "accountingyear") !== year) return [];
    const account = accounts.get(numberValue(row, "idaccountDTO"));
    const sourceKey = textValue(row, "id");
    if (!account || !sourceKey) return [];
    const opening = splitBalance(numberValue(row, "yearbeginbalanceamount"), account.balanceDirection);
    return [{
      sourceKey, month: 1, accountSourceKey: account.sourceKey, accountCode: account.code,
      openingDebit: opening.debit, openingCredit: opening.credit,
      currentDebit: 0, currentCredit: 0, closingDebit: opening.debit, closingCredit: opening.credit,
    }];
  });
}

function normalizeOpenItems(
  rows: Record<string, unknown>[],
  allAccounts: Map<number, NormalizedAccount>,
  allJournals: Map<number, Record<string, unknown>>,
  index: TPlusMasterIndex,
): NormalizedOpenItem[] {
  return rows.flatMap((row) => {
    const sourceKey = textValue(row, "id");
    const documentDate = dateText(row.docmadedate);
    if (!sourceKey || (documentDate && documentDate > "2026-06-30")) return [];
    const account = allAccounts.get(numberValue(row, "idaccount"));
    const original = splitBalance(numberValue(row, "origamount"), direction(row));
    const outstanding = splitBalance(numberValue(row, "writeoffableamount"), direction(row));
    const journal = allJournals.get(numberValue(row, "idjournal"));
    return [{
      sourceKey, accountSourceKey: account?.sourceKey, accountCode: account?.code,
      voucherItemSourceKey: journal ? textValue(journal, "entryid") : undefined,
      documentNo: optionalText(row, "docno", "billNo"), documentDate,
      dueDate: dateText(row.dueDate), memo: optionalText(row, "summary"),
      currencyCode: index.currencyCodes.get(numberValue(row, "idcurrency")),
      originalDebit: original.debit, originalCredit: original.credit,
      outstandingDebit: outstanding.debit, outstandingCredit: outstanding.credit,
      status: outstanding.debit || outstanding.credit ? "open" : "closed",
      auxiliaryRefs: tplusAuxiliaryRefs(row, index),
    }];
  });
}

export async function loadTPlusBatch(root: string, spec: ReadableBatchSpec): Promise<NormalizedReadableBatch> {
  const dataDir = join(root, "TPlus", "databases", spec.sourceDatabase, "data");
  const index = await loadTPlusMasterIndex(dataDir);
  const [accountRows, journalRows, docRows, beginRows, beginDetailRows, cashRows, openRows, bankRows] = await Promise.all([
    readJsonLines(join(dataDir, "AA_Account.jsonl")), readJsonLines(join(dataDir, "GL_Journal.jsonl")),
    readJsonLines(join(dataDir, "GL_Doc.jsonl")), readJsonLines(join(dataDir, "GL_AccountPeriodBegin.jsonl")),
    readJsonLines(join(dataDir, "GL_AccountPeriodBeginDetail.jsonl")), readJsonLines(join(dataDir, "GL_CashFlowInfo.jsonl")),
    readJsonLines(join(dataDir, "GL_WriteOffJournal.jsonl")), readJsonLines(join(dataDir, "AA_BankAccount.jsonl")),
  ]);
  const allAccounts = normalizeAccounts(accountRows, index);
  const accounts = allAccounts.filter((item) => numberValue(accountRows.find((row) => textValue(row, "id") === item.sourceKey) ?? {}, "accountingyear") === spec.year);
  const accountById = new Map(accounts.map((item) => [Number(item.sourceKey), item]));
  const allAccountById = new Map(allAccounts.map((item) => [Number(item.sourceKey), item]));
  const vouchers = normalizeVouchers(journalRows, docRows, accountById, index, spec.year);
  const voucherKeys = new Set(vouchers.map((item) => item.sourceKey));
  const cashFlowAllocations = cashRows.flatMap((row) => {
    const voucherSourceKey = textValue(row, "idDocDTO");
    const cashFlowCode = index.cashFlowCodes.get(numberValue(row, "idcashflowitem"));
    if (!voucherKeys.has(voucherSourceKey) || !cashFlowCode) return [];
    const item = index.cashFlowItems.find((candidate) => candidate.sourceCode === cashFlowCode);
    const month = vouchers.find((voucher) => voucher.sourceKey === voucherSourceKey)?.month ?? 0;
    return [{
      sourceKey: textValue(row, "id"), month, voucherSourceKey, cashFlowCode,
      ownerSortOrder: Math.max(0, numberValue(row, "ownerEntryNo") - 1),
      counterpartSortOrder: Math.max(0, numberValue(row, "mapEntryNo") - 1),
      direction: item?.direction === "inflow" ? "inflow" as const : "outflow" as const,
      amount: roundMoney(Math.abs(numberValue(row, "amount"))),
    }];
  });
  const beginIds = new Set(beginRows.filter((row) => numberValue(row, "accountingyear") === spec.year).map((row) => numberValue(row, "id")));
  const auxiliaryBalances = beginDetailRows.flatMap((row) => {
    if (!beginIds.has(numberValue(row, "idAccountPeriodBeginDTO"))) return [];
    const account = accountById.get(numberValue(row, "idaccountDTO"));
    if (!account) return [];
    const opening = splitBalance(numberValue(row, "yearbeginbalanceamount"), account.balanceDirection);
    return [{
      sourceKey: textValue(row, "id"), month: 1, accountSourceKey: account.sourceKey, accountCode: account.code,
      openingDebit: opening.debit, openingCredit: opening.credit, currentDebit: 0, currentCredit: 0,
      closingDebit: opening.debit, closingCredit: opening.credit, auxiliaryRefs: tplusAuxiliaryRefs(row, index),
    }];
  });
  const journalById = new Map(journalRows.map((row) => [numberValue(row, "id"), row]));
  return {
    spec, snapshotDate: "2026-07-14", cutoffDate: "2026-06-30", accounts, vouchers,
    sourceBalances: normalizeOpeningBalances(beginRows, accountById, spec.year), auxiliaryBalances,
    auxiliaryMembers: index.members, cashFlowItems: index.cashFlowItems, cashFlowAllocations,
    openItems: spec.includeCurrentOpenItems ? normalizeOpenItems(openRows, allAccountById, journalById, index) : [],
    currencies: index.currencies,
    bankAccounts: bankRows.flatMap((row) => {
      const sourceKey = textValue(row, "id");
      const sourceName = textValue(row, "name");
      if (!sourceKey || !sourceName) return [];
      const account = accounts.find((item) => item.name === textValue(row, "AccountCode") || item.code === textValue(row, "AccountCode"));
      return [{
        sourceKey, sourceCode: optionalText(row, "code"), sourceName, accountSourceKey: account?.sourceKey,
        accountNo: optionalText(row, "bankNo"), bankName: optionalText(row, "bankName"),
        currencyCode: index.currencyCodes.get(numberValue(row, "idcurrency")), isActive: !booleanValue(row, "disabled"),
      }];
    }),
    closedMonths: new Set(), warnings: [],
  };
}
