const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

const db = new Database(process.env.DATABASE_URL?.replace('file:', '') || './data/dev.db');

function fixGBK(str) {
  if (!str || typeof str !== 'string') return str;
  const buf = Buffer.from(str, 'latin1');
  const decoded = iconv.decode(buf, 'gbk');
  const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/;
  if (CJK_RE.test(decoded) && !CJK_RE.test(str)) return decoded;
  return str;
}

function mapCategory(type, name) {
  const t = (type || '').trim();
  const n = (name || '').trim();
  if (t === '资产') return 'asset';
  if (t === '负债') return 'liability';
  if (t === '权益') return 'equity';
  if (t === '成本') return 'cost';
  if (t === '损益') {
    if (n.includes('收入')) return 'revenue';
    return 'expense';
  }
  return 'other';
}

function mapDirection(dir) {
  const d = (dir || '').trim();
  if (d === '借' || d === '借方') return 'debit';
  if (d === '贷' || d === '贷方') return 'credit';
  return 'debit';
}

function getParentCode(code) {
  if (code.length <= 4) return null;
  return code.slice(0, code.length - 2);
}

function calcSubjectLevel(code) {
  const len = code.length;
  if (len <= 4) return 1;
  return (len - 4) / 2 + 1;
}

function parseXLS(filePath, companyCode) {
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  data = data.map(row => Array.isArray(row) ? row.map(c => typeof c === 'string' ? fixGBK(c) : c) : row);

  const accounts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    const type = String(row[0] || '').trim();
    const levelRaw = String(row[1] || '').trim().replace(/\.0$/, '');
    const code = String(row[2] || '').trim().replace(/\.0$/, '');
    const name = String(row[3] || '').trim();
    const mnemonic = String(row[4] || '').trim();
    const currency = String(row[5] || '').trim();
    const direction = String(row[9] || '').trim();
    if (!code || !name) continue;

    const level = levelRaw ? parseInt(levelRaw, 10) : calcSubjectLevel(code);
    accounts.push({ code, name, category: mapCategory(type, name), balanceDirection: mapDirection(direction), mnemonicCode: mnemonic || null, currency: currency || null, parentCode: getParentCode(code), companyCode, subjectLevel: isNaN(level) ? calcSubjectLevel(code) : level });
  }
  return accounts;
}

function parseXLSX(filePath, companyCode) {
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const accounts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const levelRaw = String(row[0] || '').trim().replace(/\.0$/, '');
    const code = String(row[1] || '').trim().replace(/\.0$/, '');
    const name = String(row[2] || '').trim();
    const type = String(row[3] || '').trim();
    const direction = String(row[4] || '').trim();
    if (!code || !name) continue;

    const level = levelRaw ? parseInt(levelRaw, 10) : calcSubjectLevel(code);
    accounts.push({ code, name, category: mapCategory(type, name), balanceDirection: mapDirection(direction), mnemonicCode: null, currency: null, parentCode: getParentCode(code), companyCode, subjectLevel: isNaN(level) ? calcSubjectLevel(code) : level });
  }
  return accounts;
}

function parseAccountTable(filePath, companyCode) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx') return parseXLSX(filePath, companyCode);
  return parseXLS(filePath, companyCode);
}

const YEAR = 2026;

const files = [
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华生物2026.xls'), code: '01', name: '丰华生物' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海天力通2026.xls'), code: '02', name: '上海天力通' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海悦通2026.xls'), code: '03', name: '上海悦通' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-加拿大2026.xls'), code: '04', name: '加拿大' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华悦通2026.xlsx'), code: '05', name: '丰华悦通' },
];

console.log('=== Step 1: Parse all files ===\n');

const allAccounts = [];
const fengHuaCodeSet = new Set();
const fengHuaNameToCode = new Map();

for (const file of files) {
  console.log(`Parsing ${file.name}...`);
  const accounts = parseAccountTable(file.path, file.code);
  allAccounts.push({ file, accounts });
  console.log(`  → ${accounts.length} accounts`);
  if (file.code === '01') {
    for (const acc of accounts) {
      fengHuaCodeSet.add(acc.code);
      if (!fengHuaNameToCode.has(acc.name)) fengHuaNameToCode.set(acc.name, acc.code);
    }
  }
}

console.log(`\n丰华生物标准编码总数: ${fengHuaCodeSet.size}`);
console.log(`丰华生物标准名称映射数: ${fengHuaNameToCode.size}`);

// Step 2: Build groupSubjectCode mapping
// 规则1: 丰华生物总部 = 自己的 code
// 规则2: 其他公司 = code 精确匹配 丰华生物 code
// 规则3: 规则2未匹配上的 = name 匹配 丰华生物 name（处理编码不同但名称相同的情况）

for (const item of allAccounts) {
  const isHeadquarter = item.file.code === '01';
  let codeMatched = 0, nameMatched = 0, unmatched = 0;
  for (const acc of item.accounts) {
    if (isHeadquarter) {
      acc.groupSubjectCode = acc.code;
    } else if (fengHuaCodeSet.has(acc.code)) {
      acc.groupSubjectCode = acc.code; codeMatched++;
    } else if (fengHuaNameToCode.has(acc.name)) {
      acc.groupSubjectCode = fengHuaNameToCode.get(acc.name); nameMatched++;
    } else {
      acc.groupSubjectCode = null; unmatched++;
    }
  }
  if (!isHeadquarter) console.log(`  ${item.file.name}: 编码匹配=${codeMatched}, 名称匹配=${nameMatched}, 未映射=${unmatched}`);
}

// Step 3: Upsert to database (UPDATE existing, INSERT new)
console.log('\n=== Step 2: Upsert to database ===\n');

// Check existing voucher references
const voucherRefCount = db.prepare('SELECT COUNT(*) as c FROM FinanceVoucherItem vi JOIN FinanceAccount a ON vi.accountId = a.id WHERE a.year = ?').get(YEAR).c;
console.log(`FinanceVoucherItem references to year ${YEAR} accounts: ${voucherRefCount}`);

if (voucherRefCount > 0) {
  console.log('WARNING: Existing voucher items reference these accounts. Using UPDATE-only mode for groupSubjectCode.\n');
}

const existingRows = db.prepare('SELECT id, code, companyCode, year FROM FinanceAccount WHERE year = ?').all(YEAR);
const existingKeys = new Map();
for (const r of existingRows) {
  existingKeys.set(`${r.companyCode}:${r.code}`, r.id);
}

let updated = 0, inserted = 0, skipped = 0;

const updateStmt = db.prepare(`
  UPDATE FinanceAccount SET
    name = ?, category = ?, balanceDirection = ?, mnemonicCode = ?, currency = ?,
    groupSubjectCode = ?, subjectLevel = ?, updatedAt = datetime('now')
  WHERE id = ?
`);

const insertStmt = db.prepare(`
  INSERT INTO FinanceAccount (
    code, name, category, parentId, balanceDirection, isActive,
    companyCode, mnemonicCode, currency, groupSubjectCode, subjectLevel,
    year, sortOrder, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
`);

for (const item of allAccounts) {
  const { file, accounts } = item;
  console.log(`Processing ${file.name} (${file.code}, year=${YEAR})...`);

  // Sort by code length for parent resolution
  accounts.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));

  const codeToId = {};
  let itemUpdated = 0, itemInserted = 0, itemSkipped = 0;

  for (const acc of accounts) {
    const key = `${acc.companyCode}:${acc.code}`;
    const existingId = existingKeys.get(key);

    if (existingId) {
      // Update existing record
      updateStmt.run(
        acc.name, acc.category, acc.balanceDirection, acc.mnemonicCode, acc.currency,
        acc.groupSubjectCode, acc.subjectLevel, existingId
      );
      codeToId[acc.code] = existingId;
      itemUpdated++;
    } else if (voucherRefCount === 0) {
      // Insert new record only if no voucher references exist
      let parentId = null;
      if (acc.parentCode && codeToId[acc.parentCode] !== undefined) {
        parentId = codeToId[acc.parentCode];
      }
      const info = insertStmt.run(
        acc.code, acc.name, acc.category, parentId, acc.balanceDirection,
        acc.companyCode, acc.mnemonicCode, acc.currency, acc.groupSubjectCode,
        acc.subjectLevel, YEAR
      );
      codeToId[acc.code] = info.lastInsertRowid;
      itemInserted++;
    } else {
      // Skip: can't insert new when vouchers exist
      itemSkipped++;
    }
  }

  updated += itemUpdated;
  inserted += itemInserted;
  skipped += itemSkipped;
  console.log(`  → Updated: ${itemUpdated}, Inserted: ${itemInserted}, Skipped: ${itemSkipped}`);
}

console.log('\n=== Import Complete ===');
console.log(`Total updated: ${updated}, inserted: ${inserted}, skipped: ${skipped}`);

const stats = db.prepare(`
  SELECT companyCode, year, COUNT(*) as cnt,
    COUNT(parentId) as has_parent,
    COUNT(groupSubjectCode) as has_group
  FROM FinanceAccount WHERE year = ?
  GROUP BY companyCode ORDER BY companyCode
`).all(YEAR);

console.log('\nCompany | Year | Total | Parent | GroupMapped');
console.log('--------|------|-------|--------|------------');
for (const s of stats) {
  console.log(`${String(s.companyCode).padEnd(7)} | ${s.year} | ${String(s.cnt).padEnd(5)} | ${String(s.has_parent).padEnd(6)} | ${s.has_group}`);
}

const allStats = db.prepare(`
  SELECT companyCode, year, COUNT(*) as cnt FROM FinanceAccount
  GROUP BY companyCode, year ORDER BY companyCode, year
`).all();
console.log('\n=== All Companies in DB ===');
for (const s of allStats) {
  console.log(`  ${s.companyCode} (year=${s.year}): ${s.cnt}`);
}

db.close();
