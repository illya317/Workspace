import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany({
    where: { status: "在职", deleted: false },
    select: { company: true, position: true, name: true },
  });

  const byCompany: Record<string, number> = {};
  for (const e of emps) {
    const c = e.company || "未填";
    byCompany[c] = (byCompany[c] || 0) + 1;
  }
  console.log("按公司分组:", byCompany);

  const bioEmps = emps.filter((e) => e.company === "丰华生物");
  console.log("丰华生物在职:", bioEmps.length);

  const codes = await prisma.positionCode.findMany();

  let matched = 0;
  for (const e of bioEmps) {
    if (!e.position) continue;
    const positions = e.position.split("、");
    for (const p of positions) {
      if (codes.some((c) => c.code.startsWith("01") && p.trim() === c.name)) {
        matched++;
        break;
      }
    }
  }
  console.log("丰华生物能匹配01编码:", matched);

  const unmatched = [
    ...new Set(
      bioEmps
        .filter((e) => e.position)
        .map((e) => e.position)
        .filter((pos) => {
          const positions = pos!.split("、");
          return !positions.some((p) => codes.some((c) => c.code.startsWith("01") && p.trim() === c.name));
        })
    ),
  ].slice(0, 10);
  console.log("丰华生物不能匹配的position:", unmatched);

  await prisma.$disconnect();
}

main();
