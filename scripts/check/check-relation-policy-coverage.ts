#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";
import {
  relationMetadataFromRegistration,
  type RelationRegistration,
} from "../../packages/platform/server/relation-targets";
import { discoverRelationAdapterCapabilities } from "./relation-adapter-capabilities";
import { loadPrismaDmmf, readPrismaSchemaMetadata } from "./prisma-relation-dmmf";
import {
  buildRelationCoverageReport,
  evaluateRelationCoverageRatchets,
  listPhysicalRelations,
  type RelationCoverageRatchetConfig,
  type RelationCoverageReport,
} from "./relation-policy-coverage";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const ratchetPath = path.join(import.meta.dirname, "relation-policy-ratchet.json");

function catalogDefinitions() {
  const registrations: RelationRegistration[] = [];
  for (const definition of registeredModuleDefinitions) {
    if (!("relationRegistrations" in definition)) continue;
    registrations.push(...(definition.relationRegistrations as RelationRegistration[]));
  }
  return registrations.map(relationMetadataFromRegistration);
}

function loadRatchets(): RelationCoverageRatchetConfig {
  return JSON.parse(fs.readFileSync(ratchetPath, "utf8")) as RelationCoverageRatchetConfig;
}

function writeLine(value = "") {
  process.stdout.write(`${value}\n`);
}

function printIssueDetails(report: RelationCoverageReport) {
  const sections: Array<[string, string[]]> = [
    ["Missing physical relations", report.missing.map((relation) => `${relation.key} [${relation.onDelete}]`)],
    ["Stale catalog physical declarations", report.stale.map((issue) => `${issue.relationKey}: ${issue.physicalKey}`)],
    ["Unclassified matched relations", report.unclassified.map((issue) => `${issue.relation.key}: ${issue.relationKeys.join(", ")}`)],
    ["Adapter capability gaps", report.adapterGaps.map((issue) => `${issue.relationKey}: ${issue.missingCapabilities.join(", ")}`)],
    ["onDelete mismatches", report.onDeleteMismatches.map((issue) => `${issue.relation.key} [DB=${issue.relation.onDelete}, policy=${issue.policy}, key=${issue.relationKey}]`)],
  ];
  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    writeLine(`\n${label} (${items.length})`);
    for (const item of items) writeLine(`- ${item}`);
  }
}

function printSummary(report: RelationCoverageReport, failures: string[]) {
  writeLine("Relation Policy coverage (report-only unless a module ratchet is blocking)");
  writeLine(`Physical Prisma/DMMF relations: ${report.physicalRelations.length}`);
  writeLine(`Relation Catalog definitions: ${report.catalogDefinitions.length}`);
  writeLine(`Matched physical relations: ${report.matchedPhysical.length}`);
  writeLine(`Governed physical relations: ${report.governedPhysical.length}`);
  writeLine(`Missing physical relations: ${report.missing.length}`);
  writeLine(`Unclassified matched relations: ${report.unclassified.length}`);
  writeLine(`Stale catalog declarations: ${report.stale.length}`);
  writeLine(`Adapter capability gaps: ${report.adapterGaps.length}`);
  writeLine(`onDelete mismatches: ${report.onDeleteMismatches.length}`);
  writeLine(`Exemption reason issues: ${report.exemptionIssues.length}`);
  writeLine("\nBy module");
  for (const [module, summary] of Object.entries(report.modules)) {
    writeLine(`- ${module}: physical=${summary.physical}, matched=${summary.matched}, governed=${summary.governed}, missing=${summary.missing}, unclassified=${summary.unclassified}, stale=${summary.stale}, adapters=${summary.adapterGaps}, onDelete=${summary.onDeleteMismatches}`);
  }
  if (failures.length > 0) {
    writeLine("\nBlocking ratchet failures");
    for (const failure of failures) writeLine(`- ${failure}`);
  }
}

export function runRelationPolicyCoverage(argv = process.argv.slice(2)) {
  const dmmf = loadPrismaDmmf(repositoryRoot);
  const schemaMetadata = readPrismaSchemaMetadata(path.join(repositoryRoot, "prisma"));
  const report = buildRelationCoverageReport({
    physicalRelations: listPhysicalRelations(dmmf, schemaMetadata),
    catalogDefinitions: catalogDefinitions(),
    adapterCapabilities: discoverRelationAdapterCapabilities(repositoryRoot),
  });
  const failures = evaluateRelationCoverageRatchets(report, loadRatchets());
  const outputArgument = argv.find((argument) => argument.startsWith("--output="));
  if (outputArgument) {
    const outputPath = path.resolve(repositoryRoot, outputArgument.slice("--output=".length));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (argv.includes("--json")) writeLine(JSON.stringify(report, null, 2));
  else {
    printSummary(report, failures);
    if (argv.includes("--details")) printIssueDetails(report);
  }
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runRelationPolicyCoverage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
