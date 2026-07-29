import type * as XLSX from "xlsx";
import { intangibleCategoryCandidate, prepaidCategoryCandidate } from "./current-period-category";
import type { AssetWorkbookBlocker, AssetWorkbookControl, AssetWorkbookScope, ParsedAssetCostEvidence, ParsedCurrentPeriodAsset } from "./current-period-workbook-types";
import { cellNumber, cellText, factRange, impliedLifeFromAmount, money, openingAsOfDate, parsePeriod, parseSourceDate, readRows, recordControl, recordPeriodEvidence, sourceCellFormula } from "./current-period-workbook-utils";

type OtherParseResult = {
  assets: ParsedCurrentPeriodAsset[];
  renovationCostEvidence: ParsedAssetCostEvidence[];
  controls: AssetWorkbookControl[];
  blockers: AssetWorkbookBlocker[];
  periodEvidence: Array<{ sourceSheet: string; sourceRange: string; year?: number; month?: number; raw: string }>;
  companyLabels: string[];
};

export function parseCurrentPeriodOtherAssets(workbook: XLSX.WorkBook, scope: AssetWorkbookScope): OtherParseResult {
  const result = baseResult();
  parseIntangibles(workbook, readRows(workbook, "9&10-2"), scope, result);
  parseDeferred(workbook, readRows(workbook, "9&10-3"), scope, result);
  return result;
}

function parseIntangibles(workbook: XLSX.WorkBook, rows: unknown[][], scope: AssetWorkbookScope, result: OtherParseResult) {
  recordPeriodEvidence(result.periodEvidence, result.blockers, scope, "9&10-2", "9&10-2!A1", rows[0]?.[0]);
  addCompanyLabel(result, rows[0]?.[0]);
  const headerCurrent = cellText(rows[1]?.[4]);
  const headerAccumulated = cellText(rows[1]?.[5]);
  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Number.isFinite(Number(row?.[0])) || !cellText(row?.[1])) continue;
    const sourceRow = index + 1;
    const name = cellText(row[1]);
    const originalCost = money(row[3]);
    const currentAmortization = money(row[4]);
    const formula = sourceCellFormula(workbook, "9&10-2", `E${sourceRow}`);
    const lifeYears = formula?.match(/\/(\d+)\/12/)?.[1];
    const amountLife = impliedLifeFromAmount(originalCost, currentAmortization);
    const usefulLifeMonths = lifeYears ? Number(lifeYears) * 12 : amountLife;
    if (!lifeYears && amountLife) result.blockers.push({ code: "INTANGIBLE_USEFUL_LIFE_IMPLIED_ONLY", message: "原值与本月摊销金额只能推导隐含期限，需补源表明确寿命、法定期限或使用寿命不确定证据", sourceSheet: "9&10-2", sourceRange: factRange("9&10-2", "A", "G", sourceRow) });
    if (!usefulLifeMonths) result.blockers.push({ code: "INTANGIBLE_USEFUL_LIFE_MISSING", message: "无形资产缺少可复核使用寿命/法定期限，且无使用寿命不确定证据", sourceSheet: "9&10-2", sourceRange: factRange("9&10-2", "A", "G", sourceRow) });
    const categoryCandidate = intangibleCategoryCandidate(name);
    if (categoryCandidate === "IA-LAND-USE") result.blockers.push({ code: "LAND_USE_RIGHT_RECOGNITION_REVIEW", message: "土地名称只能作为候选分类，需确认不属于投资性房地产并满足无形资产确认条件", sourceSheet: "9&10-2", sourceRange: factRange("9&10-2", "A", "G", sourceRow) });
    if (categoryCandidate === "IA-LICENSE") result.blockers.push({ code: "LICENSE_RECOGNITION_REVIEW", message: "牌照名称只能作为候选分类，需补可辨认、控制、未来利益及可靠计量证据", sourceSheet: "9&10-2", sourceRange: factRange("9&10-2", "A", "G", sourceRow) });
    result.assets.push({
      ...evidence(scope, "9&10-2", sourceRow, "G", headerCurrent, headerAccumulated, "无形资产"),
      assetCode: `IA-${String(Number(row[0])).padStart(4, "0")}`,
      name,
      assetKind: "intangible",
      categoryCandidate,
      sourceCategory: name,
      acquisitionDate: parseSourceDate(row[2]),
      depreciationStartDate: parseSourceDate(row[2]),
      originalCost,
      usefulLifeMonths,
      usefulLifeEvidence: lifeYears ? "source_formula" : amountLife ? "implied_amount_ratio" : undefined,
      openingAccumulatedAmount: money(Number(row[5] || 0) - currentAmortization),
      openingAsOfDate: openingAsOfDate(scope),
      closingNetAmount: money(row[6]),
      currentAmortization,
      accumulatedAmortization: money(row[5]),
      note: /折旧/.test(`${headerCurrent}${headerAccumulated}`) ? "源表使用折旧文案；规范字段按无形资产摊销输出" : undefined,
    });
  }
  const totalIndex = rows.findIndex((row) => cellText(row[0]).replace(/\s/g, "") === "合计");
  const total = totalIndex >= 0 ? rows[totalIndex] : undefined;
  const range = totalIndex >= 0 ? `9&10-2!D${totalIndex + 1}:G${totalIndex + 1}` : undefined;
  recordControl(result.controls, result.blockers, { key: "intangible_original_cost", sourceSheet: "9&10-2", sourceRange: range, expected: cellNumber(total?.[3]), actual: sum(result.assets.filter((asset) => asset.sourceSheet === "9&10-2"), "originalCost"), blockerCode: "INTANGIBLE_SOURCE_TOTAL_MISSING" });
  recordControl(result.controls, result.blockers, { key: "intangible_current_amortization", sourceSheet: "9&10-2", sourceRange: range, expected: cellNumber(total?.[4]), actual: sum(result.assets.filter((asset) => asset.sourceSheet === "9&10-2"), "currentAmortization"), blockerCode: "INTANGIBLE_AMORTIZATION_CONTROL_FAILED" });
  recordControl(result.controls, result.blockers, { key: "intangible_accumulated_amortization", sourceSheet: "9&10-2", sourceRange: range, expected: cellNumber(total?.[5]), actual: sum(result.assets.filter((asset) => asset.sourceSheet === "9&10-2"), "accumulatedAmortization"), blockerCode: "INTANGIBLE_ACCUMULATED_CONTROL_FAILED" });
  recordControl(result.controls, result.blockers, { key: "intangible_closing_net", sourceSheet: "9&10-2", sourceRange: range, expected: cellNumber(total?.[6]), actual: sum(result.assets.filter((asset) => asset.sourceSheet === "9&10-2"), "closingNetAmount"), blockerCode: "INTANGIBLE_NET_CONTROL_FAILED" });
}

function parseDeferred(workbook: XLSX.WorkBook, rows: unknown[][], scope: AssetWorkbookScope, result: OtherParseResult) {
  const titleRows = rows.map((row, index) => ({ index, value: row?.[0], period: parsePeriod(row?.[0]) })).filter((item) => cellText(item.value).includes("长期待摊费用"));
  const currentTitle = titleRows.find((item) => item.period?.year === scope.year && item.period.month === scope.month);
  if (!currentTitle) {
    result.blockers.push({ code: "DEFERRED_CURRENT_PERIOD_SECTION_MISSING", message: "9&10-3 未找到与导入 scope 一致的当前期区块", sourceSheet: "9&10-3" });
    return;
  }
  recordPeriodEvidence(result.periodEvidence, result.blockers, scope, "9&10-3", `9&10-3!A${currentTitle.index + 1}`, currentTitle.value);
  addCompanyLabel(result, currentTitle.value);
  const headerIndex = currentTitle.index + 1;
  const startIndex = headerIndex + 1;
  let totalIndex = -1;
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    const name = cellText(row?.[0]);
    if (name.replace(/\s/g, "") === "合计") { totalIndex = index; break; }
    if (!name || cellNumber(row?.[2]) == null) break;
    parseDeferredFact(row, index + 1, scope, result);
  }
  const facts = result.assets.filter((asset) => asset.sourceSheet === "9&10-3");
  const total = totalIndex >= 0 ? rows[totalIndex] : undefined;
  const range = totalIndex >= 0 ? `9&10-3!C${totalIndex + 1}:I${totalIndex + 1}` : undefined;
  recordControl(result.controls, result.blockers, { key: "deferred_original_cost", sourceSheet: "9&10-3", sourceRange: range, expected: cellNumber(total?.[2]), actual: sum(facts, "originalCost"), blockerCode: "DEFERRED_SOURCE_TOTAL_MISSING", blockerMessage: "当前期 9&10-3 缺少来源合计控制" });
  recordControl(result.controls, result.blockers, { key: "deferred_current_amount", sourceSheet: "9&10-3", sourceRange: range, expected: cellNumber(total?.[6]), actual: money(facts.reduce((value, asset) => value + Number(asset.currentAmortization ?? asset.currentAllocation ?? 0), 0)), blockerCode: "DEFERRED_CURRENT_CONTROL_FAILED" });
  recordControl(result.controls, result.blockers, { key: "deferred_reported_accumulated", sourceSheet: "9&10-3", sourceRange: range, expected: sum(facts, "accumulatedAllocation", "accumulatedAmortization"), actual: cellNumber(total?.[7]) ?? money(facts.reduce((value, asset) => value + Number((rows[asset.sourceRow - 1] as unknown[])?.[7] ?? 0), 0)), blockerCode: "DEFERRED_ACCUMULATED_CONTROL_FAILED", blockerMessage: "来源累计摊销与原值减期末余额不一致" });
  recordControl(result.controls, result.blockers, { key: "deferred_opening_net", sourceSheet: "9&10-3", sourceRange: range, expected: money(facts.reduce((value, asset) => value + asset.closingNetAmount + Number(asset.currentAmortization ?? asset.currentAllocation ?? 0), 0)), actual: cellNumber(total?.[5]) ?? money(facts.reduce((value, asset) => value + Number((rows[asset.sourceRow - 1] as unknown[])?.[5] ?? 0), 0)), blockerCode: "DEFERRED_OPENING_BALANCE_CONTROL_FAILED", blockerMessage: "来源期初余额与期末余额加本期摊销不一致" });
  parseRenovationEvidence(workbook, rows, scope, result);
}

function parseDeferredFact(row: unknown[], sourceRow: number, scope: AssetWorkbookScope, result: OtherParseResult) {
  const name = cellText(row[0]);
  const note = cellText(row[9]);
  const sourceTerm = sourceTermMonths(row[3]);
  const impliedTerm = sourceTerm == null ? impliedLifeFromAmount(money(row[2]), money(row[4])) : undefined;
  const durationMonths = sourceTerm ?? impliedTerm;
  if (impliedTerm) result.blockers.push({ code: "DEFERRED_USEFUL_LIFE_IMPLIED_ONLY", message: "原值与月摊销金额只能推导隐含期限，需补明确数字期限或日期范围", sourceSheet: "9&10-3", sourceRange: factRange("9&10-3", "A", "J", sourceRow) });
  const longTerm = Boolean(durationMonths && durationMonths > 12 && /装修|改造/.test(name));
  const assetKind = longTerm ? "long_term_deferred" : "prepaid";
  if (longTerm) result.blockers.push({ code: "LEASEHOLD_IMPROVEMENT_EVIDENCE_MISSING", message: "装修支出需确认属于承租人改良、分摊期超过一年并补齐可使用起算证据", sourceSheet: "9&10-3", sourceRange: factRange("9&10-3", "A", "J", sourceRow) });
  if (!longTerm && !/预付账款|其他流动资产/.test(note)) result.blockers.push({ code: "SHORT_TERM_ACCOUNT_CLASSIFICATION_MISSING", message: "一年内费用缺少预付账款或其他流动资产的来源科目依据", sourceSheet: "9&10-3", sourceRange: factRange("9&10-3", "A", "J", sourceRow) });
  const originalCost = money(row[2]);
  const current = money(row[6]);
  const closingNet = money(row[8]);
  const closingAccumulated = money(originalCost - closingNet);
  const openingAccumulated = money(closingAccumulated - current);
  result.assets.push({
    ...evidence(scope, "9&10-3", sourceRow, "J", "本期摊销金额", "累计摊销额", note || undefined),
    assetCode: `${longTerm ? "LTDA" : "PA"}-${String(sourceRow).padStart(4, "0")}`,
    name,
    assetKind,
    categoryCandidate: longTerm ? "LT-LEASEHOLD" : prepaidCategoryCandidate(name),
    sourceCategory: note || "长期待摊费用源表",
    acquisitionDate: parseSourceDate(row[1]),
    depreciationStartDate: startDateFromTerms(row[3], row[9]),
    originalCost,
    usefulLifeMonths: durationMonths ? Math.round(durationMonths) : undefined,
    usefulLifeEvidence: sourceTerm ? "source_term" : impliedTerm ? "implied_amount_ratio" : undefined,
    openingAccumulatedAmount: openingAccumulated,
    openingAsOfDate: openingAsOfDate(scope),
    closingNetAmount: closingNet,
    ...(longTerm ? { currentAmortization: current, accumulatedAmortization: closingAccumulated } : { currentAllocation: current, accumulatedAllocation: closingAccumulated }),
  });
}

function parseRenovationEvidence(workbook: XLSX.WorkBook, rows: unknown[][], scope: AssetWorkbookScope, result: OtherParseResult) {
  const headerIndex = rows.findIndex((row) => cellText(row[0]) === "供应商" && cellText(row[3]).includes("不含税"));
  if (headerIndex < 0) return;
  const factRows: number[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    if (!cellText(rows[index]?.[0])) break;
    const amount = cellNumber(rows[index]?.[3]);
    if (amount == null) break;
    factRows.push(index + 1);
  }
  if (factRows.length === 0) return;
  const totalIndex = rows.findIndex((row, index) => index >= factRows.at(-1)! && !cellText(row[0]) && (cellNumber(row[3]) != null || Boolean(sourceCellFormula(workbook, "9&10-3", `D${index + 1}`))));
  const totalRow = totalIndex >= 0 ? totalIndex + 1 : undefined;
  const totalFormula = totalRow ? sourceCellFormula(workbook, "9&10-3", `D${totalRow}`) : undefined;
  const includedRows = includedRowsFromTotalFormula(totalFormula, factRows);
  if (!includedRows) result.blockers.push({ code: "RENOVATION_TOTAL_FORMULA_UNINTERPRETABLE", message: "装修来源总计公式缺失或无法解释事实行范围，不得猜测纳入/排除行", sourceSheet: "9&10-3", sourceRange: totalRow ? `9&10-3!D${totalRow}` : undefined });
  for (const sourceRow of factRows) {
    const included = includedRows?.has(sourceRow);
    result.renovationCostEvidence.push({
      ...evidence(scope, "9&10-3", sourceRow, "E"),
      supplier: cellText(rows[sourceRow - 1]?.[0]) || undefined,
      amount: money(rows[sourceRow - 1]?.[3]),
      treatment: included == null ? "unresolved" : included ? "included" : "excluded_from_source_total",
      reason: included === false ? "来源总计公式排除本行，未提供业务原因" : undefined,
    });
    if (included === false) result.blockers.push({ code: "RENOVATION_COST_EXCLUSION_REASON_MISSING", message: "装修成本控制公式排除本行发票，但来源未说明业务原因", sourceSheet: "9&10-3", sourceRange: `9&10-3!D${sourceRow}` });
  }
  const included = includedRows ? money(result.renovationCostEvidence.filter((line) => line.treatment === "included").reduce((value, line) => value + line.amount, 0)) : undefined;
  const rangeEnd = totalRow ?? factRows.at(-1)!;
  recordControl(result.controls, result.blockers, { key: "renovation_invoice_cost", sourceSheet: "9&10-3", sourceRange: `9&10-3!D${factRows[0]}:D${rangeEnd}`, expected: totalIndex >= 0 ? cellNumber(rows[totalIndex]?.[3]) : undefined, actual: included, blockerCode: "RENOVATION_INVOICE_CONTROL_FAILED" });
  result.blockers.push({ code: "RENOVATION_CARD_EVIDENCE_MISSING", message: "装修发票仅为成本证据；缺少承租人改良认定及可使用起算证据，不生成资产卡片", sourceSheet: "9&10-3", sourceRange: `9&10-3!A${factRows[0]}:E${rangeEnd}` });
}

function evidence(scope: AssetWorkbookScope, sheet: string, row: number, endColumn: string, sourceCurrentLabel?: string, sourceAccumulatedLabel?: string, sourceAccountHint?: string) {
  return { sourceFile: scope.sourceFile, sourceSheet: sheet, sourceRow: row, sourceRange: factRange(sheet, "A", endColumn, row), sourceKey: `${sheet}:${row}`, sourceCurrentLabel, sourceAccumulatedLabel, sourceAccountHint };
}

function sourceTermMonths(value: unknown) {
  const numeric = cellNumber(value);
  if (numeric != null && Number.isInteger(numeric) && numeric > 0) return numeric;
  const normalized = cellText(value).replace(/年|月/g, ".").replace(/日/g, "");
  const dates = normalized.match(/20\d{2}[.\/-]\d{1,2}(?:[.\/-]\d{1,2})?/g) ?? [];
  if (dates.length < 2) return undefined;
  const start = parseSourceDate(dates[0]);
  const end = parseSourceDate(dates[1]);
  if (!start || !end) return undefined;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  const months = Math.round(days / (365.2425 / 12));
  return months > 0 ? months : undefined;
}

function includedRowsFromTotalFormula(formula: string | undefined, factRows: number[]) {
  if (!formula) return undefined;
  const normalized = formula.toUpperCase().replace(/\$/g, "").replace(/^=/, "");
  const ranges = [...normalized.matchAll(/SUM\(D(\d+):D(\d+)\)/g)];
  const remainder = normalized.replace(/SUM\(D\d+:D\d+\)/g, "").replace(/[+\s]/g, "");
  if (ranges.length === 0 || remainder) return undefined;
  const facts = new Set(factRows);
  const included = new Set<number>();
  for (const match of ranges) {
    for (let row = Number(match[1]); row <= Number(match[2]); row += 1) {
      if (!facts.has(row)) return undefined;
      included.add(row);
    }
  }
  return included;
}

function sum(assets: ParsedCurrentPeriodAsset[], first: keyof ParsedCurrentPeriodAsset, second?: keyof ParsedCurrentPeriodAsset) {
  return money(assets.reduce((value, asset) => value + Number(asset[first] ?? (second ? asset[second] : 0) ?? 0), 0));
}

function startDateFromTerms(terms: unknown, note: unknown) {
  const text = `${cellText(terms)} ${cellText(note)}`;
  const explicit = text.match(/(20\d{2})年(\d{1,2})月开始/);
  return explicit ? `${explicit[1]}-${String(Number(explicit[2])).padStart(2, "0")}-01` : parseSourceDate(text);
}

function addCompanyLabel(result: OtherParseResult, value: unknown) {
  const label = cellText(value).split(/[-\r\n]/)[0]?.trim();
  if (label && !result.companyLabels.includes(label)) result.companyLabels.push(label);
}

function baseResult(): OtherParseResult {
  return { assets: [], renovationCostEvidence: [], controls: [], blockers: [], periodEvidence: [], companyLabels: [] };
}
