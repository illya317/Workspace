import * as xlsx from "xlsx";
import {
  type PreviewResult,
  type PreviewAccount,
  type PreviewVoucher,
  fixRowEncoding,
  getParentCode,
  detectCategory,
  detectBalanceDirection,
  parseAmount,
  hasEncodingIssue,
} from "../import";

export function parseJournal(
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

  // Report encoding issues
  const issueSet = new Set<string>();
  for (const voucher of voucherMap.values()) {
    if (hasEncodingIssue(voucher.description)) {
      issueSet.add(`凭证 ${voucher.voucherNo} 摘要存在乱码：${voucher.description}`);
    }
    for (const item of voucher.items) {
      if (hasEncodingIssue(item.description)) {
        issueSet.add(`凭证 ${voucher.voucherNo} 分录摘要存在乱码：${item.description}`);
      }
      if (hasEncodingIssue(item.accountName)) {
        issueSet.add(`凭证 ${voucher.voucherNo} 科目名称存在乱码：${item.accountName}`);
      }
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
