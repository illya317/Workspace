import path from "node:path";
import type {
  RelationDefinition,
  RelationLifecyclePolicies,
  RelationPolicyPreset,
} from "../../packages/platform/server/relation-registry";
import type { DmmfDatamodelLike, PrismaSchemaMetadata } from "./prisma-relation-dmmf";

export interface PhysicalRelation {
  key: string;
  module: string;
  schemaFile: string;
  sourceModel: string;
  sourceFields: string[];
  targetModel: string;
  targetFields: string[];
  relationField: string;
  relationName?: string;
  onDelete: string;
}

export interface RelationAdapterCapabilities {
  listInbound: boolean;
  unlink?: boolean;
  cascade?: boolean;
}

export interface RelationCoverageReport {
  physicalRelations: PhysicalRelation[];
  catalogDefinitions: RelationDefinition[];
  matchedPhysical: PhysicalRelation[];
  governedPhysical: PhysicalRelation[];
  missing: PhysicalRelation[];
  unclassified: Array<{ relation: PhysicalRelation; relationKeys: string[] }>;
  stale: Array<{ relationKey: string; scope: string; physicalKey: string }>;
  adapterGaps: Array<{ relationKey: string; scope: string; missingCapabilities: string[] }>;
  onDeleteMismatches: Array<{ relation: PhysicalRelation; relationKey: string; policy: RelationPolicyPreset }>;
  exemptionIssues: Array<{ relationKey: string; scope: string }>;
  modules: Record<string, RelationCoverageModuleSummary>;
}

export interface RelationCoverageModuleSummary {
  physical: number;
  matched: number;
  governed: number;
  missing: number;
  unclassified: number;
  stale: number;
  adapterGaps: number;
  onDeleteMismatches: number;
  exemptionIssues: number;
}

export interface ModuleRatchet {
  mode: "report-only" | "blocking";
  maxMissing?: number;
  maxUnclassified?: number;
  maxStale?: number;
  maxAdapterGaps?: number;
  maxOnDeleteMismatches?: number;
  maxExemptionIssues?: number;
  /** Pilot root models whose every physical inbound relation must be governed, not merely held at a module baseline. */
  requiredGovernedTargets?: string[];
}

export interface RelationCoverageRatchetConfig {
  defaultMode: "report-only" | "blocking";
  modules: Record<string, ModuleRatchet>;
}

const EMPTY_MODULE_SUMMARY: RelationCoverageModuleSummary = {
  physical: 0,
  matched: 0,
  governed: 0,
  missing: 0,
  unclassified: 0,
  stale: 0,
  adapterGaps: 0,
  onDeleteMismatches: 0,
  exemptionIssues: 0,
};

function moduleFromSchemaFile(schemaFile: string) {
  const stem = path.basename(schemaFile, ".prisma");
  const prefix = stem.split("-")[0] ?? stem;
  if (["work", "works"].includes(prefix)) return "work";
  if (prefix === "hr") return "hr";
  if (prefix === "finance") return "finance";
  if (prefix === "library") return "library";
  if (prefix === "inventory") return "inventory";
  if (prefix === "production") return "production";
  if (prefix === "external") return "external";
  if (prefix === "capital") return "capitalSecurities";
  if (prefix === "contracts") return "administration";
  return "platform";
}

function physicalKey(input: {
  sourceModel: string;
  sourceFields: string[];
  targetModel: string;
  targetFields: string[];
}) {
  return `${input.sourceModel}.${input.sourceFields.join(",")}->${input.targetModel}.${input.targetFields.join(",")}`;
}

export function listPhysicalRelations(
  dmmf: DmmfDatamodelLike,
  schema: PrismaSchemaMetadata,
): PhysicalRelation[] {
  return dmmf.models.flatMap((model) => model.fields.flatMap((field) => {
    if (field.kind !== "object" || !field.relationFromFields?.length || !field.relationToFields?.length) return [];
    const schemaFile = schema.modelFiles.get(model.name) ?? "schema.prisma";
    const relation = {
      sourceModel: model.name,
      sourceFields: [...field.relationFromFields],
      targetModel: field.type,
      targetFields: [...field.relationToFields],
    };
    return [{
      ...relation,
      key: physicalKey(relation),
      module: moduleFromSchemaFile(schemaFile),
      schemaFile,
      relationField: field.name,
      relationName: field.relationName,
      onDelete: field.relationOnDelete
        ?? schema.onDeleteByRelationField.get(`${model.name}.${field.name}`)
        ?? "Default",
    }];
  })).sort((left, right) => left.key.localeCompare(right.key) || left.relationField.localeCompare(right.relationField));
}

function hasCompleteLifecycle(lifecycle: RelationLifecyclePolicies) {
  return Object.values(lifecycle).every((policy) => policy !== null);
}

function requiresUnlink(policy: RelationPolicyPreset) {
  return policy === "confirm_unlink" || policy === "confirm_unlink_or_cascade";
}

function requiresCascade(policy: RelationPolicyPreset) {
  return policy === "confirm_cascade" || policy === "confirm_unlink_or_cascade" || policy === "auto_cascade_owned";
}

function adapterRequirements(definition: RelationDefinition) {
  if (definition.usage === "selector" || !hasCompleteLifecycle(definition.lifecycle)) return [];
  const policies = Object.values(definition.lifecycle) as RelationPolicyPreset[];
  if (policies.every((policy) => policy === "exempt_with_reason")) return [];
  return [
    "listInbound",
    ...(policies.some(requiresUnlink) ? ["unlink"] : []),
    ...(policies.some(requiresCascade) ? ["cascade"] : []),
  ];
}

function hasOnDeleteMismatch(onDelete: string, policy: RelationPolicyPreset) {
  if (onDelete === "Cascade") return !requiresCascade(policy);
  if (onDelete === "SetNull") return !requiresUnlink(policy);
  return false;
}

function increment(
  modules: Record<string, RelationCoverageModuleSummary>,
  module: string,
  field: keyof RelationCoverageModuleSummary,
) {
  modules[module] ??= { ...EMPTY_MODULE_SUMMARY };
  modules[module][field] += 1;
}

export function buildRelationCoverageReport(input: {
  physicalRelations: PhysicalRelation[];
  catalogDefinitions: RelationDefinition[];
  adapterCapabilities?: ReadonlyMap<string, RelationAdapterCapabilities>;
}): RelationCoverageReport {
  const catalogDefinitions = [...input.catalogDefinitions].sort((left, right) => left.key.localeCompare(right.key));
  const definitionsByPhysical = new Map<string, RelationDefinition[]>();
  for (const definition of catalogDefinitions) {
    if (!definition.physical) continue;
    const key = physicalKey(definition.physical);
    definitionsByPhysical.set(key, [...(definitionsByPhysical.get(key) ?? []), definition]);
  }

  const physicalKeys = new Set(input.physicalRelations.map((relation) => relation.key));
  const matchedPhysical = input.physicalRelations.filter((relation) => definitionsByPhysical.has(relation.key));
  const governedPhysical = matchedPhysical.filter((relation) => (
    definitionsByPhysical.get(relation.key)?.some((definition) => (
      definition.usage !== "selector" && hasCompleteLifecycle(definition.lifecycle)
    ))
  ));
  const missing = input.physicalRelations.filter((relation) => !definitionsByPhysical.has(relation.key));
  const unclassified = matchedPhysical.flatMap((relation) => {
    const definitions = definitionsByPhysical.get(relation.key) ?? [];
    const classified = definitions.some((definition) => definition.usage !== "selector" && hasCompleteLifecycle(definition.lifecycle));
    return classified ? [] : [{ relation, relationKeys: definitions.map((definition) => definition.key).sort() }];
  });
  const stale = catalogDefinitions.flatMap((definition) => {
    if (!definition.physical) return [];
    const key = physicalKey(definition.physical);
    return physicalKeys.has(key) ? [] : [{ relationKey: definition.key, scope: definition.scope, physicalKey: key }];
  });
  const exemptionIssues = catalogDefinitions
    .filter((definition) => (
      Object.values(definition.lifecycle).some((policy) => policy === "exempt_with_reason")
      && !definition.exemptionReason?.trim()
    ))
    .map((definition) => ({ relationKey: definition.key, scope: definition.scope }));

  const adapterGaps = catalogDefinitions.flatMap((definition) => {
    const required = adapterRequirements(definition);
    if (required.length === 0) return [];
    const capabilities = definition.adapterKey ? input.adapterCapabilities?.get(definition.adapterKey) : undefined;
    const missingCapabilities = required.filter((capability) => !capabilities?.[capability as keyof RelationAdapterCapabilities]);
    return missingCapabilities.length === 0 ? [] : [{ relationKey: definition.key, scope: definition.scope, missingCapabilities }];
  });

  const onDeleteMismatches = matchedPhysical.flatMap((relation) => (
    (definitionsByPhysical.get(relation.key) ?? []).flatMap((definition) => {
      const policy = definition.lifecycle.targetDelete;
      return policy && policy !== "exempt_with_reason" && hasOnDeleteMismatch(relation.onDelete, policy)
        ? [{ relation, relationKey: definition.key, policy }]
        : [];
    })
  ));

  const modules: Record<string, RelationCoverageModuleSummary> = {};
  for (const relation of input.physicalRelations) increment(modules, relation.module, "physical");
  for (const relation of matchedPhysical) increment(modules, relation.module, "matched");
  for (const relation of governedPhysical) increment(modules, relation.module, "governed");
  for (const relation of missing) increment(modules, relation.module, "missing");
  for (const issue of unclassified) increment(modules, issue.relation.module, "unclassified");
  for (const issue of stale) increment(modules, issue.scope, "stale");
  for (const issue of adapterGaps) increment(modules, issue.scope, "adapterGaps");
  for (const issue of onDeleteMismatches) increment(modules, issue.relation.module, "onDeleteMismatches");
  for (const issue of exemptionIssues) increment(modules, issue.scope, "exemptionIssues");

  return {
    physicalRelations: input.physicalRelations,
    catalogDefinitions,
    matchedPhysical,
    governedPhysical,
    missing,
    unclassified,
    stale,
    adapterGaps,
    onDeleteMismatches,
    exemptionIssues,
    modules: Object.fromEntries(Object.entries(modules).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function evaluateRelationCoverageRatchets(
  report: RelationCoverageReport,
  config: RelationCoverageRatchetConfig,
) {
  const failures: string[] = [];
  for (const [module, summary] of Object.entries(report.modules)) {
    const ratchet = config.modules[module] ?? { mode: config.defaultMode };
    if (ratchet.mode !== "blocking") continue;
    const checks: Array<[keyof RelationCoverageModuleSummary, number | undefined]> = [
      ["missing", ratchet.maxMissing],
      ["unclassified", ratchet.maxUnclassified],
      ["stale", ratchet.maxStale],
      ["adapterGaps", ratchet.maxAdapterGaps],
      ["onDeleteMismatches", ratchet.maxOnDeleteMismatches],
      ["exemptionIssues", ratchet.maxExemptionIssues],
    ];
    for (const [field, configuredMaximum] of checks) {
      const maximum = configuredMaximum ?? 0;
      if (summary[field] <= maximum) continue;
      failures.push(`${module}.${field}=${summary[field]} exceeds ratchet ${maximum}`);
    }
    for (const targetModel of ratchet.requiredGovernedTargets ?? []) {
      const missingInbound = report.missing.filter((relation) => (
        relation.module === module && relation.targetModel === targetModel
      )).length;
      const unclassifiedInbound = report.unclassified.filter(({ relation }) => (
        relation.module === module && relation.targetModel === targetModel
      )).length;
      if (missingInbound || unclassifiedInbound) {
        failures.push(
          `${module}.target.${targetModel} has missing=${missingInbound}, unclassified=${unclassifiedInbound}`,
        );
      }
    }
  }
  return failures.sort();
}
