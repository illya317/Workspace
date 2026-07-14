import { join } from "node:path";
import {
  booleanValue, dateText, numberValue, optionalText, readJsonLines, roundMoney, splitBalance, textValue,
} from "./read-jsonl";
import { loadT6CashFlowItems, loadT6Currencies, loadT6Members } from "./t6-masters";
import type {
  DimensionType, NormalizedAccount, NormalizedAuxiliaryRef, NormalizedBalance,
  NormalizedReadableBatch, NormalizedVoucher, NormalizedVoucherItem, ReadableBatchSpec,
} from "./types";

function category(row: Record<string, unknown>): string {
  const source = textValue(row, "cclass");
  if (source === "资产") return "asset";
  if (source === "负债") return "liability";
  if (source === "权益") return "equity";
  if (source === "成本") return "cost";
  if (source === "损益") return booleanValue(row, "bproperty") ? "expense" : "revenue";
  return "other";
}

function t6Direction(row: Record<string, unknown>): "debit" | "credit" {
  return booleanValue(row, "bproperty") ? "debit" : "credit";
}

function sourceDirection(value: string): "debit" | "credit" {
  return value === "贷" || value.toLowerCase() === "cr" ? "credit" : "debit";
}

function auxiliaryRefs(row: Record<string, unknown>): NormalizedAuxiliaryRef[] {
  const definitions: Array<[string, DimensionType, string]> = [
    ["ccus_id", "customer", "customer"], ["csup_id", "supplier", "supplier"],
    ["cperson_id", "person", "person"], ["cdept_id", "department", "department"],
  ];
  const refs = definitions.flatMap(([field, dimensionType, sourceRole]) => {
    const sourceCode = textValue(row, field);
    return sourceCode ? [{ dimensionType, sourceCode, sourceRole }] : [];
  });
  const projectCode = textValue(row, "citem_id");
  if (projectCode && textValue(row, "citem_class") !== "98") {
    refs.push({ dimensionType: "project", sourceCode: projectCode, sourceRole: "project" });
  }
  return refs;
}

function normalizeAccounts(rows: Record<string, unknown>[]): NormalizedAccount[] {
  const codes = rows.map((row) => textValue(row, "ccode")).filter(Boolean);
  const byCode = new Map(rows.map((row) => [textValue(row, "ccode"), textValue(row, "i_id")]));
  return rows.flatMap((row) => {
    const code = textValue(row, "ccode");
    const name = textValue(row, "ccode_name");
    const sourceKey = textValue(row, "i_id");
    if (!code || !name || !sourceKey) return [];
    const parentCode = codes
      .filter((candidate) => candidate.length < code.length && code.startsWith(candidate))
      .sort((left, right) => right.length - left.length)[0];
    return [{
      sourceKey, code, name, category: category(row), balanceDirection: t6Direction(row),
      parentSourceKey: parentCode ? byCode.get(parentCode) : undefined,
      mnemonicCode: optionalText(row, "chelp"), currency: optionalText(row, "cexch_name"),
      subjectLevel: numberValue(row, "igrade") || undefined,
      isActive: !booleanValue(row, "bclose"), isCash: booleanValue(row, "bcash"),
      isBank: booleanValue(row, "bbank"),
    }];
  });
}

function normalizeVouchers(
  rows: Record<string, unknown>[],
  currencyCodes: Map<string, string>,
  accountSources: Map<string, string>,
): NormalizedVoucher[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const month = numberValue(row, "iperiod");
    if (month < 1 || month > 12 || booleanValue(row, "bdelete")) continue;
    const key = `${month}:${textValue(row, "isignseq")}:${textValue(row, "ino_id")}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([sourceKey, group]) => {
    const sorted = group.sort((left, right) => numberValue(left, "inid") - numberValue(right, "inid"));
    const first = sorted[0];
    const month = numberValue(first, "iperiod");
    const sign = textValue(first, "csign") || "记";
    const number = textValue(first, "ino_id").padStart(4, "0");
    const items: NormalizedVoucherItem[] = sorted.map((row) => {
      const currencyName = optionalText(row, "cexch_name");
      return {
        sourceKey: textValue(row, "i_id"),
        accountSourceKey: accountSources.get(textValue(row, "ccode")) ?? textValue(row, "ccode"),
        accountCode: textValue(row, "ccode"), sortOrder: Math.max(0, numberValue(row, "inid") - 1),
        debit: roundMoney(numberValue(row, "md")), credit: roundMoney(numberValue(row, "mc")),
        description: optionalText(row, "cdigest"), currencyCode: currencyName ? currencyCodes.get(currencyName) ?? currencyName : undefined,
        exchangeRate: numberValue(row, "nfrat") || undefined,
        originalDebit: numberValue(row, "md_f") || undefined, originalCredit: numberValue(row, "mc_f") || undefined,
        auxiliaryRefs: auxiliaryRefs(row),
      };
    });
    const totalDebit = roundMoney(items.reduce((sum, item) => sum + item.debit, 0));
    const totalCredit = roundMoney(items.reduce((sum, item) => sum + item.credit, 0));
    return {
      sourceKey, voucherNo: `${dateText(first.dbill_date)?.slice(0, 7) ?? `${new Date().getFullYear()}-${String(month).padStart(2, "0")}`}-${sign}-${number}`,
      date: dateText(first.dbill_date) ?? "", month, description: items[0]?.description ?? "",
      totalDebit, totalCredit,
      status: sorted.every((row) => numberValue(row, "ibook") === 1) ? "posted" : "draft",
      items,
    };
  });
}

function normalizeBalances(
  rows: Record<string, unknown>[],
  auxiliary: boolean,
  accountSources: Map<string, string>,
): NormalizedBalance[] {
  return rows.flatMap((row) => {
    const month = numberValue(row, "iperiod");
    const accountCode = textValue(row, "ccode");
    const sourceKey = textValue(row, "i_id");
    if (month < 1 || month > 12 || !accountCode || !sourceKey) return [];
    const opening = splitBalance(numberValue(row, "mb"), sourceDirection(textValue(row, "cbegind_c", "cbegind_c_engl")));
    const closing = splitBalance(numberValue(row, "me"), sourceDirection(textValue(row, "cendd_c", "cendd_c_engl")));
    return [{
      sourceKey, month, accountSourceKey: accountSources.get(accountCode) ?? accountCode, accountCode,
      openingDebit: opening.debit, openingCredit: opening.credit,
      currentDebit: roundMoney(numberValue(row, "md")), currentCredit: roundMoney(numberValue(row, "mc")),
      closingDebit: closing.debit, closingCredit: closing.credit,
      auxiliaryRefs: auxiliary ? auxiliaryRefs(row) : undefined,
    }];
  });
}

export async function loadT6Batch(root: string, spec: ReadableBatchSpec): Promise<NormalizedReadableBatch> {
  const dataDir = join(root, "T6", "databases", spec.sourceDatabase, "data");
  const [accountRows, journalRows, balanceRows, auxBalanceRows, cashRows, closeRows, currencies] = await Promise.all([
    readJsonLines(join(dataDir, "code.jsonl")), readJsonLines(join(dataDir, "GL_accvouch.jsonl")),
    readJsonLines(join(dataDir, "GL_accsum.jsonl")), readJsonLines(join(dataDir, "GL_accass.jsonl")),
    readJsonLines(join(dataDir, "GL_CashTable.jsonl")), readJsonLines(join(dataDir, "GL_mend.jsonl")),
    loadT6Currencies(dataDir),
  ]);
  const accounts = normalizeAccounts(accountRows);
  const accountSources = new Map(accounts.map((item) => [item.code, item.sourceKey]));
  const currencyCodes = new Map(currencies.map((item) => [item.sourceName, item.sourceCode]));
  const vouchers = normalizeVouchers(journalRows, currencyCodes, accountSources);
  const voucherKeys = new Set(vouchers.map((item) => item.sourceKey));
  const cashFlowAllocations = cashRows.flatMap((row) => {
    const month = numberValue(row, "iPeriod");
    const voucherSourceKey = `${month}:${textValue(row, "iSignSeq")}:${textValue(row, "iNo_id")}`;
    const debit = roundMoney(numberValue(row, "md"));
    const credit = roundMoney(numberValue(row, "mc"));
    if (!voucherKeys.has(voucherSourceKey) || (!debit && !credit)) return [];
    return [{
      sourceKey: textValue(row, "i_id"), month, voucherSourceKey,
      cashFlowCode: textValue(row, "cCashItem"), ownerSortOrder: Math.max(0, numberValue(row, "inid") - 1),
      direction: debit ? "inflow" as const : "outflow" as const, amount: debit || credit,
    }];
  });
  return {
    spec, snapshotDate: "2026-07-14", cutoffDate: "2026-06-30", accounts, vouchers,
    sourceBalances: normalizeBalances(balanceRows, false, accountSources),
    auxiliaryBalances: normalizeBalances(auxBalanceRows, true, accountSources),
    auxiliaryMembers: await loadT6Members(dataDir), cashFlowItems: await loadT6CashFlowItems(dataDir),
    cashFlowAllocations, openItems: [], currencies,
    bankAccounts: accounts.filter((item) => item.isCash || item.isBank).map((item) => ({
      sourceKey: item.sourceKey, sourceCode: item.code, sourceName: item.name,
      accountSourceKey: item.sourceKey, accountNo: item.code, currencyCode: item.currency,
      isActive: item.isActive,
    })),
    closedMonths: new Set(closeRows.filter((row) => {
      const month = numberValue(row, "iperiod");
      return month >= 1 && month <= 12 && (booleanValue(row, "bflag") || booleanValue(row, "bAccClosed"));
    }).map((row) => numberValue(row, "iperiod"))),
    warnings: [],
  };
}
