const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');

const prisma = new PrismaClient();

function fixGBK(str) {
  if (!str || typeof str !== 'string') return str;
  const buf = Buffer.from(str, 'latin1');
  const decoded = iconv.decode(buf, 'gbk');
  if (/[一-龥]/.test(decoded) && !/[一-龥]/.test(str)) return decoded;
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
  if (d === '借') return 'debit';
  if (d === '贷') return 'credit';
  return 'debit';
}

function getParentCode(code) {
  if (code.length <= 4) return null;
  for (let i = code.length - 1; i >= 4; i--) {
    const parent = code.slice(0, i);
    if (parent.length >= 4) return parent;
  }
  return null;
}

function parseAccountTable(path) {
  const buf = fs.readFileSync(path);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  data = data.map(row => Array.isArray(row) ? row.map(c => typeof c === 'string' ? fixGBK(c) : c) : row);

  const accounts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    const type = String(row[0] || '').trim();
    const code = String(row[2] || '').trim().replace(/\.0$/, '');
    const name = String(row[3] || '').trim();
    const mnemonic = String(row[4] || '').trim();
    const currency = String(row[5] || '').trim();
    const direction = String(row[9] || '').trim();
    if (!code || !name) continue;
    accounts.push({
      code,
      name,
      category: mapCategory(type, name),
      balanceDirection: mapDirection(direction),
      mnemonicCode: mnemonic || null,
      currency: currency || null,
      parentCode: getParentCode(code),
    });
  }
  return accounts;
}

async function main() {
  const files = [
    { path: '/Users/koito/Downloads/科目表-上海天力通2026.xls', code: '02', name: '上海天力通' },
    { path: '/Users/koito/Downloads/科目表-丰华生物2026.xls', code: '01', name: '丰华生物' },
  ];

  for (const file of files) {
    console.log(`\n=== Importing ${file.name} ===`);
    const accounts = parseAccountTable(file.path);
    console.log(`Parsed ${accounts.length} accounts`);

    accounts.sort((a, b) => a.code.length - b.code.length);

    const codeToId = {};
    let inserted = 0;
    let updated = 0;

    for (const acc of accounts) {
      let parentId = null;
      if (acc.parentCode && codeToId[acc.parentCode]) {
        parentId = codeToId[acc.parentCode];
      }

      const existing = await prisma.financeAccount.findUnique({ where: { code: acc.code } });

      const result = await prisma.financeAccount.upsert({
        where: { code: acc.code },
        create: {
          code: acc.code,
          name: acc.name,
          category: acc.category,
          balanceDirection: acc.balanceDirection,
          parentId,
          companyCode: file.code,
          mnemonicCode: acc.mnemonicCode,
          currency: acc.currency,
          sortOrder: 0,
        },
        update: {
          name: acc.name,
          category: acc.category,
          balanceDirection: acc.balanceDirection,
          parentId,
          companyCode: file.code,
          mnemonicCode: acc.mnemonicCode,
          currency: acc.currency,
        },
      });

      codeToId[acc.code] = result.id;
      if (existing) updated++;
      else inserted++;
    }

    console.log(`Inserted: ${inserted}, Updated: ${updated}`);
  }

  const total = await prisma.financeAccount.count();
  console.log(`\n=== Done === Total FinanceAccount: ${total}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
