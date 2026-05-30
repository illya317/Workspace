const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

const db = new Database(process.env.DATABASE_URL?.replace('file:', '') || './data/dev.db');

// ─── GBK Fix ─────────────────────────────────────────────

function fixGBK(str) {
  if (!str || typeof str !== 'string') return str;
  const buf = Buffer.from(str, 'latin1');
  const decoded = iconv.decode(buf, 'gbk');
  const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/;
  if (CJK_RE.test(decoded) && !CJK_RE.test(str)) return decoded;
  return str;
}

// ─── Category Mapping ────────────────────────────────────

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

// ─── Parse .xls file (GBK encoding) ──────────────────────
// Column order: [类型, 级次, 科目编码, 科目名称, 助记码, 外币币种, ...]

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

    accounts.push({
      code,
      name,
      category: mapCategory(type, name),
      balanceDirection: mapDirection(direction),
      mnemonicCode: mnemonic || null,
      currency: currency || null,
      parentCode: getParentCode(code),
      companyCode,
      subjectLevel: isNaN(level) ? calcSubjectLevel(code) : level,
    });
  }
  return accounts;
}

// ─── Parse .xlsx file (UTF-8, different column order) ────
// Column order: [级次, 科目编码, 科目名称, 科目类型, 余额方向, 辅助核算项, ...]

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

    accounts.push({
      code,
      name,
      category: mapCategory(type, name),
      balanceDirection: mapDirection(direction),
      mnemonicCode: null,
      currency: null,
      parentCode: getParentCode(code),
      companyCode,
      subjectLevel: isNaN(level) ? calcSubjectLevel(code) : level,
    });
  }
  return accounts;
}

function parseAccountTable(filePath, companyCode) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx') {
    return parseXLSX(filePath, companyCode);
  }
  return parseXLS(filePath, companyCode);
}

// ─── Build standard mapping from DB (丰华生物 01) ────────

function loadStandardMappingFromDB() {
  const rows = db.prepare('SELECT code, name FROM FinanceAccount WHERE companyCode = ?').all('01');
  const codeSet = new Set();
  const nameToCode = new Map();
  for (const r of rows) {
    codeSet.add(r.code);
    if (!nameToCode.has(r.name)) {
      nameToCode.set(r.name, r.code);
    }
  }
  return { codeSet, nameToCode };
}

// ─── Main ────────────────────────────────────────────────

const files = [
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华生物2024.xls'), baseCode: '01', year: '2024', name: '丰华生物2024' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华生物2025.xls'), baseCode: '01', year: '2025', name: '丰华生物2025' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海天力通2024.xls'), baseCode: '02', year: '2024', name: '上海天力通2024' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海天力通2025.xls'), baseCode: '02', year: '2025', name: '上海天力通2025' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海悦通2024.xls'), baseCode: '03', year: '2024', name: '上海悦通2024' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-上海悦通2025.xls'), baseCode: '03', year: '2025', name: '上海悦通2025' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华悦通2024.xlsx'), baseCode: '05', year: '2024', name: '丰华悦通2024' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-丰华悦通2025.xlsx'), baseCode: '05', year: '2025', name: '丰华悦通2025' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-加拿大2024.xls'), baseCode: '04', year: '2024', name: '加拿大2024' },
  { path: path.join(process.cwd(), 'prisma/seed-data/财务数据/科目表/科目表-加拿大2025.xls'), baseCode: '04', year: '2025', name: '加拿大2025' },
];

// Load standard mapping from existing 丰华生物 data
console.log('=== Loading standard mapping from 丰华生物 (01) ... ===');
const { codeSet: fengHuaCodeSet, nameToCode: fengHuaNameToCode } = loadStandardMappingFromDB();
console.log(`  → 丰华生物标准编码总数: ${fengHuaCodeSet.size}`);
console.log(`  → 丰华生物标准名称映射数: ${fengHuaNameToCode.size}`);

// Parse all files
console.log('\n=== Parsing all files ===\n');

const allAccounts = [];

for (const file of files) {
  const companyCode = file.baseCode;
  const year = parseInt(file.year, 10);
  console.log(`Parsing ${file.name} (companyCode=${companyCode}, year=${year})...`);
  const accounts = parseAccountTable(file.path, companyCode);
  // Attach year to each account for later use
  accounts.forEach(a => a.year = year);
  allAccounts.push({ file, companyCode, year, accounts });
  console.log(`  → ${accounts.length} accounts`);
}

// Build groupSubjectCode mapping
console.log('\n=== Building groupSubjectCode mapping ===\n');

for (const item of allAccounts) {
  let codeMatched = 0;
  let nameMatched = 0;
  let unmatched = 0;

  for (const acc of item.accounts) {
    if (fengHuaCodeSet.has(acc.code)) {
      acc.groupSubjectCode = acc.code;
      codeMatched++;
    } else if (fengHuaNameToCode.has(acc.name)) {
      acc.groupSubjectCode = fengHuaNameToCode.get(acc.name);
      nameMatched++;
    } else {
      acc.groupSubjectCode = null;
      unmatched++;
    }
  }

  console.log(`  ${item.file.name}: 编码匹配=${codeMatched}, 名称匹配=${nameMatched}, 未映射=${unmatched}`);
}

// Delete existing historical data for these companyCodes first
console.log('\n=== Cleaning existing historical data ===\n');

for (const item of allAccounts) {
  const result = db.prepare('DELETE FROM FinanceAccount WHERE companyCode = ? AND year = ?').run(item.companyCode, parseInt(item.year, 10));
  console.log(`  ${item.file.name}: deleted ${result.changes} existing rows`);
}

// Import to database
console.log('\n=== Importing to database ===\n');

const insertStmt = db.prepare(`
  INSERT INTO FinanceAccount (
    code, name, category, parentId, balanceDirection, isActive,
    companyCode, mnemonicCode, currency, groupSubjectCode, subjectLevel,
    year, sortOrder, createdAt, updatedAt
  )
  VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
`);

let totalInserted = 0;

for (const item of allAccounts) {
  const { companyCode, accounts } = item;
  console.log(`Importing ${item.file.name} (${companyCode})...`);

  // Sort by code length (short first) to ensure parents exist before children
  accounts.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));

  const codeToId = {};
  let inserted = 0;

  for (const acc of accounts) {
    let parentId = null;
    if (acc.parentCode && codeToId[acc.parentCode] !== undefined) {
      parentId = codeToId[acc.parentCode];
    }

    const info = insertStmt.run(
      acc.code,
      acc.name,
      acc.category,
      parentId,
      acc.balanceDirection,
      acc.companyCode,
      acc.mnemonicCode,
      acc.currency,
      acc.groupSubjectCode,
      acc.subjectLevel,
      acc.year
    );

    const newId = info.lastInsertRowid;
    codeToId[acc.code] = newId;
    inserted++;
  }

  totalInserted += inserted;
  console.log(`  → Inserted: ${inserted}`);

  // Stats
  const withParent = db.prepare('SELECT COUNT(*) as c FROM FinanceAccount WHERE companyCode = ? AND year = ? AND parentId IS NOT NULL').get(companyCode, parseInt(item.file.year, 10)).c;
  const withGroup = db.prepare('SELECT COUNT(*) as c FROM FinanceAccount WHERE companyCode = ? AND year = ? AND groupSubjectCode IS NOT NULL').get(companyCode, parseInt(item.file.year, 10)).c;
  console.log(`  → With parent: ${withParent}, With group mapping: ${withGroup}`);
}

// Final stats
console.log('\n=== Import Complete ===');
console.log(`Total inserted: ${totalInserted}`);

const stats = db.prepare(`
  SELECT companyCode, year, COUNT(*) as cnt,
    COUNT(parentId) as has_parent,
    COUNT(groupSubjectCode) as has_group
  FROM FinanceAccount WHERE year IN (2024, 2025)
  GROUP BY companyCode, year ORDER BY companyCode, year
`).all();

console.log('\nCompany | Year | Total | Parent | GroupMapped');
console.log('--------|------|-------|--------|------------');
for (const s of stats) {
  console.log(`${String(s.companyCode).padEnd(7)} | ${s.year} | ${String(s.cnt).padEnd(5)} | ${String(s.has_parent).padEnd(6)} | ${s.has_group}`);
}

// Level distribution
const levelDist = db.prepare(`
  SELECT subjectLevel, COUNT(*) as cnt FROM FinanceAccount
  WHERE year IN (2024, 2025)
  GROUP BY subjectLevel ORDER BY subjectLevel
`).all();
console.log('\nLevel distribution (historical):');
for (const l of levelDist) {
  console.log(`  Level ${l.subjectLevel}: ${l.cnt}`);
}

// Overall company stats
const allStats = db.prepare(`
  SELECT companyCode, year, COUNT(*) as cnt FROM FinanceAccount
  GROUP BY companyCode, year ORDER BY companyCode, year
`).all();
console.log('\n=== All Companies in DB ===');
for (const s of allStats) {
  console.log(`  ${s.companyCode} (year=${s.year}): ${s.cnt}`);
}

db.close();
