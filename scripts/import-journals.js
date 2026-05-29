const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const db = new Database('/Users/koito/Desktop/Project/HR/data/dev.db');

// ─── GBK Fix ─────────────────────────────────────────────

// sheetjs 读取 .xls 时会把 GBK trail byte 0x80-0x9F 错误映射为 Windows-1252 字符
// 先还原这些字符，再做 latin1 -> GBK 解码
const WIN1252_REV = (() => {
  const m = {};
  const pairs = [
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
    [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
    [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
    [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
  ];
  for (const [u, b] of pairs) {
    m[String.fromCharCode(u)] = String.fromCharCode(b);
  }
  return m;
})();

function restoreWin1252Bytes(str) {
  let result = '';
  for (const c of str) {
    result += WIN1252_REV[c] ?? c;
  }
  return result;
}

function fixGBK(str) {
  if (!str || typeof str !== 'string') return str;
  const restored = restoreWin1252Bytes(str);
  const buf = Buffer.from(restored, 'latin1');
  const decoded = iconv.decode(buf, 'gbk');
  const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/g;

  const decodedHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(decoded);
  const strHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(str);
  const decodedCJKCount = (decoded.match(CJK_RE) || []).length;
  const strCJKCount = (str.match(CJK_RE) || []).length;

  if (!decodedHasGarbage && decodedCJKCount >= strCJKCount) {
    return decoded;
  }
  if (strHasGarbage && !decodedHasGarbage) {
    return decoded;
  }
  return str;
}

function fixRowEncoding(row) {
  return row.map(c => typeof c === 'string' ? fixGBK(c) : c);
}

function hasEncodingIssue(str) {
  return typeof str === 'string' && str.includes('�');
}

// ─── Parse date string ───────────────────────────────────

function parseDate(str) {
  const s = String(str || '').trim();
  // 2024.01.01 or 2024-01-01
  const m = s.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return { year, month, day, str: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

// ─── Load account mapping ────────────────────────────────

function loadAccountMap(companyCode, year) {
  const rows = db.prepare('SELECT id, code FROM FinanceAccount WHERE companyCode = ? AND year = ?').all(companyCode, year);
  const map = new Map();
  for (const r of rows) map.set(r.code, r.id);
  return map;
}

// ─── Get or create period ────────────────────────────────

function getOrCreatePeriod(year, month, companyCode) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // Simple end date: assume 31st (SQLite doesn't need exact)
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  let period = db.prepare('SELECT id FROM FinancePeriod WHERE year = ? AND month = ? AND companyCode = ?').get(year, month, companyCode);
  if (period) return period.id;

  const result = db.prepare(
    `INSERT INTO FinancePeriod (year, month, startDate, endDate, companyCode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(year, month, startDate, endDate, companyCode);
  return result.lastInsertRowid;
}

// ─── Parse format A (丰华生物/天力通/上海悦通) ─────────────
// Columns: 日期, 凭证号数, 上级科目, 科目编码, 科目名称, 摘要, 方向, 数量, 外币, 金额

function parseFormatA(data, companyCode) {
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 10) continue;
    const dateStr = String(row[0] || '').trim();
    const voucherNo = String(row[1] || '').trim();
    const accountCode = String(row[3] || '').trim().replace(/\.0$/, '');
    const description = String(row[5] || '').trim();
    const direction = String(row[6] || '').trim();
    const amount = Number(row[9] || 0);
    if (!dateStr || !voucherNo || !accountCode) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    const debit = direction === '借' ? amount : 0;
    const credit = direction === '贷' ? amount : 0;

    items.push({
      dateStr: parsed.str,
      year: parsed.year,
      month: parsed.month,
      voucherNo,
      accountCode,
      description,
      debit,
      credit,
      companyCode,
    });
  }
  return items;
}

// ─── Parse format B (加拿大) ───────────────────────────────
// Columns: 日期, 凭证号数, 科目编码, 科目名称, 摘要, 方向, 数量, 外币, 金额

function parseFormatB(data, companyCode) {
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 9) continue;
    const dateStr = String(row[0] || '').trim();
    const voucherNo = String(row[1] || '').trim();
    const accountCode = String(row[2] || '').trim().replace(/\.0$/, '');
    const description = String(row[4] || '').trim();
    const direction = String(row[5] || '').trim();
    const amount = Number(row[8] || 0);
    if (!dateStr || !voucherNo || !accountCode) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    const debit = direction === '借' ? amount : 0;
    const credit = direction === '贷' ? amount : 0;

    items.push({
      dateStr: parsed.str,
      year: parsed.year,
      month: parsed.month,
      voucherNo,
      accountCode,
      description,
      debit,
      credit,
      companyCode,
    });
  }
  return items;
}

// ─── Parse format C (丰华悦通) ────────────────────────────
// Columns: 制单日期, 凭证字号, 凭证总金额, 审核人, 制单人, 摘要, 科目编码, 科目名称, 辅助项, 借方, 贷方

function parseFormatC(data, companyCode) {
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 11) continue;
    const dateStr = String(row[0] || '').trim();
    const voucherNo = String(row[1] || '').trim();
    const description = String(row[5] || '').trim();
    const accountCode = String(row[6] || '').trim().replace(/\.0$/, '');
    const debitVal = row[9];
    const creditVal = row[10];
    if (!dateStr || !voucherNo || !accountCode) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    const debit = debitVal !== '' && debitVal !== undefined ? Number(debitVal) : 0;
    const credit = creditVal !== '' && creditVal !== undefined ? Number(creditVal) : 0;

    items.push({
      dateStr: parsed.str,
      year: parsed.year,
      month: parsed.month,
      voucherNo,
      accountCode,
      description,
      debit,
      credit,
      companyCode,
    });
  }
  return items;
}

// ─── Detect format from headers ──────────────────────────

function detectFormat(headers) {
  const h = headers.map(c => String(c || '').trim());
  if (h.some(x => x.includes('制单日期'))) return 'C';
  if (h.some(x => x.includes('上级科目'))) return 'A';
  return 'B';
}

// ─── Parse file ──────────────────────────────────────────

function parseJournalFile(filePath, companyCode) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const wb = xlsx.read(buf, { type: 'buffer', codepage: ext === '.xls' ? 936 : undefined });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  data = data.map(row => Array.isArray(row) ? fixRowEncoding(row) : row);

  if (data.length < 2) return [];
  const format = detectFormat(data[0]);

  if (format === 'A') return parseFormatA(data, companyCode);
  if (format === 'B') return parseFormatB(data, companyCode);
  return parseFormatC(data, companyCode);
}

// ─── Import items ────────────────────────────────────────

const insertVoucherStmt = db.prepare(`
  INSERT INTO FinanceVoucher (voucherNo, date, periodId, description, totalDebit, totalCredit, status, companyCode, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, datetime('now'), datetime('now'))
  ON CONFLICT(voucherNo, companyCode) DO UPDATE SET
    date = excluded.date,
    description = excluded.description,
    totalDebit = excluded.totalDebit,
    totalCredit = excluded.totalCredit,
    updatedAt = datetime('now')
`);

const insertItemStmt = db.prepare(`
  INSERT INTO FinanceVoucherItem (voucherId, accountId, debit, credit, description, sortOrder)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function importJournal(items, companyCode, fileName) {
  const year = items.length > 0 ? items[0].year : new Date().getFullYear();
  const accountMap = loadAccountMap(companyCode, year);

  // Group by voucherNo + month（处理按月重新编号的凭证号）
  const voucherGroups = new Map();
  for (const item of items) {
    const groupKey = `${item.voucherNo}-${item.month}`;
    if (!voucherGroups.has(groupKey)) {
      voucherGroups.set(groupKey, []);
    }
    voucherGroups.get(groupKey).push(item);
  }

  let vouchersInserted = 0;
  let itemsInserted = 0;
  const skippedDetails = [];
  const encodingIssues = [];

  for (const [voucherNo, voucherItems] of voucherGroups) {
    const first = voucherItems[0];
    const periodId = getOrCreatePeriod(first.year, first.month, companyCode);
    const description = first.description;
    // 凭证号加年份+月份前缀，避免同公司同年度跨月重复
    const yearPrefixedVoucherNo = `${first.year}-${String(first.month).padStart(2, '0')}-${voucherNo}`;

    let totalDebit = 0;
    let totalCredit = 0;
    const validItems = [];

    for (let idx = 0; idx < voucherItems.length; idx++) {
      const it = voucherItems[idx];
      const accountId = accountMap.get(it.accountCode);
      if (!accountId) {
        skippedDetails.push({
          file: fileName,
          companyCode,
          voucherNo: yearPrefixedVoucherNo,
          date: it.dateStr,
          accountCode: it.accountCode,
          description: it.description,
          debit: it.debit,
          credit: it.credit,
        });
        continue;
      }
      totalDebit += it.debit;
      totalCredit += it.credit;
      validItems.push({ ...it, accountId, sortOrder: idx });

      // Check encoding issues
      if (hasEncodingIssue(it.description)) {
        encodingIssues.push({
          file: fileName,
          voucherNo: yearPrefixedVoucherNo,
          date: it.dateStr,
          accountCode: it.accountCode,
          description: it.description,
        });
      }
    }

    if (validItems.length === 0) continue;

    // Insert or update voucher, then get its id
    insertVoucherStmt.run(
      yearPrefixedVoucherNo, first.dateStr, periodId, description,
      totalDebit, totalCredit, companyCode
    );
    const voucherRow = db.prepare('SELECT id FROM FinanceVoucher WHERE voucherNo = ? AND companyCode = ?').get(yearPrefixedVoucherNo, companyCode);
    const voucherId = voucherRow.id;

    // Delete old items for this voucher (in case of update)
    db.prepare('DELETE FROM FinanceVoucherItem WHERE voucherId = ?').run(voucherId);

    // Insert items
    for (const it of validItems) {
      insertItemStmt.run(voucherId, it.accountId, it.debit, it.credit, it.description, it.sortOrder);
      itemsInserted++;
    }
    vouchersInserted++;
  }

  return { vouchersInserted, itemsInserted, skippedDetails, encodingIssues };
}

// ─── Main ────────────────────────────────────────────────

const baseDir = '/Users/koito/Desktop/Project/HR/prisma/seed-data/财务数据';

const files = [
  // 丰华生物 (01) - format A
  { path: path.join(baseDir, '丰华生物/序时账-丰华生物2024.xls'), code: '01', name: '丰华生物2024' },
  { path: path.join(baseDir, '丰华生物/序时账-丰华生物2025.xls'), code: '01', name: '丰华生物2025' },
  { path: path.join(baseDir, '丰华生物/序时账-丰华生物2026.04.xls'), code: '01', name: '丰华生物2026.04' },
  // 天力通 (02) - format A
  { path: path.join(baseDir, '天力通/序时账-天力通2024.xls'), code: '02', name: '天力通2024' },
  { path: path.join(baseDir, '天力通/序时账-天力通2025.xls'), code: '02', name: '天力通2025' },
  { path: path.join(baseDir, '天力通/序时账-天力通2026.4.xls'), code: '02', name: '天力通2026.4' },
  // 上海悦通 (03) - format A
  { path: path.join(baseDir, '上海悦通/序时账-上海悦通2024.xls'), code: '03', name: '上海悦通2024' },
  { path: path.join(baseDir, '上海悦通/序时账-上海悦通2025.xls'), code: '03', name: '上海悦通2025' },
  { path: path.join(baseDir, '上海悦通/序时账-上海悦通2026.4.xls'), code: '03', name: '上海悦通2026.4' },
  // 加拿大 (04) - format B
  { path: path.join(baseDir, '加拿大/序时账-加拿大2024.xls'), code: '04', name: '加拿大2024' },
  { path: path.join(baseDir, '加拿大/序时账-加拿大2025.xls'), code: '04', name: '加拿大2025' },
  { path: path.join(baseDir, '加拿大/序时账-加拿大2026.3.xls'), code: '04', name: '加拿大2026.3' },
  // 丰华悦通 (05) - format C
  { path: path.join(baseDir, '丰华悦通/序时账/ะ๒สฑีห -ทแปชิรอจ2024.xlsx'), code: '05', name: '丰华悦通2024' },
  { path: path.join(baseDir, '丰华悦通/序时账/ะ๒สฑีห -ทแปชิรอจ2025.xlsx'), code: '05', name: '丰华悦通2025' },
  { path: path.join(baseDir, '丰华悦通/序时账/ะ๒สฑีห-ทแปชิรอจ 2026.04.xlsx'), code: '05', name: '丰华悦通2026.04' },
];

console.log('=== Import Journals ===\n');

let totalVouchers = 0;
let totalItems = 0;
const allSkipped = [];
const allEncodingIssues = [];

for (const file of files) {
  console.log(`Parsing ${file.name}...`);
  const items = parseJournalFile(file.path, file.code);
  console.log(`  → ${items.length} rows`);

  console.log(`Importing ${file.name}...`);
  const result = importJournal(items, file.code, file.name);
  console.log(`  → Vouchers: ${result.vouchersInserted}, Items: ${result.itemsInserted}, Skipped: ${result.skippedDetails.length}, EncodingIssues: ${result.encodingIssues.length}`);

  totalVouchers += result.vouchersInserted;
  totalItems += result.itemsInserted;
  allSkipped.push(...result.skippedDetails);
  allEncodingIssues.push(...result.encodingIssues);
}

console.log('\n=== Import Complete ===');
console.log(`Total Vouchers: ${totalVouchers}`);
console.log(`Total Items: ${totalItems}`);
console.log(`Skipped (account not found): ${allSkipped.length}`);
console.log(`Encoding issues: ${allEncodingIssues.length}`);

// ─── Skip Report ─────────────────────────────────────────
if (allSkipped.length > 0) {
  console.log('\n=== Skip Report (by account code) ===');
  const skipByCode = new Map();
  for (const s of allSkipped) {
    if (!skipByCode.has(s.accountCode)) {
      skipByCode.set(s.accountCode, { count: 0, examples: [] });
    }
    const entry = skipByCode.get(s.accountCode);
    entry.count++;
    if (entry.examples.length < 3) {
      entry.examples.push({ voucherNo: s.voucherNo, date: s.date, description: s.description });
    }
  }
  for (const [code, info] of [...skipByCode.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`\n  Account: ${code}  (${info.count} rows skipped)`);
    for (const ex of info.examples) {
      console.log(`    Example: ${ex.voucherNo} | ${ex.date} | ${ex.description}`);
    }
  }

  // Save detailed report to JSON
  const reportPath = '/Users/koito/Desktop/Project/HR/scripts/import-skip-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(allSkipped, null, 2), 'utf-8');
  console.log(`\n  Detailed report saved to: ${reportPath}`);
}

// ─── Encoding Issue Report ───────────────────────────────
if (allEncodingIssues.length > 0) {
  console.log('\n=== Encoding Issue Report ===');
  for (const issue of allEncodingIssues) {
    console.log(`  ${issue.file} | ${issue.voucherNo} | ${issue.date} | ${issue.accountCode} | ${issue.description}`);
  }

  // Save detailed report to JSON
  const encodingReportPath = '/Users/koito/Desktop/Project/HR/scripts/import-encoding-report.json';
  fs.writeFileSync(encodingReportPath, JSON.stringify(allEncodingIssues, null, 2), 'utf-8');
  console.log(`\n  Detailed encoding report saved to: ${encodingReportPath}`);
}

// Final stats
const stats = db.prepare('SELECT COUNT(*) as c FROM FinanceVoucher').get();
const itemStats = db.prepare('SELECT COUNT(*) as c FROM FinanceVoucherItem').get();
const periodStats = db.prepare('SELECT COUNT(*) as c FROM FinancePeriod').get();
console.log(`\nDatabase: Vouchers=${stats.c}, Items=${itemStats.c}, Periods=${periodStats.c}`);

db.close();
