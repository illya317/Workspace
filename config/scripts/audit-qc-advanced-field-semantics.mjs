import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve("..");
const qcRoot = path.join(workspaceRoot, ".workspace/config/pharma-qc");
const itemsRoot = path.join(qcRoot, "items");
const auditJsonPath = path.join(qcRoot, "advanced_field_semantics_audit.json");
const auditMdPath = path.join(qcRoot, "advanced_field_semantics_audit.md");

function str(value) {
  return value == null ? "" : String(value);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function rec(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function keyOf(value) {
  const data = rec(value);
  return str(data.fieldKey || data.field_key || data.field || data.name);
}

function fieldKeyOf(field) {
  const data = rec(field);
  return str(data.fieldKey || data.field_key);
}

function fieldNameOf(field) {
  return str(rec(field).name);
}

function scopePrefix(fieldKey) {
  const parts = str(fieldKey).split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : "";
}

function configuredReferenceSourceKey(value) {
  const data = rec(value);
  const source = rec(data.valueSource || data.value_source);
  return str(data.referenceFieldKey || data.reference_field_key || source.fieldKey || source.field_key);
}

function bareReferenceFormulaTarget(field, fields) {
  const data = rec(field);
  if (str(data.attr) !== "calculated") return "";
  const formula = str(data.formula || data.rule).replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
  if (!formula) return "";
  if (/[<>=!&|+\-*/%^(),"'.0-9]/.test(formula) || formula.includes("ALL(") || formula.includes("Math.")) return "";
  const prefix = scopePrefix(fieldKeyOf(data));
  const source = fields.find((candidate) => fieldKeyOf(candidate) !== fieldKeyOf(data) && fieldKeyOf(candidate).startsWith(prefix) && fieldNameOf(candidate) === formula);
  return fieldKeyOf(source);
}

function fieldMaps(item) {
  const fields = arr(item.test?.method_groups || item.test?.methodGroups)
    .flatMap((group) => arr(group.fields).map((field) => rec(field)));
  const byKey = new Map();
  const byName = new Map();
  for (const field of fields) {
    const key = fieldKeyOf(field);
    const name = fieldNameOf(field);
    if (key) byKey.set(key, field);
    if (name && !byName.has(name)) byName.set(name, field);
  }
  return { fields, byKey, byName };
}

function visitParts(blocks, visit) {
  function walk(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, [...pathParts, index]));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.type) visit(rec(value), pathParts.join("."));
    Object.entries(value).forEach(([key, child]) => walk(child, [...pathParts, key]));
  }
  walk(blocks);
}

function layoutParts(item) {
  const parts = [];
  visitParts(arr(item.test?.layout_blocks || item.test?.layoutBlocks), (part, partPath) => {
    if (["line", "field", "select", "date", "duration_days", "duration_hours", "radio", "checkbox", "microbial_selected_total"].includes(str(part.type))) {
      parts.push({ path: partPath, part });
    }
  });
  return parts;
}

function resolvePartField(part, fields, byKey, byName) {
  const explicitKey = str(part.fieldKey || part.field_key);
  if (explicitKey && byKey.has(explicitKey)) return { key: explicitKey, field: byKey.get(explicitKey) };
  const matches = str(part.field) ? fields.filter((field) => fieldNameOf(field) === str(part.field)) : [];
  const occurrence = Math.max(1, Number(part.occurrence || 1));
  const field = matches[occurrence - 1] || (str(part.field) ? byName.get(str(part.field)) : undefined);
  return { key: explicitKey || fieldKeyOf(field) || str(part.field || part.name), field };
}

function collectFormulaDependencies(fields) {
  const dependencies = new Map();
  for (const field of fields) {
    const key = fieldKeyOf(field);
    if (!key || str(field.attr) !== "calculated" || !(field.formula || field.rule)) continue;
    const expr = str(field.formula || field.rule);
    const prefix = scopePrefix(key);
    const deps = new Set();
    for (const candidate of fields) {
      const candidateKey = fieldKeyOf(candidate);
      if (candidateKey !== key && candidateKey.startsWith(prefix) && expr.includes(fieldNameOf(candidate))) {
        deps.add(candidateKey);
      }
    }
    dependencies.set(key, deps);
  }
  return dependencies;
}

function collectAdvancedDependencyKeys(part) {
  const keys = new Set(arr(part.advancedDependencyFieldKeys));
  for (const value of Object.values(rec(part.advancedDependencyFieldKeyMap))) {
    for (const key of arr(value)) keys.add(key);
  }
  if (part.startKey) keys.add(str(part.startKey));
  if (part.endKey) keys.add(str(part.endKey));
  if (part.type === "duration_hours") {
    if (part.startHourKey || part.startKey) keys.add(str(part.startHourKey || `${part.startKey}_hour`));
    if (part.endHourKey || part.endKey) keys.add(str(part.endHourKey || `${part.endKey}_hour`));
  }
  return keys;
}

function hasAdvancedFormulaMetadata(part) {
  return !!(part.advancedFormulaText || part.advancedFormulaTextMap || arr(part.advancedDependencyFieldKeys).length || part.advancedDependencyFieldKeyMap);
}

function formulaText(part, field) {
  if (part.type === "duration_days" && part.startKey && part.endKey) return `${part.endKey} - ${part.startKey}（天）`;
  if (part.type === "duration_hours" && part.startKey && part.endKey) return `${part.endKey} - ${part.startKey}（小时）`;
  return str(part.advancedFormulaText || field?.formula || field?.rule);
}

function isConstantFormula(text) {
  return /^[\d.\s%+-]+$/.test(str(text));
}

function copiedPackagingSourceKey(item, fieldKey) {
  const copied = rec(item.test?.copied_from || item.test?.copiedFrom);
  if (item.test?.copy_from_packaging !== true || copied.stage !== "packaging" || !copied.key || !fieldKey) return "";
  return fieldKey.replace(/^finished\/[^/]+\//, `${copied.stage}/${copied.key}/`);
}

function isHiddenPrefilledConstant(field) {
  const data = rec(field);
  return str(data.attr) === "prefilled"
    && (data.default_value !== undefined || data.defaultValue !== undefined);
}

function classifyPart({ item, part, field, key, firstByKey, formulaInputKeys, fields }) {
  const copiedSourceKey = copiedPackagingSourceKey(item, key);
  const configuredSourceKey = configuredReferenceSourceKey(part) || configuredReferenceSourceKey(field);
  const referenceFormulaSourceKey = bareReferenceFormulaTarget(field, fields);
  const sourceKey = copiedSourceKey || configuredSourceKey || referenceFormulaSourceKey;
  const duplicateReadonlyDisplay = !!key && part.readonlyDisplay === true && firstByKey.has(key) && firstByKey.get(key) !== part;
  const readonlyReference = part.readonlyDisplay === true && !!(configuredSourceKey || referenceFormulaSourceKey);
  const layoutFormula = hasAdvancedFormulaMetadata(part);
  const referenceCandidate = !!sourceKey || (!layoutFormula && readonlyReference);
  const effectiveReference = referenceCandidate || duplicateReadonlyDisplay;
  const formulaOutput = !effectiveReference && (layoutFormula || str(field?.attr) === "calculated" || part.type === "duration_days" || part.type === "duration_hours" || part.type === "microbial_selected_total");
  const formulaInput = !!key && formulaInputKeys.has(key);
  const kind = effectiveReference ? "ref" : formulaOutput ? "fx" : formulaInput ? "x" : part.type === "date" ? "date" : (part.type === "checkbox" || part.type === "radio") ? "checkbox" : "i";
  return {
    kind,
    sourceKey: sourceKey || (duplicateReadonlyDisplay ? key : ""),
    formulaText: formulaOutput ? formulaText(part, field) : "",
    conflicts: {
      reference_and_formula: effectiveReference && (layoutFormula || str(field?.attr) === "calculated"),
      reference_and_x: effectiveReference && formulaInput,
      formula_and_x: formulaOutput && formulaInput,
    },
  };
}

const files = (await fs.readdir(itemsRoot)).filter((file) => file.endsWith(".json")).sort();
const items = [];
for (const file of files) {
  const item = JSON.parse(await fs.readFile(path.join(itemsRoot, file), "utf8"));
  const { fields, byKey, byName } = fieldMaps(item);
  const formulaDependencies = collectFormulaDependencies(fields);
  const formulaInputKeys = new Set(Array.from(formulaDependencies.values()).flatMap((keys) => Array.from(keys)));
  const parts = layoutParts(item);
  const firstByKey = new Map();
  for (const { part } of parts) {
    const { key } = resolvePartField(part, fields, byKey, byName);
    if (key && !firstByKey.has(key)) firstByKey.set(key, part);
    for (const dep of collectAdvancedDependencyKeys(part)) formulaInputKeys.add(dep);
  }

  const counts = { ref: 0, fx: 0, x: 0, i: 0, date: 0, checkbox: 0 };
  const issues = {
    ref_without_source: [],
    fx_without_formula_text: [],
    fx_without_dependencies: [],
    x_without_layout_part: [],
    priority_shadowed: [],
  };
  const displayedKeys = new Set();
  const dependencyKeys = new Set();
  for (const { path: partPath, part } of parts) {
    const { key, field } = resolvePartField(part, fields, byKey, byName);
    if (key) displayedKeys.add(key);
    const classification = classifyPart({ item, part, field, key, firstByKey, formulaInputKeys, fields });
    counts[classification.kind] = (counts[classification.kind] || 0) + 1;
    if (classification.kind === "ref" && !classification.sourceKey) {
      issues.ref_without_source.push({ path: partPath, field_key: key, field: str(part.field || part.name || field?.name) });
    }
    if (classification.kind === "fx") {
      const dependencies = new Set([...(formulaDependencies.get(key) || new Set()), ...collectAdvancedDependencyKeys(part)]);
      for (const dep of dependencies) dependencyKeys.add(dep);
      if (!classification.formulaText) issues.fx_without_formula_text.push({ path: partPath, field_key: key, field: str(part.field || part.name || field?.name) });
      if (!dependencies.size && !isConstantFormula(classification.formulaText) && part.type !== "microbial_selected_total") {
        issues.fx_without_dependencies.push({ path: partPath, field_key: key, field: str(part.field || part.name || field?.name), formula: classification.formulaText });
      }
    }
    if (classification.conflicts.reference_and_formula || classification.conflicts.reference_and_x || classification.conflicts.formula_and_x) {
      issues.priority_shadowed.push({ path: partPath, field_key: key, rendered_as: classification.kind, source_key: classification.sourceKey, conflicts: classification.conflicts });
    }
  }
  for (const key of formulaInputKeys) {
    if (!displayedKeys.has(key) && !isHiddenPrefilledConstant(byKey.get(key))) {
      issues.x_without_layout_part.push({ field_key: key });
    }
  }

  items.push({
    file,
    product: item.test?.source?.product || "",
    stage: item.test?.source?.stage || "",
    sequence: item.test?.sequence || "",
    key: item.test?.key || "",
    name: item.test?.name || "",
    counts,
    issues,
  });
}

const issueNames = ["ref_without_source", "fx_without_formula_text", "fx_without_dependencies", "x_without_layout_part"];
const summary = {
  item_count: items.length,
  total_ref: items.reduce((sum, item) => sum + item.counts.ref, 0),
  total_fx: items.reduce((sum, item) => sum + item.counts.fx, 0),
  total_x: items.reduce((sum, item) => sum + item.counts.x, 0),
  total_i: items.reduce((sum, item) => sum + item.counts.i, 0),
  total_date: items.reduce((sum, item) => sum + item.counts.date, 0),
  total_checkbox: items.reduce((sum, item) => sum + item.counts.checkbox, 0),
  ref_without_source_count: items.reduce((sum, item) => sum + item.issues.ref_without_source.length, 0),
  fx_without_formula_text_count: items.reduce((sum, item) => sum + item.issues.fx_without_formula_text.length, 0),
  fx_without_dependencies_count: items.reduce((sum, item) => sum + item.issues.fx_without_dependencies.length, 0),
  x_without_layout_part_count: items.reduce((sum, item) => sum + item.issues.x_without_layout_part.length, 0),
  priority_shadowed_count: items.reduce((sum, item) => sum + item.issues.priority_shadowed.length, 0),
};

const problemItems = items.filter((item) => issueNames.some((name) => item.issues[name].length));
const audit = { generated_at: new Date().toISOString(), summary, items };
await fs.writeFile(auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const md = [
  "# QC Advanced Field Semantics Audit",
  "",
  `Generated: ${audit.generated_at}`,
  "",
  "## Summary",
  "",
  ...Object.entries(summary).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Items With Issues",
  "",
  "| File | Product | Stage | Seq | Item | ref | f(x) | x | i | Issues |",
  "|---|---|---|---|---|---:|---:|---:|---:|---|",
  ...problemItems.map((item) => {
    const issueText = issueNames
      .map((name) => item.issues[name].length ? `${name}:${item.issues[name].length}` : "")
      .filter(Boolean)
      .join(", ");
    return `| ${item.file} | ${item.product} | ${item.stage} | ${item.sequence} | ${item.name} | ${item.counts.ref} | ${item.counts.fx} | ${item.counts.x} | ${item.counts.i} | ${issueText} |`;
  }),
  "",
  "## Priority Shadowed Examples",
  "",
  "这些不是错误；它们说明同一字段同时命中多种语义时，渲染按 ref > f(x) > x > i 覆盖。",
  "",
  "| File | Product | Stage | Seq | Item | Count |",
  "|---|---|---|---|---|---:|",
  ...items.filter((item) => item.issues.priority_shadowed.length).slice(0, 60).map((item) => `| ${item.file} | ${item.product} | ${item.stage} | ${item.sequence} | ${item.name} | ${item.issues.priority_shadowed.length} |`),
  "",
].join("\n");
await fs.writeFile(auditMdPath, `${md}\n`, "utf8");

console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${auditJsonPath}`);
console.log(`Wrote ${auditMdPath}`);
