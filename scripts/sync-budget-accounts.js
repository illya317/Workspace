const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const path = require('path');
const { requireDatabasePath } = require('./lib/database-url.js');

const DB_PATH = requireDatabasePath();

function readDeptBudgetAccounts() {
  const filePath = path.join(process.cwd(), 'prisma/seed-data/预算/部门费用预算数据.xlsx');
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const accounts = new Set();
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const account = String(row[1] || '').trim();
    if (!account || account === '合计') continue;
    if (['福利费', '薪资', '其他', '科目', '部门'].includes(String(row[0] || '').trim())) continue;
    accounts.add(account);
  }
  return Array.from(accounts);
}

function readRdBudgetCategories() {
  const filePath = path.join(process.cwd(), 'prisma/seed-data/预算/研发费用预算数据.xlsx');
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const accounts = new Set();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const category = String(row[1] || '').trim();
    if (!category || category === '小计' || category === '合计') continue;
    accounts.add(category);
  }
  return Array.from(accounts);
}

function syncBudgetAccounts() {
  console.log('=== Sync Budget Accounts to FinanceAccount ===\n');

  const db = new Database(DB_PATH);

  const deptAccounts = readDeptBudgetAccounts();
  const rdAccounts = readRdBudgetCategories();

  console.log(`Dept budget accounts: ${deptAccounts.length}`);
  console.log(`R&D budget accounts: ${rdAccounts.length}`);
  console.log(`Total unique: ${new Set([...deptAccounts, ...rdAccounts]).size}\n`);

  // Get existing names
  const existingRows = db.prepare('SELECT id, name, code, isActive FROM FinanceAccount').all();
  const existingByName = new Map();
  for (const row of existingRows) {
    if (!existingByName.has(row.name)) existingByName.set(row.name, row);
  }

  let createdCount = 0;
  let foundCount = 0;

  // Find next available BUDGET code sequence
  const budgetCodes = db.prepare("SELECT code FROM FinanceAccount WHERE code LIKE 'BUDGET-%'").all();
  let maxSeq = 0;
  for (const { code } of budgetCodes) {
    const match = code.match(/BUDGET-[A-Z]+-(\d+)/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  let seq = maxSeq + 1;

  function findOrCreate(name, prefix) {
    const existing = existingByName.get(name);
    if (existing) {
      foundCount++;
      console.log(`  [FOUND]   ${existing.code} | ${existing.name} (isActive=${existing.isActive})`);
      return existing.id;
    }

    const code = `BUDGET-${prefix}-${String(seq).padStart(3, '0')}`;
    seq++;

    const result = db.prepare(`
      INSERT INTO FinanceAccount (code, name, category, balanceDirection, isActive, companyCode, year, mnemonicCode, currency, groupSubjectCode, subjectLevel, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(code, name, 'other', 'debit', 0, null, null, null, null, null, null, 0);

    createdCount++;
    console.log(`  [CREATED] ${code} | ${name} (inactive, id=${result.lastInsertRowid})`);
    return result.lastInsertRowid;
  }

  console.log('--- Department Budget Accounts ---');
  for (let i = 0; i < deptAccounts.length; i++) {
    findOrCreate(deptAccounts[i], 'DEPT');
  }

  console.log('\n--- R&D Budget Accounts ---');
  for (let i = 0; i < rdAccounts.length; i++) {
    findOrCreate(rdAccounts[i], 'RD');
  }

  console.log(`\n=== Summary ===`);
  console.log(`Found existing: ${foundCount}`);
  console.log(`Created new (inactive): ${createdCount}`);

  db.close();
}

syncBudgetAccounts();
