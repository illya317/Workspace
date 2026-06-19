import "dotenv/config";
import * as fs from "fs"; import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { parseJournal } from "@workspace/finance/server/import/parsers/voucher-parser";
import { confirmFinanceImport } from "@workspace/finance/server/import/import-confirm";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });
const SEED = path.join(path.resolve(__dirname, "../.."), "prisma/seed-data/财务数据");

const FILES: Record<string, string> = {
  "01": "丰华生物/序时账-丰华生物2026.04.xls",
  "02": "天力通/序时账-天力通2026.4.xls",
  "03": "丰华悦通/序时账/ะ๒สฑีห-ทแปชิรอจ 2026.04.xlsx",
  "05": "加拿大/序时账-加拿大2026.3.xls",
  "06": "上海悦通/序时账-上海悦通2026.4.xls",
};

async function main() {
  for (const [code, rel] of Object.entries(FILES)) {
    const fp = path.join(SEED, rel);
    if (!fs.existsSync(fp)) { console.log(code, "no file"); continue; }
    const buf = fs.readFileSync(fp);
    const preview = parseJournal(buf, code, path.extname(fp).toLowerCase()||".xls");
    if (preview.errors.length > 0) { console.log(code, "error:", preview.errors[0]); continue; }
    const r = await confirmFinanceImport(preview);
    console.log(code, r.imported, "vouchers");
  }
  await p.$disconnect();
}
main();
