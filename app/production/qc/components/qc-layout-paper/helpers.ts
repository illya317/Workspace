import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateTestItem } from "@/server/services/production/qc";

export interface NumberedBlock extends QcLayoutBlock {
  displaySection?: string;
}

export function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function offsetDateValue(offsetDays?: number) {
  if (offsetDays == null || !Number.isFinite(offsetDays)) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function collectDateDefaults(blocks: QcLayoutBlock[]) {
  const defaults = new Map<string, string>();
  const addPart = (part: QcLayoutPart) => {
    if (part.type !== "date") return;
    const key = part.fieldKey || part.field || part.name || "";
    const value = part.defaultValue || offsetDateValue(part.defaultOffsetDays) || todayValue();
    if (key && value && !defaults.has(key)) defaults.set(key, value);
  };
  visitParts(blocks, addPart);
  return defaults;
}

export function collectReadonlyDisplayKeys(blocks: QcLayoutBlock[]) {
  const keys = new Set<string>();
  visitParts(blocks, (part) => {
    const key = part.readonlyDisplay ? part.fieldKey || part.field || part.name || "" : "";
    if (key) keys.add(key);
  });
  return keys;
}

export function collectFirstPartByKey(blocks: QcLayoutBlock[]) {
  const first = new Map<string, QcLayoutPart>();
  visitParts(blocks, (part) => {
    const key = part.fieldKey || part.field || part.name || "";
    if (key && !first.has(key)) first.set(key, part);
  });
  return first;
}

export function collectFormulaInputKeys(test?: QcTemplateTestItem) {
  const dependencyMap = collectFormulaDependencies(test);
  return new Set(Array.from(dependencyMap.values()).flatMap((keys) => Array.from(keys)));
}

export function collectAdvancedFormulaInputKeys(blocks: QcLayoutBlock[]) {
  const keys = new Set<string>();
  visitParts(blocks, (part) => {
    for (const key of part.advancedDependencyFieldKeys || []) keys.add(key);
    for (const value of Object.values(part.advancedDependencyFieldKeyMap || {})) {
      for (const key of value) keys.add(key);
    }
  });
  return keys;
}

export function collectFormulaDependencies(test?: QcTemplateTestItem) {
  const dependencies = new Map<string, Set<string>>();
  if (!test) return dependencies;
  const fields = test.methodGroups.flatMap((group) => group.fields);
  const calculated = fields.filter((field) => field.attr === "calculated" && (field.formula || field.rule));
  for (const field of calculated) {
    const expr = String(field.formula || field.rule || "");
    const prefix = scopePrefix(field.fieldKey);
    const related = new Set<string>();
    for (const candidate of fields) {
      if (candidate.fieldKey !== field.fieldKey && candidate.fieldKey.startsWith(prefix) && expr.includes(candidate.name)) {
        related.add(candidate.fieldKey);
      }
    }
    dependencies.set(field.fieldKey, related);
  }
  return dependencies;
}

export function collectAdvancedPartMetadata(blocks: QcLayoutBlock[], test?: QcTemplateTestItem) {
  const metadata = new Map<string, QcLayoutPart>();
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  visitParts(blocks, (part) => {
    const hasMetadata = part.advancedFormulaText || part.advancedFormulaTextMap || part.advancedDependencyFieldKeys?.length || part.advancedDependencyFieldKeyMap || part.type === "duration_days" || part.type === "duration_hours";
    if (!hasMetadata) return;
    const key = part.fieldKey || part.field || part.name || "";
    if (key) metadata.set(key, part);
    if (!part.field) return;
    const occurrence = Math.max(1, part.occurrence || 1);
    const field = fields.filter((candidate) => candidate.name === part.field)[occurrence - 1];
    if (field?.fieldKey) metadata.set(field.fieldKey, part);
  });
  return metadata;
}

export function reusedPackagingSource(test?: QcTemplateTestItem) {
  if (test?.copyFromPackaging && test.copiedFrom?.stage === "packaging" && test.copiedFrom.key) {
    return { stageKey: "packaging", testName: test.copiedFrom.key, sourceRef: `packaging/${test.copiedFrom.sequence || test.copiedFrom.key}` };
  }
  const reusedFrom = test?.layout?.reusedFrom || "";
  const layoutKey = test?.layout?.key || "";
  const sourceMatch = reusedFrom.match(/^products\/([^/]+)\/packaging\/([^/]+)$/);
  const currentMatch = layoutKey.match(/^products\/([^/]+)\/finished\/([^/]+)$/);
  if (!sourceMatch || !currentMatch) return undefined;
  const [, sourceProduct, sourceTest] = sourceMatch;
  const [, currentProduct, currentTest] = currentMatch;
  if (sourceProduct !== currentProduct || sourceTest !== currentTest || test?.layout?.status !== "reused_packaging") return undefined;
  return { stageKey: "packaging", testName: sourceTest, sourceRef: test.layout.sourceRef };
}

export function referenceSourceKey(source: ReturnType<typeof reusedPackagingSource>, test: QcTemplateTestItem | undefined, fieldKey: string) {
  if (!source || !fieldKey) return undefined;
  const scopedPrefix = `finished/${test?.englishName || source.testName}/`;
  if (fieldKey.startsWith(scopedPrefix)) return `${source.stageKey}/${source.testName}/${fieldKey.slice(scopedPrefix.length)}`;
  return `${source.stageKey}/${source.testName}/${fieldKey}`;
}

export function numberBlocks(blocks: QcLayoutBlock[], sequence?: string): { blocks: NumberedBlock[]; sectionAliases: Record<string, string> } {
  let nextTopLevel = 1;
  const sectionAliases: Record<string, string> = {};
  return { sectionAliases, blocks: blocks.map((block) => {
    const suffix = block.sectionSuffix;
    const role = block.sectionRole;
    let displaySection: string | undefined;
    if (block.sectionRef) {
      const nestedSuffix = joinSectionSuffix(sectionAliases[block.sectionRef], suffix);
      displaySection = nestedSuffix ? sequence ? `${sequence}.${nestedSuffix}` : nestedSuffix : undefined;
      if (nestedSuffix && role && (block.sectionAnchor || block.sectionSlot)) sectionAliases[role] = nestedSuffix;
    } else if (isNumericSection(suffix)) {
      displaySection = sequence ? `${sequence}.${suffix}` : suffix;
      const topLevel = Number(suffix.split(".")[0]);
      if (Number.isFinite(topLevel)) nextTopLevel = Math.max(nextTopLevel, topLevel + 1);
      if (role) sectionAliases[role] = suffix;
    } else if (block.sectionSlot || suffix === "auto" || block.sectionAnchor) {
      const alias = String(nextTopLevel++);
      if (role) sectionAliases[role] = alias;
      displaySection = sequence ? `${sequence}.${alias}` : alias;
    }
    return { ...block, displaySection };
  }) };
}

function visitParts(blocks: QcLayoutBlock[], visit: (part: QcLayoutPart) => void) {
  for (const block of blocks) {
    block.parts?.forEach(visit);
    block.rows?.forEach((row) => row.forEach((cell: QcLayoutCell) => cell.parts.forEach(visit)));
  }
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : `${fieldKey}/`;
}

function joinSectionSuffix(base?: string, suffix?: string) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function isNumericSection(suffix?: string): suffix is string {
  return !!suffix && /^\d+(?:\.\d+)*$/.test(suffix);
}
