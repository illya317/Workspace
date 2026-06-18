import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve("..");
const qcRoot = path.join(workspaceRoot, ".workspace/config/pharma-qc");
const itemsRoot = path.join(qcRoot, "items");
const auditJsonPath = path.join(qcRoot, "operation_layout_audit.json");
const auditMdPath = path.join(qcRoot, "operation_layout_audit.md");

function str(value) {
  return value == null ? "" : String(value);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function rec(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return str(value)
    .replace(/\{(?:FIELD|PREFILL):[^}]*\}/g, "")
    .replace(/[#*_`>|-]/g, "")
    .replace(/[□☐]/g, "")
    .replace(/\s+/g, "")
    .replace(/[，,、。；;：:（）()《》“”"'\[\]【】]/g, "")
    .trim();
}

function textCoverage(source, rendered) {
  const sourceNorm = normalizeText(source);
  const renderedNorm = normalizeText(rendered);
  if (!sourceNorm) return 1;
  if (!renderedNorm) return 0;
  if (renderedNorm.includes(sourceNorm)) return 1;
  const gram = 12;
  let total = 0;
  let hit = 0;
  for (let index = 0; index <= Math.max(0, sourceNorm.length - gram); index += 1) {
    const token = sourceNorm.slice(index, index + gram);
    if (token.length < gram) continue;
    total += 1;
    if (renderedNorm.includes(token)) hit += 1;
  }
  return total ? hit / total : 0;
}

function partText(part) {
  const data = rec(part);
  const type = str(data.type);
  if (type === "text" || type === "note" || type === "hint" || type === "test_value") return str(data.text || data.value);
  if (type === "section_heading") return `${str(data.sectionSuffix)} ${str(data.text)}`;
  if (type === "field" || type === "line" || type === "param" || type === "date") return str(data.field || data.name || data.placeholder || data.defaultValue);
  if (type === "radio" || type === "checkbox" || type === "select") return arr(data.options).join("/");
  if (type === "br") return "\n";
  return "";
}

function blockText(block) {
  const data = rec(block);
  const type = str(data.type);
  const parts = arr(data.parts).map(partText).join("");
  const rowText = arr(data.rows)
    .map((row) => arr(row).map((cell) => `${str(rec(cell).rawText)} ${arr(rec(cell).parts).map(partText).join("")}`).join(" "))
    .join("\n");
  return [
    str(data.title),
    str(data.label),
    str(data.text),
    parts,
    rowText,
  ].filter(Boolean).join("\n");
}

function partsComparableText(parts) {
  return arr(parts).map(partText).join("");
}

function layoutText(item) {
  return arr(item.test?.layout_blocks).map(blockText).join("\n");
}

function relevantSections(item) {
  return arr(item.test?.sections).filter((section) => /操作方法|测定与计算|测定法|检查法|称重/.test(str(section.title)));
}

function hasLayoutTable(item) {
  return arr(item.test?.layout_blocks).some((block) => str(rec(block).type) === "table" && !/signature|project_header/i.test(str(rec(block).label)));
}

function hasMeasurementLayout(item) {
  return arr(item.test?.layout_blocks).some((block) => /测定|计算|吸光度|峰面积|数据记录|结果|系统适用性|称重|溶出度|含量/.test(str(rec(block).label || rec(block).title)));
}

function sourceHasTableNeed(text) {
  return /数据记录表|测定与计算|对照品计算|供试品计算|吸光度|峰面积|计算公式|系统适用性/.test(text);
}

function longBoldTextHits(item) {
  const hits = [];
  function walk(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, [...pathParts, index]));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.bold === true && typeof value.text === "string" && value.text.length > 40) {
      hits.push({ path: pathParts.join("."), text: value.text.slice(0, 180) });
    }
    Object.entries(value).forEach(([key, child]) => walk(child, [...pathParts, key]));
  }
  walk(item.test?.layout_blocks);
  return hits;
}

function titleAlignmentHits(item) {
  const hits = [];
  for (const [index, block] of arr(item.test?.layout_blocks).entries()) {
    const data = rec(block);
    if (str(data.type) === "title" && str(data.align) && str(data.align) !== "left") {
      hits.push({ blockIndex: index, title: str(data.title), align: str(data.align) });
    }
    for (const [rowIndex, row] of arr(data.rows).entries()) {
      for (const [cellIndex, cell] of arr(row).entries()) {
        const c = rec(cell);
        if ((c.header === true || c.bold === true) && str(c.align) && str(c.align) !== "left" && /^(title|section_heading)$/i.test(str(c.role))) {
          hits.push({ blockIndex: index, rowIndex, cellIndex, title: str(c.rawText), align: str(c.align) });
        }
      }
    }
  }
  return hits;
}

function visibleMarkdownResidueHits(item) {
  const hits = [];
  function visit(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...pathParts, index]));
      return;
    }
    if (!value || typeof value !== "object") return;
    const data = rec(value);
    const textValues = [
      ["text", str(data.text)],
      ["rawText", str(data.rawText)],
    ];
    for (const [field, text] of textValues) {
      if (!text) continue;
      if (/\*\*数据记录表：?\*\*|^\s*\|\s*---|^\s*\|/.test(text)) {
        hits.push({ path: [...pathParts, field].join("."), text: text.slice(0, 180) });
      }
    }
    Object.entries(value).forEach(([key, child]) => visit(child, [...pathParts, key]));
  }
  visit(item.test?.layout_blocks, ["layout_blocks"]);
  return hits;
}

function operationFlattenedTableTailHits(item) {
  const hits = [];
  for (const [index, block] of arr(item.test?.layout_blocks).entries()) {
    const data = rec(block);
    const label = str(data.label);
    if (label !== "md_operation_method" && !/^md_supplement_paragraph_/.test(label)) continue;
    const text = partsComparableText(data.parts);
    const patterns = [
      /(?:^|[。；;]\s*|\n\s*)(?:数据记录表|测定与计算|称重)\s*(?:吸光度波长|样品称样|对照含量|对照品计算|供试品计算|计算公式|供试品溶出度|峰面积|名称|平均|RD|RSD)/,
      /(?:^|\s)\d+(?:\.\d+){2,}\s+(?:称重|测定与计算)\s+(?:样品称样|对照品计算|供试品计算|计算公式|峰面积|名称|含量|平均|RD|RSD)/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        hits.push({ blockIndex: index, label, text: text.slice(Math.max(0, match.index - 80), match.index + 220) });
        break;
      }
    }
  }
  return hits;
}

function methodFieldMaps(item) {
  const fields = arr(item.test?.method_groups || item.test?.methodGroups)
    .flatMap((group) => arr(group.fields).map((field) => rec(field)));
  const byKey = new Map();
  const byName = new Map();
  for (const field of fields) {
    const key = str(field.field_key || field.fieldKey);
    const name = str(field.name);
    if (key) byKey.set(key, field);
    if (name && !byName.has(name)) byName.set(name, field);
  }
  return { fields, byKey, byName };
}

function layoutPartsWithPath(item) {
  const parts = [];
  function walk(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, [...pathParts, index]));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (["line", "field", "select", "date", "radio", "checkbox"].includes(str(value.type))) {
      parts.push({ path: pathParts.join("."), part: rec(value) });
    }
    Object.entries(value).forEach(([key, child]) => walk(child, [...pathParts, key]));
  }
  walk(item.test?.layout_blocks);
  return parts;
}

function formulaNames(formula) {
  return [...str(formula).matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function bareReferenceFormulaTarget(field, fields) {
  if (str(field.attr) !== "calculated") return "";
  const formula = str(field.formula || field.rule).trim();
  if (!formula) return "";
  if (/[<>=!&|+\-*/%^(),"'.0-9]/.test(formula) || formula.includes("ALL(") || formula.includes("Math.")) return "";
  const prefix = str(field.field_key || field.fieldKey).split("/").slice(0, 2).join("/");
  const candidate = fields.find((source) => (
    source !== field
    && str(source.name) === formula
    && (!prefix || str(source.field_key || source.fieldKey).startsWith(`${prefix}/`))
  ));
  return str(candidate?.field_key || candidate?.fieldKey);
}

function fieldIntegrityHits(item) {
  const hits = {
    calculated_without_formula: [],
    formula_missing_dependency: [],
    field_ref_missing_source: [],
    readonly_missing_method_field: [],
    readonly_not_calculated_or_ref: [],
    readonly_without_formula_or_ref: [],
  };
  const { fields, byKey, byName } = methodFieldMaps(item);
  for (const field of fields) {
    const key = str(field.field_key || field.fieldKey);
    const formula = str(field.formula || field.rule).trim();
    const source = rec(field.value_source || field.valueSource);
    const sourceKey = str(field.reference_field_key || field.referenceFieldKey || source.field_key || source.fieldKey);
    if (str(field.attr) === "calculated" && !formula) {
      hits.calculated_without_formula.push({ field_key: key, name: str(field.name) });
    }
    if (str(source.type) === "field_ref" && !sourceKey) {
      hits.field_ref_missing_source.push({ field_key: key, name: str(field.name) });
    }
    if (formula && /[`]/.test(formula)) {
      for (const name of formulaNames(formula)) {
        if (!byName.has(name)) {
          hits.formula_missing_dependency.push({ field_key: key, name: str(field.name), dependency: name, formula });
        }
      }
    }
  }

  for (const { path: partPath, part } of layoutPartsWithPath(item)) {
    if (part.readonlyDisplay !== true) continue;
    const key = str(part.fieldKey || part.field_key);
    const fieldName = str(part.field || part.name);
    if ((!key && !fieldName) || /\/signature\//.test(key)) continue;
    const field = byKey.get(key) || byName.get(fieldName) || {};
    if (!Object.keys(field).length) {
      hits.readonly_missing_method_field.push({
        path: partPath,
        field_key: key,
        field: fieldName,
      });
      continue;
    }
    const formula = str(part.advancedFormulaText || field.formula || field.rule).trim();
    const source = rec(field.value_source || field.valueSource);
    const sourceKey = str(field.reference_field_key || field.referenceFieldKey || source.field_key || source.fieldKey);
    const hasReference = !!sourceKey || !!bareReferenceFormulaTarget(field, fields);
    const isCalculated = str(field.attr) === "calculated" || !!part.advancedFormulaText || !!part.advancedFormulaTextMap;
    if (!isCalculated && !hasReference) {
      hits.readonly_not_calculated_or_ref.push({
        path: partPath,
        field_key: key,
        field: fieldName || str(field.name),
        attr: str(field.attr),
      });
      continue;
    }
    if (!hasReference && (!isCalculated || !formula)) {
      hits.readonly_without_formula_or_ref.push({
        path: partPath,
        field_key: key,
        field: str(part.field || part.name || field.name),
      });
    }
  }
  return hits;
}

function finishedCopyRisk(item) {
  const test = rec(item.test);
  if (test.source?.stage !== "finished") return "";
  if (!["content", "dissolution", "weight_variation", "fill_variation", "acid_release"].includes(str(test.key))) return "";
  const refs = arr(test.packaging_reference_phrases).join(" ");
  if (/待包装品/.test(refs) || test.copy_from_packaging) return test.copied_from ? "" : "finished_reference_not_copied";
  return "";
}

const files = (await fs.readdir(itemsRoot)).filter((file) => file.endsWith(".json")).sort();
const items = [];
for (const file of files) {
  const item = JSON.parse(await fs.readFile(path.join(itemsRoot, file), "utf8"));
  const sections = relevantSections(item);
  const sourceText = sections.map((section) => str(section.text)).join("\n\n");
  const rendered = layoutText(item);
  const coverage = textCoverage(sourceText, rendered);
  const tableNeed = sourceHasTableNeed(sourceText);
  const tableGap = tableNeed && (!hasLayoutTable(item) || !hasMeasurementLayout(item));
  const danglingHeadings = [...sourceText.matchAll(/(?:^|\n|\s)(测定与计算|数据记录表|对照品计算|供试品计算)(?:\s*$|\s*\n)/g)].map((match) => match[1]);
  const longBold = longBoldTextHits(item);
  const titleAlign = titleAlignmentHits(item);
  const visibleMarkdownResidue = visibleMarkdownResidueHits(item);
  const operationFlattenedTableTail = operationFlattenedTableTailHits(item);
  const fieldIntegrity = fieldIntegrityHits(item);
  const hasFieldIntegrityIssue = Object.values(fieldIntegrity).some((hits) => hits.length);
  const copyRisk = finishedCopyRisk(item);
  const severity = (
    tableGap || longBold.length || visibleMarkdownResidue.length || operationFlattenedTableTail.length || copyRisk || hasFieldIntegrityIssue ? "high"
      : coverage < 0.86 || danglingHeadings.length ? "medium"
        : "low"
  );
  items.push({
    file,
    product: item.test?.source?.product || "",
    stage: item.test?.source?.stage || "",
    sequence: item.test?.sequence || "",
    key: item.test?.key || "",
    name: item.test?.name || "",
    method: item.test?.method || "",
    copied_from: item.test?.copied_from || null,
    coverage: Number(coverage.toFixed(3)),
    section_count: sections.length,
    has_layout_table: hasLayoutTable(item),
    has_measurement_layout: hasMeasurementLayout(item),
    table_gap: tableGap,
    dangling_headings: [...new Set(danglingHeadings)],
    long_bold: longBold,
    title_alignment: titleAlign,
    visible_markdown_residue: visibleMarkdownResidue,
    operation_flattened_table_tail: operationFlattenedTableTail,
    field_integrity: fieldIntegrity,
    copy_risk: copyRisk,
    severity,
  });
}

const high = items.filter((item) => item.severity === "high");
const medium = items.filter((item) => item.severity === "medium");
const summary = {
  item_count: items.length,
  high_count: high.length,
  medium_count: medium.length,
  long_bold_count: items.filter((item) => item.long_bold.length).length,
  visible_markdown_residue_count: items.filter((item) => item.visible_markdown_residue.length).length,
  operation_flattened_table_tail_count: items.filter((item) => item.operation_flattened_table_tail.length).length,
  table_gap_count: items.filter((item) => item.table_gap).length,
  copy_risk_count: items.filter((item) => item.copy_risk).length,
  calculated_without_formula_count: items.reduce((count, item) => count + item.field_integrity.calculated_without_formula.length, 0),
  formula_missing_dependency_count: items.reduce((count, item) => count + item.field_integrity.formula_missing_dependency.length, 0),
  field_ref_missing_source_count: items.reduce((count, item) => count + item.field_integrity.field_ref_missing_source.length, 0),
  readonly_missing_method_field_count: items.reduce((count, item) => count + item.field_integrity.readonly_missing_method_field.length, 0),
  readonly_not_calculated_or_ref_count: items.reduce((count, item) => count + item.field_integrity.readonly_not_calculated_or_ref.length, 0),
  readonly_without_formula_or_ref_count: items.reduce((count, item) => count + item.field_integrity.readonly_without_formula_or_ref.length, 0),
  low_coverage_count: items.filter((item) => item.coverage < 0.86).length,
};

const audit = { generated_at: new Date().toISOString(), summary, items };
await fs.writeFile(auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const md = [
  "# QC Operation Layout Audit",
  "",
  `Generated: ${audit.generated_at}`,
  "",
  "## Summary",
  "",
  ...Object.entries(summary).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## High Severity",
  "",
  "| File | Product | Stage | Seq | Item | Coverage | Reasons |",
  "|---|---|---|---|---|---:|---|",
  ...high.map((item) => {
    const reasons = [
      item.table_gap ? "table_gap" : "",
      item.long_bold.length ? "long_bold" : "",
      item.visible_markdown_residue.length ? "visible_markdown_residue" : "",
      item.operation_flattened_table_tail.length ? "operation_flattened_table_tail" : "",
      item.copy_risk,
      Object.values(item.field_integrity).some((hits) => hits.length) ? "field_integrity" : "",
      item.coverage < 0.72 ? "low_coverage" : "",
    ].filter(Boolean).join(", ");
    return `| ${item.file} | ${item.product} | ${item.stage} | ${item.sequence} | ${item.name} | ${item.coverage} | ${reasons} |`;
  }),
  "",
  "## Medium Severity",
  "",
  "| File | Product | Stage | Seq | Item | Coverage | Notes |",
  "|---|---|---|---|---|---:|---|",
  ...medium.slice(0, 80).map((item) => `| ${item.file} | ${item.product} | ${item.stage} | ${item.sequence} | ${item.name} | ${item.coverage} | ${item.dangling_headings.join(", ")} |`),
  "",
].join("\n");
await fs.writeFile(auditMdPath, `${md}\n`, "utf8");

console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${auditJsonPath}`);
console.log(`Wrote ${auditMdPath}`);
