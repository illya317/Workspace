require('dotenv/config');
const { Client } = require('pg');
const xlsx = require('xlsx');
const path = require('path');
const { requireDatabaseUrl } = require('./lib/database-url.js');

const DATABASE_URL = requireDatabaseUrl();

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

async function syncBudgetAccounts() {
  console.log('=== Sync Budget Accounts to FinanceAccount ===\n');

  const db = new Client({ connectionString: DATABASE_URL, application_name: 'workspace-budget-account-sync' });
  await db.connect();
  await db.query('BEGIN');
  try {

  const deptAccounts = readDeptBudgetAccounts();
  const rdAccounts = readRdBudgetCategories();

  console.log(`Dept budget accounts: ${deptAccounts.length}`);
  console.log(`R&D budget accounts: ${rdAccounts.length}`);
  console.log(`Total unique: ${new Set([...deptAccounts, ...rdAccounts]).size}\n`);

  // Get existing names
  const existingRows = (await db.query('SELECT id, name, code, "isActive" FROM "FinanceAccount"')).rows;
  const existingByName = new Map();
  for (const row of existingRows) {
    if (!existingByName.has(row.name)) existingByName.set(row.name, row);
  }

  let createdCount = 0;
  let foundCount = 0;

  // Find next available BUDGET code sequence
  const budgetCodes = (await db.query("SELECT code FROM \"FinanceAccount\" WHERE code LIKE 'BUDGET-%'")).rows;
  let maxSeq = 0;
  for (const { code } of budgetCodes) {
    const match = code.match(/BUDGET-[A-Z]+-(\d+)/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  let seq = maxSeq + 1;

  async function findOrCreate(name, prefix) {
    const existing = existingByName.get(name);
    if (existing) {
      foundCount++;
      console.log(`  [FOUND]   ${existing.code} | ${existing.name} (isActive=${existing.isActive})`);
      return existing.id;
    }

    const code = `BUDGET-${prefix}-${String(seq).padStart(3, '0')}`;
    seq++;

    const result = await db.query(`
      INSERT INTO "FinanceAccount" (code, name, category, "balanceDirection", "isActive", "companyCode", year, "mnemonicCode", currency, "groupSubjectCode", "subjectLevel", "sortOrder", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [code, name, 'other', 'debit']);

    createdCount++;
    console.log(`  [CREATED] ${code} | ${name} (inactive, id=${result.rows[0].id})`);
    return result.rows[0].id;
  }

  console.log('--- Department Budget Accounts ---');
  for (let i = 0; i < deptAccounts.length; i++) {
    await findOrCreate(deptAccounts[i], 'DEPT');
  }

  console.log('\n--- R&D Budget Accounts ---');
  for (let i = 0; i < rdAccounts.length; i++) {
    await findOrCreate(rdAccounts[i], 'RD');
  }

  console.log(`\n=== Summary ===`);
  console.log(`Found existing: ${foundCount}`);
  console.log(`Created new (inactive): ${createdCount}`);

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

syncBudgetAccounts().catch((error) => {
  console.error(error);
  process.exit(1);
});
