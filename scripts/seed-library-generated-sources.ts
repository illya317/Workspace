import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  const sources = [
    { key: "bp-html", name: "BP HTML", outputCategory: "BP", defaultConfidentialityLevel: 2, enabled: true },
    { key: "finance-report", name: "财务报表（最新已验证单体 + 合并）", outputCategory: "财务", defaultConfidentialityLevel: 2, enabled: true },
    { key: "ownership-structure", name: "股权结构（Workspace）", outputCategory: "公司治理", defaultConfidentialityLevel: 2, enabled: true },
    { key: "organization-chart", name: "组织架构（Workspace）", outputCategory: "公司治理", defaultConfidentialityLevel: 2, enabled: true },
    { key: "roster-due-diligence", name: "花名册（尽调版）", outputCategory: "人事", defaultConfidentialityLevel: 2, enabled: true },
    { key: "contract-ledger", name: "合同台账（Workspace）", outputCategory: "合同协议", defaultConfidentialityLevel: 2, enabled: true },
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
