import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

const EXCEL_PATH = "/Users/koito/Desktop/合并花名册.xlsx";

const COLUMN_MAP: Record<string, string> = {
  "ID": "employeeId",
  "姓名": "name",
  "公司": "company",
  "中心": "center",
  "一级部门": "dept1",
  "二级部门": "dept2",
  "职务岗位": "position",
  "性别": "gender",
  "民族": "ethnicity",
  "籍贯": "hometown",
  "政治面貌": "politics",
  "学历": "education",
  "职称": "title",
  "毕业院校": "school",
  "专业": "major",
  "是否相关专业": "majorRelevant",
  "电话": "phone",
  "常驻办公区1": "office1",
  "常驻办公区2": "office2",
  "常驻办公区3": "office3",
  "考勤类别1": "attendance1",
  "考勤类别2": "attendance2",
  "进司时间": "joinDate",
  "性质": "nature",
};

function normalizeValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === "" || str === "NaN") return null;
  return str;
}

function splitPositions(position: string | null): string[] {
  if (!position) return [""];
  const lines = position.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  const result: string[] = [];
  for (const line of lines) {
    const parts = line.split("、").map((s) => s.trim()).filter((s) => s.length > 0);
    result.push(...parts);
  }
  if (result.length === 0) return [""];
  return result;
}

function generateRandomId(used: Set<number>, fixedAssignments: Map<string, number>, name: string): number {
  const fixed = fixedAssignments.get(name);
  if (fixed !== undefined && !used.has(fixed)) {
    return fixed;
  }
  let id: number;
  do {
    id = Math.floor(Math.random() * 999) + 1;
  } while (used.has(id));
  return id;
}

async function importRoster() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const headers = data[0] as string[];
  const rows = data.slice(1);

  console.log(`读取到 ${rows.length} 条记录`);

  // 统计每人在Excel中的行数
  const nameCount = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeValue(row[headers.indexOf("姓名")]);
    if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
  }

  // 先读取数据库中现有的ID映射，确保重新导入时同一人ID不变
  const existingEmployees = await prisma.employee.findMany({
    select: { name: true, employeeId: true },
  });
  const existingIdMap = new Map<string, number>();
  for (const emp of existingEmployees) {
    const numId = parseInt(emp.employeeId, 10);
    if (!isNaN(numId) && !existingIdMap.has(emp.name)) {
      existingIdMap.set(emp.name, numId);
    }
  }
  console.log(`数据库中已有 ${existingIdMap.size} 人的ID映射`);

  const fixedAssignments = new Map<string, number>([
    ["张宇凡", 317],
  ]);

  const usedIds = new Set<number>();
  const nameToId = new Map<string, number>();
  const employees: any[] = [];

  // 优先复用数据库中已有的ID
  for (const [name, id] of existingIdMap) {
    usedIds.add(id);
    nameToId.set(name, id);
  }

  for (const row of rows) {
    const rawId = normalizeValue(row[headers.indexOf("ID")]);
    if (!rawId) continue;

    const emp: Record<string, any> = {};
    for (const [colName, dbField] of Object.entries(COLUMN_MAP)) {
      if (dbField === "employeeId") continue;
      const colIndex = headers.indexOf(colName);
      if (colIndex === -1) continue;
      let val = normalizeValue(row[colIndex]);
      if (dbField === "company" && val) {
        if (val === "丰华生物制药" || val === "制药") {
          val = "丰华制药";
        }
      }
      emp[dbField] = val;
    }

    const count = nameCount.get(emp.name) || 1;
    let positions: string[];

    if (count > 1) {
      // Excel中已有多行：保留该行原始岗位（不拆分position）
      positions = [emp.position || ""];
    } else {
      // Excel中只有1行：按顿号/换行拆分多岗
      positions = splitPositions(emp.position);
    }

    // 张慧明强制拆成2行，第二行岗位为空
    if (emp.name === "张慧明" && positions.length === 1) {
      positions = [positions[0], ""];
    }

    // 同一人复用相同ID
    let newId = nameToId.get(emp.name);
    if (newId === undefined) {
      newId = generateRandomId(usedIds, fixedAssignments, emp.name);
      usedIds.add(newId);
      nameToId.set(emp.name, newId);
    }

    for (const pos of positions) {
      employees.push({
        ...emp,
        employeeId: String(newId).padStart(5, "0"),
        position: pos || null,
      });
    }
  }

  // 清空旧数据并导入
  await prisma.employee.deleteMany({});

  let created = 0;
  for (const emp of employees) {
    await prisma.employee.create({ data: emp });
    created++;
  }

  console.log(`导入完成：${created} 条（${rows.length} 人）`);

  // 统计多岗人员
  const multi = await prisma.employee.groupBy({
    by: ["employeeId"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  console.log(`\n多岗人员：${multi.length} 人`);
  for (const m of multi) {
    const names = await prisma.employee.findMany({
      where: { employeeId: m.employeeId },
      select: { name: true, position: true },
    });
    console.log(`  ${m.employeeId} ${names[0]?.name}: ${names.map((n) => n.position || "(空)").join(" / ")}`);
  }

  // 公司分布
  const companies = await prisma.employee.groupBy({
    by: ["company"],
    _count: { id: true },
  });
  console.log("\n公司分布：");
  for (const c of companies) {
    console.log(`  ${c.company || "未指定"}: ${c._count.id}人`);
  }
}

importRoster()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
