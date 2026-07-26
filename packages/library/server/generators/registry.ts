import type { GeneratorEntry } from "./types";
import { generateBpHtml } from "./bp-html";
import { generateContractLedger } from "./contract-ledger";
import { generateFinanceReport } from "./finance-report";
import { generateOrganizationChart } from "./organization-chart";
import { generateOwnershipStructure } from "./ownership-structure";
import { generateDueDiligenceRoster } from "./roster-due-diligence";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

const baseEntries: GeneratorEntry[] = [
  { key: "bp-html", name: "BP HTML", generate: generateBpHtml },
  { key: "finance-report", name: "财务报表（最新已验证，单体与合并分开）", titleMode: "fixed", defaultTitle: "最新已验证财务报表", generate: generateFinanceReport },
  { key: "ownership-structure", name: "股权结构（Workspace）", titleMode: "fixed", defaultTitle: "集团股权结构", generate: generateOwnershipStructure },
  { key: "organization-chart", name: "组织架构（Workspace）", titleMode: "fixed", defaultTitle: "组织架构", generate: generateOrganizationChart },
  { key: "roster-due-diligence", name: "花名册（尽调版）", titleMode: "fixed", defaultTitle: "尽调版花名册", generate: generateDueDiligenceRoster },
  { key: "contract-ledger", name: "合同台账（Workspace）", titleMode: "fixed", defaultTitle: "合同台账", generate: generateContractLedger },
];

function entries() {
  const categories = getTenantProfile().library.generatorCategories;
  return baseEntries.map((entry) => {
    const category = categories[entry.key];
    return category ? { ...entry, categoryCode: category.code, categoryName: category.name } : entry;
  });
}

export function getGenerator(key: string): GeneratorEntry | undefined {
  return entries().find((entry) => entry.key === key);
}

export function listGenerators(): GeneratorEntry[] {
  return entries();
}
