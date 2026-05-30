import * as xlsx from "xlsx";
import {
  type PreviewResult,
  type PreviewAccount,
  type PreviewBalance,
  fixRowEncoding,
  isSummaryRow,
  getParentCode,
  detectCategory,
  detectBalanceDirection,
  parseAmount,
  hasEncodingIssue,
} from "../import";

export function parseBalanceSheet(
  buffer: Buffer,
  companyCode: string,
  fileExt?: string,
): PreviewResult {
  const wb = xlsx.read(buffer, { type: "buffer", codepage: fileExt === ".xls" ? 936 : undefined });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  data = data.map((row) => (Array.isArray(row) ? fixRowEncoding(row) : row));

  const errors: string[] = [];
  const warnings: string[] = [];
  const accounts: PreviewAccount[] = [];
  const balances: PreviewBalance[] = [];

  let year = 0;
  let headerRow = -1;

  // Find header row
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i];
    if (!row) continue;
    const headers = row.map((c) => String(c || "").trim());
    if (headers.some((h) => h.includes("科目编码"))) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    errors.push("无法找到表头行，请确认文件格式正确");
    return { type: "balance", companyCode, year: 0, rows: 0, accounts, balances, errors, warnings };
  }

  const headers = (data[headerRow] || []).map((c) => String(c || "").trim());
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h.includes("会计年度")) colIndex.year = i;
    if (h.includes("会计期间")) colIndex.period = i;
    if (h.includes("科目编码")) colIndex.code = i;
    if (h.includes("科目名称")) colIndex.name = i;
    if (h.includes("期初借方")) colIndex.openDebit = i;
    if (h.includes("期初贷方")) colIndex.openCredit = i;
    if (h.includes("本期发生借方")) colIndex.currDebit = i;
    if (h.includes("本期发生贷方")) colIndex.currCredit = i;
    if (h.includes("期末借方")) colIndex.closeDebit = i;
    if (h.includes("期末贷方")) colIndex.closeCredit = i;
    // Some XLSX exports use merged headers:
    // 期初余额 | 本期发生 | 期末余额, with 借方/贷方 on the next row.
    if (h.includes("期初余额")) {
      colIndex.openDebit = i;
      colIndex.openCredit = i + 1;
    }
    if (h.includes("本期发生")) {
      colIndex.currDebit = i;
      colIndex.currCredit = i + 1;
    }
    if (h.includes("期末余额")) {
      colIndex.closeDebit = i;
      colIndex.closeCredit = i + 1;
    }
  });

  // Some exports put the period above the header, e.g. "期间: 2024.01 - 2024.12".
  for (let i = 0; i < Math.min(data.length, headerRow + 1); i++) {
    for (const cell of data[i] || []) {
      const text = String(cell || "");
      const m = text.match(/(20\d{2})/);
      if (m) {
        year = parseInt(m[1], 10);
        break;
      }
    }
    if (year) break;
  }

  if (colIndex.code === undefined || colIndex.name === undefined) {
    errors.push("缺少必要的列：科目编码、科目名称");
    return { type: "balance", companyCode, year: 0, rows: 0, accounts, balances, errors, warnings };
  }

  const seenCodes = new Set<string>();

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const rawCode = String(row[colIndex.code] || "").trim();
    const rawName = String(row[colIndex.name] || "").trim();

    if (!rawCode || !rawName) continue;
    if (isSummaryRow(rawCode, rawName)) continue;

    // Extract year from first data row
    if (year === 0 && colIndex.year !== undefined) {
      const y = parseInt(String(row[colIndex.year] || ""));
      if (!isNaN(y)) year = y;
    }
    if (year === 0 && colIndex.period !== undefined) {
      const p = String(row[colIndex.period] || "");
      const m = p.match(/(\d{4})/);
      if (m) year = parseInt(m[1]);
    }

    const code = rawCode.replace(/\.0$/, "");
    const name = rawName;

    if (seenCodes.has(code)) {
      warnings.push(`科目编码重复：${code} ${name}，已跳过`);
      continue;
    }
    seenCodes.add(code);

    const category = detectCategory(code, name);
    const balanceDirection = detectBalanceDirection(code, name);
    const parentCode = getParentCode(code);

    accounts.push({ code, name, parentCode, category, balanceDirection });

    balances.push({
      accountCode: code,
      accountName: name,
      openingDebit: parseAmount(row[colIndex.openDebit]),
      openingCredit: parseAmount(row[colIndex.openCredit]),
      currentDebit: parseAmount(row[colIndex.currDebit]),
      currentCredit: parseAmount(row[colIndex.currCredit]),
      closingDebit: parseAmount(row[colIndex.closeDebit]),
      closingCredit: parseAmount(row[colIndex.closeCredit]),
    });
  }

  // Report encoding issues
  const issueSet = new Set<string>();
  for (const bal of balances) {
    if (hasEncodingIssue(bal.accountName)) {
      issueSet.add(`科目 ${bal.accountCode} 名称存在乱码：${bal.accountName}`);
    }
  }
  if (issueSet.size > 0) {
    warnings.push(`检测到 ${issueSet.size} 条编码异常记录（原始文件截断或损坏）`);
    for (const msg of issueSet) warnings.push(msg);
  }

  if (year === 0) {
    errors.push("无法从文件中识别会计年度");
  }

  return {
    type: "balance",
    companyCode,
    year,
    rows: data.length - headerRow - 1,
    accounts,
    balances,
    errors,
    warnings,
  };
}
