import { parseBalanceSheet } from "../server/services/finance/import/parsers/balance-parser";
import { confirmFinanceImport } from "../server/services/finance/import/import-confirm";
import { readFileSync } from "fs";

const COMPANIES: Record<string, { code: string; file: string }> = {
  "01": { code: "01", file: "prisma/seed-data/财务数据/丰华生物/余额表-丰华生物2024.xls" },
  "02": { code: "02", file: "prisma/seed-data/财务数据/天力通/余额表-天力通2024.xls" },
  "03": { code: "03", file: "prisma/seed-data/财务数据/丰华悦通/丰华悦通/余额表-丰华悦通 2024.xlsx" },
  "05": { code: "05", file: "prisma/seed-data/财务数据/加拿大/余额表-加拿大2024.xls" },
  "06": { code: "06", file: "prisma/seed-data/财务数据/上海悦通/余额表-上海悦通2024.xls" },
};

async function main() {
  for (const [name, cfg] of Object.entries(COMPANIES)) {
    console.log(`\n=== ${name} (${cfg.file}) ===`);
    try {
      const buffer = readFileSync(cfg.file);
      const ext = cfg.file.endsWith(".xlsx") ? ".xlsx" : ".xls";
      const preview = parseBalanceSheet(buffer, cfg.code, ext);
      preview.year = 2024;
      console.log(`  accounts: ${preview.accounts.length}, balances: ${preview.balances?.length}, errors: ${preview.errors.length}`);
      if (preview.errors.length > 0) {
        console.log(`  errors:`, preview.errors.slice(0, 3));
        continue;
      }
      const result = await confirmFinanceImport(preview);
      console.log(`  imported: ${result.imported}, mode: ${result.mode}`);
    } catch (e: any) {
      console.log(`  FAILED: ${e.message}`);
    }
  }
}

main().then(() => { console.log("\nDone"); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
