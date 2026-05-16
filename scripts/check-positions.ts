import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const codes = await prisma.positionCode.findMany({ orderBy: { code: "asc" } });
  console.log("岗位编码总数:", codes.length);
  codes.forEach((c: { code: string; name: string }) => console.log(c.code, c.name));

  console.log("---");

  const emps = await prisma.employee.findMany({
    where: { status: "在职", deleted: false },
    select: { position: true, company: true, name: true },
  });
  console.log("在职员工总数:", emps.length);

  const emptyPos = emps.filter((e) => !e.position);
  console.log("position为空:", emptyPos.length);

  let matched = 0;
  for (const e of emps) {
    if (!e.position) continue;
    const positions = e.position.split("、");
    for (const p of positions) {
      if (codes.some((c) => p.trim() === c.name)) {
        matched++;
        break;
      }
    }
  }
  console.log("至少一个position能匹配编码:", matched);

  const unmatched = [
    ...new Set(
      emps
        .filter((e) => e.position)
        .map((e) => e.position)
        .filter((pos) => {
          const positions = pos!.split("、");
          return !positions.some((p) => codes.some((c) => p.trim() === c.name));
        })
    ),
  ].slice(0, 10);
  console.log("不能匹配的position示例:", unmatched);

  await prisma.$disconnect();
}

main();
