import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

// ==========================================
// 通用配置：给别的公司用时改这里即可
// ==========================================
const CONFIG = {
  // Excel 文件路径（也可通过命令行参数覆盖：npx tsx scripts/import-users.ts /path/to/file.xlsx）
  excelPath: process.argv[2] || "/Users/koito/Desktop/合并花名册.xlsx",

  // 公司名统一规则：
  // specialCompanies 列表中的公司保持原名，其他统一为 defaultCompany
  defaultCompany: "丰华生物",
  specialCompanies: ["丰华生物制药"],

  // 管理员账号配置（导入时自动创建/更新）
  admin: {
    username: "yufan",
    name: "张玉凡",
    password: "Areez231",
    company: "丰华生物",
    departmentName: "管理员",
    wxUserIdPrefix: "excel_",
  },
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function normalizeCompany(company: string): string {
  if (CONFIG.specialCompanies.includes(company)) return company;
  return CONFIG.defaultCompany;
}

async function importUsers() {
  const workbook = XLSX.readFile(CONFIG.excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // header row: ['公司', '姓 名', '部门', '账号', '密码', '管理员', '测试资格']
  const allRows = data.slice(1).map((row) => ({
    company: String(row[0] || "").trim(),
    name: String(row[1] || "").trim(),
    department: String(row[2] || "").trim() || "其他",
    username: String(row[3] || "").trim(),
    password: String(row[4] || "").trim(),
    isAdmin: row[5] === 1,
    canTest: row[6] === 1,
  })).filter((r) => r.username && r.password);

  // 按姓名去重（多岗人员只保留一行）
  const seenNames = new Set<string>();
  const rows = allRows.filter((r) => {
    if (seenNames.has(r.name)) return false;
    seenNames.add(r.name);
    return true;
  });

  console.log(`读取到 ${allRows.length} 条记录，去重后 ${rows.length} 人`);

  let created = 0;
  let updated = 0;

  // 预加载所有现有用户，用于重名递增
  const existingUsers = await prisma.user.findMany({
    select: { username: true, name: true },
  });
  const usernameToName = new Map(existingUsers.map((u) => [u.username, u.name]));

  for (const row of rows) {
    let username = row.username;

    // 如果username已存在且对应不同的人，自动递增
    let suffix = 1;
    const baseUsername = username;
    while (usernameToName.has(username) && usernameToName.get(username) !== row.name) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }
    if (username !== row.username) {
      console.log(`  重名递增: ${row.name} ${row.username} → ${username}`);
    }

    const normalizedCompany = normalizeCompany(row.company);
    const deptKey = `${normalizedCompany}-${row.department}`;
    const departmentId = hashString(deptKey);
    const wxUserId = `${CONFIG.admin.wxUserIdPrefix}${username}`;

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          password: row.password,
          departmentId,
          departmentName: row.department,
          wxUserId,
          isWorkListAdmin: row.isAdmin,
          canSelectAnyWeek: row.canTest,
        },
      });
      updated++;
    } else {
      await prisma.user.create({
        data: {
          wxUserId,
          username,
          password: row.password,
          name: row.name,
          departmentId,
          departmentName: row.department,
          isWorkListAdmin: row.isAdmin,
          canSelectAnyWeek: row.canTest,
        },
      });
      created++;
    }
  }

  // 添加/更新管理员账号
  const adminDeptId = hashString(`${CONFIG.admin.company}-${CONFIG.admin.departmentName}`);
  const adminUser = await prisma.user.findUnique({
    where: { username: CONFIG.admin.username },
  });
  if (adminUser) {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        name: CONFIG.admin.name,
        password: CONFIG.admin.password,
        departmentId: adminDeptId,
        departmentName: CONFIG.admin.departmentName,
        isWorkListAdmin: true,
        canSelectAnyWeek: true,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        wxUserId: `${CONFIG.admin.wxUserIdPrefix}${CONFIG.admin.username}`,
        username: CONFIG.admin.username,
        password: CONFIG.admin.password,
        name: CONFIG.admin.name,
        departmentId: adminDeptId,
        departmentName: CONFIG.admin.departmentName,
        isWorkListAdmin: true,
        canSelectAnyWeek: true,
      },
    });
  }
  console.log(`管理员账号 ${CONFIG.admin.username} 已设置`);

  console.log(`导入完成：新建 ${created} 人，更新 ${updated} 人`);

  const depts = await prisma.user.groupBy({
    by: ["departmentName", "departmentId"],
    _count: { id: true },
  });
  console.log("\n部门分布：");
  for (const d of depts.sort((a, b) => (a.departmentId ?? 0) - (b.departmentId ?? 0))) {
    console.log(`  ${d.departmentName} (id=${d.departmentId}): ${d._count.id}人`);
  }
}

importUsers()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
