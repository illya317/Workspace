import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const codes = await prisma.positionCode.findMany();
  const emps = await prisma.employee.findMany({
    where: { status: "在职", deleted: false },
    select: { position: true, company: true, name: true },
  });

  const codes01 = codes.filter((c) => c.code.startsWith("01"));
  console.log("01编码数:", codes01.length);

  let totalCount = 0;
  for (const c of codes01) {
    const count = emps.filter((e) => e.position && e.position.includes(c.name)).length;
    if (count > 0) {
      console.log(c.code, c.name, count);
      totalCount += count;
    }
  }
  console.log("01编码总人数(含重复):", totalCount);

  const non01Emps = emps.filter((e) => e.company !== "丰华生物");
  let non01Match01 = 0;
  for (const e of non01Emps) {
    if (!e.position) continue;
    if (codes01.some((c) => e.position!.includes(c.name))) {
      non01Match01++;
    }
  }
  console.log("非01员工匹配01编码:", non01Match01);

  await prisma.$disconnect();
}

main();
