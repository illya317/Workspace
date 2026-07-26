import { join } from "node:path";
import {
  booleanValue, dateText, nullableBooleanValue, numberValue, optionalText, readJsonLines, roundMoney, splitBalance, textValue,
} from "./read-jsonl";
import { loadT6CashFlowItems, loadT6Currencies, loadT6Members } from "./t6-masters";
import { assertDeclaredT6AccountingClose } from "./period-close";
import type {
  DimensionType, NormalizedAccount, NormalizedAuxiliaryRef, NormalizedBalance,
  NormalizedReadableBatch, NormalizedVoucher, NormalizedVoucherItem, ReadableBatchSpec,
  ReadableSourcePackageEvidence,
} from "./types";

const ACCOUNT_REQUIREMENTS: Array<[string, DimensionType]> = [
  ["bcus", "customer"], ["bsup", "supplier"], ["bperson", "person"],
  ["bdept", "department"], ["bitem", "project"],
];

const CLOSE_MODULE_FIELDS = [
  "AP", "AR", "CA", "FA", "FD", "IA", "PP", "PU", "WA", "ST", "SA", "GS", "WH", "NB", "PM", "CP", "RP", "OM", "CB", "OA",
];

function populatedMetadata(row: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.flatMap((key) => {
    const item = row[key];
    return item === null || item === undefined || item === "" ? [] : [[key, item as string | number | boolean]];
  }));
}

function category(row: Record<string, unknown>): string {
  const source = textValue(row, "cclass");
  if (source === "资产") return "asset";
  if (source === "负债") return "liability";
  if (source === "共同" || source === "共同类") return "common";
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
      auxiliaryRequirements: ACCOUNT_REQUIREMENTS.flatMap(([sourceField, dimensionType]) => (
        booleanValue(row, sourceField) ? [{ dimensionType, sourceField }] : []
      )),
    }];
  });
}

function normalizeVouchers(
  rows: Record<string, unknown>[],
  currencyCodes: Map<string, string>,
  accountSources: Map<string, string>,
  voucherTypes: Map<string, { name: string; isAdjustment: boolean }>,
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
        settlementStyle: optionalText(row, "csettle"), settlementNo: optionalText(row, "cn_id"),
        settlementDate: dateText(row.dt_date),
        sourceMetadata: populatedMetadata(row, ["cname", "ccode_equal"]),
        auxiliaryRefs: auxiliaryRefs(row),
      };
    });
    const totalDebit = roundMoney(items.reduce((sum, item) => sum + item.debit, 0));
    const totalCredit = roundMoney(items.reduce((sum, item) => sum + item.credit, 0));
    const type = voucherTypes.get(sign);
    const sourcePosted = sorted.every((row) => numberValue(row, "ibook") === 1);
    return {
      sourceKey, voucherNo: `${dateText(first.dbill_date)?.slice(0, 7) ?? `${new Date().getFullYear()}-${String(month).padStart(2, "0")}`}-${sign}-${number}`,
      date: dateText(first.dbill_date) ?? "", month, description: items[0]?.description ?? "",
      totalDebit, totalCredit,
      status: sourcePosted ? "posted" : "draft",
      voucherTypeCode: sign, voucherTypeName: type?.name, isAdjustment: type?.isAdjustment ?? false,
      preparerName: optionalText(first, "cbill"), reviewerName: optionalText(first, "ccheck"),
      posterName: optionalText(first, "cbook"), cashierName: optionalText(first, "ccashier"),
      attachmentCount: Math.max(0, numberValue(first, "idoc")), sourcePosted,
      sourceAudited: Boolean(optionalText(first, "ccheck")), sourceInvalid: false,
      externalSourceSystem: optionalText(first, "coutsysname"),
      externalSourceDocumentNo: optionalText(first, "coutno_id"),
      externalSourceDocumentId: optionalText(first, "coutid"),
      externalSourceAccountSet: optionalText(first, "coutaccset"),
      externalSourceDate: dateText(first.doutdate) ?? dateText(first.doutbilldate),
      sourceMetadata: populatedMetadata(first, [
        "ioutyear", "ioutperiod", "coutsign", "coutbillsign",
        ...Array.from({ length: 16 }, (_, index) => `cDefine${index + 1}`),
      ]),
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

export async function loadT6Batch(
  root: string,
  spec: ReadableBatchSpec,
  sourcePackage: ReadableSourcePackageEvidence,
): Promise<NormalizedReadableBatch> {
  const dataDir = join(root, "T6", "databases", spec.sourceDatabase, "data");
  const systemDir = join(root, "T6", "databases", "UFSystem", "data");
  const [accountRows, journalRows, balanceRows, auxBalanceRows, cashRows, closeRows, signRows, accountSetRows, subsystemRows, sourcePeriodRows, currencies] = await Promise.all([
    readJsonLines(join(dataDir, "code.jsonl")), readJsonLines(join(dataDir, "GL_accvouch.jsonl")),
    readJsonLines(join(dataDir, "GL_accsum.jsonl")), readJsonLines(join(dataDir, "GL_accass.jsonl")),
    readJsonLines(join(dataDir, "GL_CashTable.jsonl")), readJsonLines(join(dataDir, "GL_mend.jsonl")),
    readJsonLines(join(dataDir, "dsign.jsonl")), readJsonLines(join(systemDir, "UA_Account.jsonl")),
    readJsonLines(join(systemDir, "UA_Account_sub.jsonl")), readJsonLines(join(systemDir, "UA_Period.jsonl")),
    loadT6Currencies(dataDir),
  ]);
  const accounts = normalizeAccounts(accountRows);
  const accountSources = new Map(accounts.map((item) => [item.code, item.sourceKey]));
  const currencyCodes = new Map(currencies.map((item) => [item.sourceName, item.sourceCode]));
  const voucherTypes = new Map(signRows.map((row) => [
    textValue(row, "csign"), { name: textValue(row, "ctext"), isAdjustment: booleanValue(row, "bAdjustSign") },
  ]));
  const vouchers = normalizeVouchers(journalRows, currencyCodes, accountSources, voucherTypes);
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
  const accountSet = accountSetRows.find((row) => textValue(row, "cAcc_Id") === spec.sourceLedger) ?? {};
  const sourcePeriods = new Map(sourcePeriodRows.filter((row) => (
    textValue(row, "cAcc_Id") === spec.sourceLedger && numberValue(row, "iYear") === spec.year && !booleanValue(row, "bIsDelete")
  )).map((row) => [numberValue(row, "iId"), row]));
  const periodStatuses = closeRows.flatMap((row) => {
    const month = numberValue(row, "iperiod");
    if (month < 1 || month > 12) return [];
    const sourcePeriod = sourcePeriods.get(month);
    return [{
      month, sourceKey: `${spec.sourceDatabase}:${month}`,
      startDate: dateText(sourcePeriod?.dBegin), endDate: dateText(sourcePeriod?.dEnd),
      glMonthEnd: nullableBooleanValue(row, "bflag"),
      accountingClosed: nullableBooleanValue(row, "bAccClosed"),
      moduleStatuses: Object.fromEntries(CLOSE_MODULE_FIELDS.map((code) => [code, nullableBooleanValue(row, `bflag_${code}`)])),
    }];
  });
  const subsystemStatuses = subsystemRows.filter((row) => (
    textValue(row, "cAcc_Id") === spec.sourceLedger && numberValue(row, "iYear") === spec.year
  )).map((row) => ({
    sourceKey: `${spec.sourceLedger}:${spec.year}:${textValue(row, "cSub_Id")}`,
    subsystemCode: textValue(row, "cSub_Id"), isDeleted: booleanValue(row, "bIsDelete"),
    isYearClosed: nullableBooleanValue(row, "bClosing"),
    lastProcessedPeriod: numberValue(row, "iModiPeri") || undefined,
    enabledFrom: dateText(row.dSubSysUsed) ?? dateText(row.dSubOriDate), sourceUser: optionalText(row, "cUser_Id"),
  }));
  assertDeclaredT6AccountingClose({
    year: spec.year,
    cutoffDate: sourcePackage.cutoffDate,
    isAccountingClose: sourcePackage.isAccountingClose,
    periodStatuses,
  });
  return {
    spec, sourcePackage, snapshotDate: sourcePackage.snapshotDate, cutoffDate: sourcePackage.cutoffDate,
    ledgerMetadata: {
      sourceName: textValue(accountSet, "cAcc_Name") || spec.companyName,
      startYear: numberValue(accountSet, "iYear") || undefined, startMonth: numberValue(accountSet, "iMonth") || undefined,
      baseCurrencyCode: optionalText(accountSet, "cCurCode"), baseCurrencyName: optionalText(accountSet, "cCurName"),
      accountingStandard: optionalText(accountSet, "cTradeKind", "cFinType"), entityType: optionalText(accountSet, "cEntType"),
      masterUser: optionalText(accountSet, "cAcc_Master"),
    },
    accounts, vouchers,
    sourceBalances: normalizeBalances(balanceRows, false, accountSources),
    auxiliaryBalances: normalizeBalances(auxBalanceRows, true, accountSources),
    auxiliaryMembers: await loadT6Members(dataDir), cashFlowItems: await loadT6CashFlowItems(dataDir),
    cashFlowAllocations, openItems: [], currencies,
    bankAccounts: accounts.filter((item) => item.isCash || item.isBank).map((item) => ({
      sourceKey: item.sourceKey, sourceCode: item.code, sourceName: item.name,
      accountSourceKey: item.sourceKey, accountNo: item.code, currencyCode: item.currency,
      isActive: item.isActive,
    })),
    periodStatuses, subsystemStatuses, accountLineage: [],
    closedMonths: new Set(periodStatuses.filter((row) => row.glMonthEnd === true).map((row) => row.month)),
    warnings: [],
  };
}
