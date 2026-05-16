import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const codes = await prisma.positionCode.findMany();
  const emps = await prisma.employee.findMany({
    where: { status: "在职", deleted: false },
    select: { position: true, company: true, name: true },
  });

  // 01001 人力资源经理 被哪些position匹配到
  const target = "人力资源经理";
  const matched = emps.filter((e) => e.position && e.position.includes(target));
  console.log(`匹配"${target}"的员工:`);
  matched.forEach((e) => console.log(`  ${e.name} | ${e.position} | ${e.company}`));

  console.log("---");

  // 01003 行政主管
  const target2 = "行政主管";
  const matched2 = emps.filter((e) => e.position && e.position.includes(target2));
  console.log(`匹配"${target2}"的员工:`);
  matched2.forEach((e) => console.log(`  ${e.name} | ${e.position} | ${e.company}`));

  await prisma.$disconnect();
}

main();
