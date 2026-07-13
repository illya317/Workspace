import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function initLink() {
  const employees = await prisma.employee.findMany();
  const users = await prisma.user.findMany({ select: { id: true, username: true, employeeId: true } });

  // 按 employeeId 去重（多岗人员只取第一条）
  const uniqueEmployees = new Map<string, { employeeId: string; name: string }>();
  for (const emp of employees) {
    if (!uniqueEmployees.has(emp.employeeId)) {
      uniqueEmployees.set(emp.employeeId, { employeeId: emp.employeeId, name: emp.name });
    }
  }

  let matched = 0;
  let unmatched: string[] = [];

  for (const user of users) {
    const emp = user.employeeId ? uniqueEmployees.get(user.employeeId) : null;
    if (emp) {
      await prisma.employee.update({
        where: { employeeId: emp.employeeId },
        data: { userId: user.id },
      });
      matched++;
    } else {
      unmatched.push(user.username);
    }
  }

  console.log(`匹配完成：${matched} / ${users.length} 个用户已关联`);
  if (unmatched.length > 0) {
    console.log(`未匹配用户 (${unmatched.length} 个): ${unmatched.join(", ")}`);
  }
}

initLink()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
