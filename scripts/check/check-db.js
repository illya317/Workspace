const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
async function createPrisma() {
  const { PrismaClient } = await import('../../generated/prisma/client');
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '../../prisma/dev.db';
    const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}
async function main() {
  const prisma = await createPrisma();
  let exitCode = 0;

  // 1. 检查核心表是否有数据
  const checks = [
    { name: "User", count: await prisma.user.count() },
    { name: "Employee", count: await prisma.employee.count() },
    { name: "Department", count: await prisma.department.count() },
    { name: "Position", count: await prisma.position.count() },
    { name: "Resource", count: await prisma.resource.count() },
    { name: "Role", count: await prisma.role.count() },
  ];

  for (const c of checks) {
    if (c.count === 0) {
      console.error(`❌ ${c.name} 表为空`);
      exitCode = 1;
    } else {
      console.log(`✅ ${c.name}: ${c.count} 条`);
    }
  }

  // 2. 检查是否有 admin 用户
  const adminUsers = await prisma.userResourceRole.findMany({
    where: {
      resource: { key: "system" },
      role: { key: "admin" },
    },
    take: 1,
  });
  if (adminUsers.length === 0) {
    console.error("❌ 未找到 system.admin 用户");
    exitCode = 1;
  } else {
    console.log("✅ system.admin 存在");
  }

  // 3. 检查外键完整性抽样
  const orphanEDPs = await prisma.eDP.count({
    where: {
      NOT: { employeeId: { in: (await prisma.employee.findMany({ select: { id: true } })).map((e) => e.id) } },
    },
  });
  if (orphanEDPs > 0) {
    console.error(`❌ EDP 表有 ${orphanEDPs} 条孤儿记录（employeeId 不存在）`);
    exitCode = 1;
  } else {
    console.log("✅ EDP 外键完整性正常");
  }

  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
