// @ts-nocheck
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import * as XLSX from "xlsx";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") // "../../prisma/dev.db";
const db = new Database(dbPath);
const adapter = new PrismaBetterSqlite3(db);
const prisma = new PrismaClient({ adapter });

function normalizeCompany(name: string): string {
  if (name === "江苏制药" || name === "制药") return "丰华制药";
  return name;
}

async function main() {
  const wb = XLSX.readFile("/Users/koito/Desktop/Project/HR/data/合并花名册.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // 构建 Excel 查找索引: name -> [{dept, pos, company}]
  const excelMap = new Map<string, Array<{ dept: string; pos: string; company: string }>>();
  for (const r of rows) {
    const name = String(r["姓名"] || "").trim();
    const company = normalizeCompany(String(r["公司"] || "").trim());
    const dept = String(r["一级部门"] || "").trim();
    const pos = String(r["职务岗位"] || "").trim();
    if (!name) continue;
    if (!excelMap.has(name)) excelMap.set(name, []);
    excelMap.get(name)!.push({ dept, pos, company });
  }

  // 查询所有 EmployeeDepartmentPosition
  const eps = await prisma.employeeDepartmentPosition.findMany({
    include: { employee: true, department: true, position: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const ep of eps) {
    const name = ep.employee.name;
    const dept = ep.department.name;
    const pos = ep.position.name;
    const excelRows = excelMap.get(name);

    if (!excelRows || excelRows.length === 0) {
      console.log(`Skip: no Excel data for ${name}`);
      skipped++;
      continue;
    }

    // 1. 精确匹配 name+dept+pos
    let match = excelRows.find((r) => r.dept === dept && r.pos === pos);

    // 2. 模糊匹配: name+dept (Excel中可能用顿号/换行分隔了多个岗位)
    if (!match) {
      match = excelRows.find((r) => r.dept === dept);
    }

    // 3. 模糊匹配: name+pos
    if (!match) {
      match = excelRows.find((r) => r.pos === pos);
    }

    // 4. 兜底: 该员工所有Excel记录取第一个有值的company
    if (!match) {
      match = excelRows.find((r) => r.company);
    }

    if (match && match.company) {
      if (ep.company !== match.company) {
        await prisma.employeeDepartmentPosition.update({
          where: { id: ep.id },
          data: { company: match.company },
        });
        console.log(`Update: ${name} | ${dept} | ${pos} : ${ep.company} -> ${match.company}`);
        updated++;
      } else {
        console.log(`Same: ${name} | ${dept} | ${pos} = ${match.company}`);
      }
    } else {
      console.log(`Skip: ${name} | ${dept} | ${pos} - no match`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Total: ${eps.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
