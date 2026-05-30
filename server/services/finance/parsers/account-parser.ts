import * as xlsx from "xlsx";
import {
  type PreviewResult,
  type PreviewAccount,
  fixRowEncoding,
  isSummaryRow,
  getParentCode,
  calcSubjectLevel,
  mapCategory,
  mapDirection,
  detectBalanceDirection,
  fixGBK,
  hasEncodingIssue,
} from "../import";

export function parseAccountTable(
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

  let headerRow = -1;
  let format: "xls" | "xlsx" | null = null;

  // Detect header row and format
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i];
    if (!row) continue;
    const headers = row.map((c) => String(c || "").trim());
    const h = headers.join(",");

    // xls format: 类别/科目类型, 科目编码, 科目名称, 助记码, 币种, 余额方向
    if (h.includes("科目编码") && h.includes("科目名称") && (h.includes("助记码") || h.includes("币种"))) {
      headerRow = i;
      format = "xls";
      break;
    }
    // xlsx format: 科目级次, 科目编码, 科目名称, 科目类型, 余额方向
    if (h.includes("科目编码") && h.includes("科目名称") && h.includes("科目级次")) {
      headerRow = i;
      format = "xlsx";
      break;
    }
    // Generic: just code + name
    if (h.includes("科目编码") && h.includes("科目名称")) {
      headerRow = i;
      format = "xls";
      break;
    }
  }

  if (headerRow === -1) {
    errors.push("无法找到表头行，请确认文件包含「科目编码」「科目名称」列");
    return { type: "account", companyCode, year: 0, rows: 0, accounts, errors, warnings };
  }

  const headers = (data[headerRow] || []).map((c) => String(c || "").trim());
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h.includes("科目编码")) colIndex.code = i;
    if (h.includes("科目名称")) colIndex.name = i;
    if (h.includes("科目级次") || h.includes("层级")) colIndex.level = i;
    if (h.includes("类别") || h.includes("类型")) colIndex.category = i;
    if (h.includes("助记码")) colIndex.mnemonic = i;
    if (h.includes("币种")) colIndex.currency = i;
    if (h.includes("方向") || h.includes("余额方向")) colIndex.direction = i;
  });

  if (colIndex.code === undefined || colIndex.name === undefined) {
    errors.push("缺少必要的列：科目编码、科目名称");
    return { type: "account", companyCode, year: 0, rows: 0, accounts, errors, warnings };
  }

  const seenCodes = new Set<string>();
  const year = 0;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const rawCode = String(row[colIndex.code] || "").trim().replace(/\.0$/, "");
    const rawName = String(row[colIndex.name] || "").trim();

    if (!rawCode || !rawName) continue;
    if (isSummaryRow(rawCode, rawName)) continue;

    const code = rawCode;
    const name = fixGBK(rawName);

    if (seenCodes.has(code)) {
      warnings.push(`科目编码重复：${code} ${name}，已跳过`);
      continue;
    }
    seenCodes.add(code);

    // Parse optional fields based on format
    let category = "other";
    let balanceDirection = "debit";
    let mnemonicCode: string | null = null;
    let currency: string | null = null;
    let subjectLevel: number | null = null;

    if (format === "xls") {
      // xls: [0]=类别, [1]=层级, [2]=编码, [3]=名称, [4]=助记码, [5]=币种, ... [9]=方向
      const typeVal = colIndex.category !== undefined ? String(row[colIndex.category] || "").trim() : "";
      const dirVal = colIndex.direction !== undefined ? String(row[colIndex.direction] || "").trim() : "";
      category = mapCategory(typeVal, name, code);
      balanceDirection = dirVal ? mapDirection(dirVal) : detectBalanceDirection(code, name);
      mnemonicCode = colIndex.mnemonic !== undefined ? String(row[colIndex.mnemonic] || "").trim() || null : null;
      currency = colIndex.currency !== undefined ? String(row[colIndex.currency] || "").trim() || null : null;
      if (colIndex.level !== undefined) {
        const lv = parseInt(String(row[colIndex.level] || "").trim().replace(/\.0$/, ""), 10);
        subjectLevel = isNaN(lv) ? calcSubjectLevel(code) : lv;
      } else {
        subjectLevel = calcSubjectLevel(code);
      }
    } else {
      // xlsx: [0]=层级, [1]=编码, [2]=名称, [3]=类型, [4]=方向
      const typeVal = colIndex.category !== undefined ? String(row[colIndex.category] || "").trim() : "";
      const dirVal = colIndex.direction !== undefined ? String(row[colIndex.direction] || "").trim() : "";
      category = mapCategory(typeVal, name, code);
      balanceDirection = dirVal ? mapDirection(dirVal) : detectBalanceDirection(code, name);
      if (colIndex.level !== undefined) {
        const lv = parseInt(String(row[colIndex.level] || "").trim().replace(/\.0$/, ""), 10);
        subjectLevel = isNaN(lv) ? calcSubjectLevel(code) : lv;
      } else {
        subjectLevel = calcSubjectLevel(code);
      }
    }

    const parentCode = getParentCode(code);

    accounts.push({
      code,
      name,
      parentCode,
      category,
      balanceDirection,
      mnemonicCode,
      currency,
      subjectLevel,
    });
  }

  // Report encoding issues
  const issueSet = new Set<string>();
  for (const acc of accounts) {
    if (hasEncodingIssue(acc.name)) {
      issueSet.add(`科目 ${acc.code} 名称存在乱码：${acc.name}`);
    }
  }
  if (issueSet.size > 0) {
    warnings.push(`检测到 ${issueSet.size} 条编码异常记录（原始文件截断或损坏）`);
    for (const msg of issueSet) warnings.push(msg);
  }

  return {
    type: "account",
    companyCode,
    year,
    rows: data.length - headerRow - 1,
    accounts,
    errors,
    warnings,
  };
}
