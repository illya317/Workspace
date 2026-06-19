import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  const sources = [
    { key: "bp-html", name: "BP HTML", outputCategory: "BP", defaultConfidentialityLevel: 2, enabled: true },
    { key: "finance-report", name: "财务报表", outputCategory: "财务", defaultConfidentialityLevel: 2, enabled: true },
  ];

  for (const s of sources) {
    await prisma.libraryGeneratedSource.upsert({
      where: { key: s.key },
      create: s,
      update: s,
    });
  }

  console.log("LibraryGeneratedSource seeded:", sources.map((s) => s.key).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
