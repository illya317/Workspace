import * as xlsx from "xlsx";
import * as iconv from "iconv-lite";

// ─── Types ───────────────────────────────────────────────

export type ImportType = "balance" | "journal" | "account";

export interface PreviewResult {
  type: ImportType;
  companyCode: string;
  year: number;
  rows: number;
  accounts: PreviewAccount[];
  vouchers?: PreviewVoucher[];
  balances?: PreviewBalance[];
  errors: string[];
  warnings: string[];
}

export interface PreviewAccount {
  code: string;
  name: string;
  parentCode: string | null;
  category: string;
  balanceDirection: string;
  mnemonicCode?: string | null;
  currency?: string | null;
  subjectLevel?: number | null;
}

export interface PreviewVoucher {
  voucherNo: string;
  date: string;
  description: string;
  items: PreviewVoucherItem[];
  totalDebit: number;
  totalCredit: number;
}

export interface PreviewVoucherItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface PreviewBalance {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

// ─── Helpers ─────────────────────────────────────────────

function detectCategory(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (n.includes("资产") || n.includes("小计") && c.startsWith("1")) return "asset";
  if (n.includes("负债") || n.includes("权益")) return c.startsWith("2") || c.startsWith("3") || c.startsWith("4") ? "liability" : "equity";
  if (c.startsWith("1")) return "asset";
  if (c.startsWith("2")) return "liability";
  if (c.startsWith("3")) return "equity";
  if (c.startsWith("4")) return "equity";
  if (c.startsWith("5")) return "cost";
  if (c.startsWith("6")) {
    if (n.includes("收入")) return "revenue";
    return "expense";
  }
  return "other";
}

function detectBalanceDirection(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  // 累计折旧、减值准备等备抵科目贷方
  if (n.includes("累计折旧") || n.includes("减值准备") || n.includes("坏账准备")) return "credit";
  if (c.startsWith("1") || c.startsWith("5")) return "debit";
  if (c.startsWith("2") || c.startsWith("3") || c.startsWith("4")) return "credit";
  if (c.startsWith("6")) {
    if (n.includes("收入")) return "credit";
    return "debit";
  }
  return "debit";
}

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "" || s === "-") return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function fixGBK(str: string): string {
  if (!str || typeof str !== "string") return str;
  const buf = Buffer.from(str, "latin1");
  const decoded = iconv.decode(buf, "gbk");
  // CJK 汉字 + 扩展A + CJK 标点 + 全角字符（含％、＄等）
  const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/;

  // 如果解码后没有乱码（替换字符/控制字符）且有更多中文，使用解码结果
  const decodedHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(decoded);
  const strHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(str);
  const decodedCJKCount = (decoded.match(CJK_RE) || []).length;
  const strCJKCount = (str.match(CJK_RE) || []).length;

  if (!decodedHasGarbage && decodedCJKCount >= strCJKCount) {
    return decoded;
  }

  // 如果原字符串有乱码但解码后没有，也使用解码结果
  if (strHasGarbage && !decodedHasGarbage) {
    return decoded;
  }

  return str;
}

function fixRowEncoding(row: unknown[]): unknown[] {
  return row.map((cell) => (typeof cell === "string" ? fixGBK(cell) : cell));
}

function isSummaryRow(code: string, name: string): boolean {
  const n = (name || "").trim();
  const c = (code || "").trim();
  if (!c || c === "NaN") return true;
  if (n.includes("小计") || n.includes("合计") || n === "合计") return true;
  return false;
}

function getParentCode(code: string): string | null {
  if (code.length <= 4) return null;
  // 科目编码层级规则：
  // 1002 → 一级, 100201 → 二级(parent=1002), 10020101 → 三级(parent=100201)
  // 尝试逐级缩短找父级
  for (let i = code.length - 1; i >= 4; i--) {
    const parent = code.slice(0, i);
    if (parent.length >= 4) return parent;
  }
  return null;
}

function calcSubjectLevel(code: string): number {
  const len = code.length;
  if (len <= 4) return 1;
  return (len - 4) / 2 + 1;
}

function mapCategory(type: string, name: string, code?: string): string {
  const t = (type || "").trim();
  const n = (name || "").trim();
  if (t === "资产") return "asset";
  if (t === "负债") return "liability";
  if (t === "权益") return "equity";
  if (t === "成本") return "cost";
  if (t === "损益") {
    if (n.includes("收入")) return "revenue";
    return "expense";
  }
  if (code) return detectCategory(code, name);
  return "other";
}

function mapDirection(dir: string): string {
  const d = (dir || "").trim();
  if (d === "借" || d === "借方") return "debit";
  if (d === "贷" || d === "贷方") return "credit";
  return "debit";
}

// ─── Balance Sheet Parser ────────────────────────────────

export function parseBalanceSheet(
  buffer: Buffer,
  companyCode: string,
): PreviewResult {
  const wb = xlsx.read(buffer, { type: "buffer" });
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
  });

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

// ─── Journal Parser ──────────────────────────────────────

export function parseJournal(
  buffer: Buffer,
  companyCode: string,
): PreviewResult {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  data = data.map((row) => (Array.isArray(row) ? fixRowEncoding(row) : row));

  const errors: string[] = [];
  const warnings: string[] = [];
  const accounts: PreviewAccount[] = [];
  const vouchers: PreviewVoucher[] = [];

  let year = 0;
  let headerRow = -1;

  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i];
    if (!row) continue;
    const headers = row.map((c) => String(c || "").trim());
    if (headers.some((h) => h.includes("凭证号数"))) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    errors.push("无法找到表头行，请确认文件格式正确");
    return { type: "journal", companyCode, year: 0, rows: 0, accounts, vouchers, errors, warnings };
  }

  const headers = (data[headerRow] || []).map((c) => String(c || "").trim());
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h.includes("日期")) colIndex.date = i;
    if (h.includes("凭证号数")) colIndex.voucherNo = i;
    if (h.includes("科目编码")) colIndex.code = i;
    if (h.includes("科目名称")) colIndex.name = i;
    if (h.includes("摘要")) colIndex.desc = i;
    if (h.includes("方向")) colIndex.direction = i;
    if (h.includes("金额")) colIndex.amount = i;
  });

  if (colIndex.voucherNo === undefined || colIndex.code === undefined) {
    errors.push("缺少必要的列：凭证号数、科目编码");
    return { type: "journal", companyCode, year: 0, rows: 0, accounts, vouchers, errors, warnings };
  }

  const seenAccounts = new Map<string, string>();
  const voucherMap = new Map<string, PreviewVoucher>();

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const voucherNo = String(row[colIndex.voucherNo] || "").trim();
    const rawCode = String(row[colIndex.code] || "").trim();
    const rawName = String(row[colIndex.name] || "").trim();

    if (!voucherNo || !rawCode) continue;
    if (voucherNo.includes("合计")) continue;

    const code = rawCode.replace(/\.0$/, "");
    const name = rawName;
    const dateStr = String(row[colIndex.date] || "").trim();
    const description = String(row[colIndex.desc] || "").trim();
    const direction = String(row[colIndex.direction] || "").trim();
    const amount = parseAmount(row[colIndex.amount]);

    // Extract year from date
    if (year === 0 && dateStr) {
      const m = dateStr.match(/(\d{4})/);
      if (m) year = parseInt(m[1]);
    }

    if (!seenAccounts.has(code)) {
      seenAccounts.set(code, name);
      const category = detectCategory(code, name);
      const balanceDirection = detectBalanceDirection(code, name);
      const parentCode = getParentCode(code);
      accounts.push({ code, name, parentCode, category, balanceDirection });
    }

    const debit = direction === "借" ? amount : 0;
    const credit = direction === "贷" ? amount : 0;

    let voucher = voucherMap.get(voucherNo);
    if (!voucher) {
      voucher = {
        voucherNo,
        date: dateStr,
        description: description || "",
        items: [],
        totalDebit: 0,
        totalCredit: 0,
      };
      voucherMap.set(voucherNo, voucher);
    }

    voucher.items.push({
      accountCode: code,
      accountName: name,
      debit,
      credit,
      description: description || "",
    });
    voucher.totalDebit += debit;
    voucher.totalCredit += credit;
  }

  // Validate voucher balance
  for (const voucher of voucherMap.values()) {
    const diff = Math.abs(voucher.totalDebit - voucher.totalCredit);
    if (diff > 0.01) {
      warnings.push(
        `凭证 ${voucher.voucherNo} 借贷不平衡：借方 ${voucher.totalDebit.toFixed(2)} ≠ 贷方 ${voucher.totalCredit.toFixed(2)}`,
      );
    }
  }

  if (year === 0) {
    errors.push("无法从文件中识别会计年度");
  }

  return {
    type: "journal",
    companyCode,
    year,
    rows: data.length - headerRow - 1,
    accounts,
    vouchers: Array.from(voucherMap.values()),
    errors,
    warnings,
  };
}

// ─── Account Table Parser ────────────────────────────────

export function parseAccountTable(
  buffer: Buffer,
  companyCode: string,
): PreviewResult {
  const wb = xlsx.read(buffer, { type: "buffer" });
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
