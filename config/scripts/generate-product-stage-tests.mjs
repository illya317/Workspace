#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parse as parseYaml } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const outRoot = path.resolve(root, "..", ".workspace/config/pharma-qc");
const qcSourceRoot = path.join(outRoot, "source");
const standardTemplateOutRoot = path.join(outRoot, "templates");
const fullOutRoot = path.join(outRoot, "full");
const itemOutRoot = path.join(outRoot, "items");
const dedicatedMethodOutRoot = path.join(outRoot, "dedicated_methods");
const recordOutRoot = path.join(outRoot, "records");
const outFile = path.join(outRoot, "product_stage_tests.json");
const reportFile = path.join(outRoot, "product_stage_tests_report.md");
const mdMethodAuditFile = path.join(outRoot, "md_method_split_audit.json");
const mdMethodAuditReportFile = path.join(outRoot, "md_method_split_audit.md");
const opsConfigRoot = path.join(root, "config/pharma-ops");
const externalOpsConfigRoot = path.resolve(root, "..", ".workspace/config/pharma-ops");
let configRoot = opsConfigRoot;
let templatesRoot = path.join(configRoot, "record_templates");
let mdRoot = path.join(configRoot, "source_docs/schema/md_canonical");
let methodsRoot = path.join(configRoot, "methods");

const stageOrder = ["intermediate", "packaging", "finished"];
const stageLabels = {
  intermediate: "中间体",
  packaging: "待包装品",
  finished: "成品",
};

const specialTestKeys = new Map([
  ["酸中释放度", "acid_release"],
  ["耐酸力", "acid_resistance"],
]);

const manualPackagingReferencePhrases = new Map([
  [
    "atenolol/finished/content",
    ["检验数据及计算过程见待包装品（二）2.4.5.2项下。"],
  ],
  [
    "atenolol/finished/dissolution",
    ["测定结果与计算过程见待包装品（二）2.2.5项。"],
  ],
  [
    "clarithromycin/finished/content",
    ["检验数据及计算过程见待包装品（二）2.4.5.2项下。"],
  ],
  [
    "isosorbide_dinitrate/finished/dissolution",
    ["测定结果与计算过程见待包装品（二）2.3.5项。"],
  ],
  [
    "isosorbide_dinitrate/finished/content",
    ["检验数据及计算过程见待包装品（二）2.4.5.2项下。"],
  ],
  [
    "pantoprazole/finished/acid_release",
    ["测定结果与计算过程见待包装品（二）2.3.5.1项。"],
  ],
  [
    "pantoprazole/finished/dissolution",
    ["测定结果与计算过程见待包装品（二）2.4.5.1项。"],
  ],
  [
    "simvastatin/finished/content_uniformity",
    ["检验数据及计算过程见待包装品（二）2.2.5.2项下。"],
  ],
  [
    "simvastatin/finished/dissolution",
    ["测定结果与计算过程见待包装品（二）2.3.5项。"],
  ],
  [
    "simvastatin/finished/content",
    ["检验数据及计算过程见待包装品（二）2.4.5.2项下。"],
  ],
  [
    "spironolactone/finished/dissolution",
    ["测定结果与计算过程见待包装品（二）2.3.5项。"],
  ],
  [
    "spironolactone/finished/content",
    ["检验数据及计算过程见待包装品（二）2.4.5.2项下。"],
  ],
  [
    "terazosin/finished/content_uniformity",
    ["检验数据及计算过程见待包装品（二）2.2.5.2项下。"],
  ],
]);

function rec(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function str(value, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function setConfigRoot(nextRoot) {
  configRoot = nextRoot;
  templatesRoot = path.join(configRoot, "record_templates");
  mdRoot = path.join(configRoot, "source_docs/schema/md_canonical");
  methodsRoot = path.join(configRoot, "methods");
}

async function readYaml(file) {
  return parseYaml(await fs.readFile(file, "utf8"), { uniqueKeys: false });
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function listFiles(dir, suffix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function findSourceRoot() {
  const candidates = [qcSourceRoot, opsConfigRoot];
  for (const dir of candidates) {
    if (
      await pathExists(path.join(dir, "record_templates"))
      && await pathExists(path.join(dir, "methods"))
      && await pathExists(path.join(dir, "source_docs/schema/md_canonical"))
      && await pathExists(path.join(dir, "table_layouts/layout_mapping.json"))
      && await pathExists(path.join(dir, "table_layouts/templates/parents/dissolution_full.json"))
    ) return dir;
  }
  return opsConfigRoot;
}

async function loadMethods() {
  const index = {};
  for (const file of await listFiles(methodsRoot, ".yaml")) {
    const data = rec(await readYaml(file));
    for (const [name, definition] of Object.entries(rec(data.methods))) {
      index[name] = { fileName: path.basename(file), definition };
    }
  }
  return index;
}

async function loadLayoutMapping() {
  const layoutMappingCandidates = [
    path.join(configRoot, "table_layouts/layout_mapping.json"),
    path.join(qcSourceRoot, "table_layouts/layout_mapping.json"),
    path.join(externalOpsConfigRoot, "table_layouts/layout_mapping.json"),
  ];
  for (const file of layoutMappingCandidates) {
    const data = await readJsonIfExists(file);
    if (data) {
      return {
        source: path.relative(root, file).startsWith("..") ? file : path.relative(root, file),
        assignments: rec(data.assignments),
      };
    }
  }
  return { source: "", assignments: {} };
}

async function findLayoutRoot() {
  const layoutRootCandidates = [
    path.join(configRoot, "table_layouts"),
    path.join(qcSourceRoot, "table_layouts"),
    path.join(externalOpsConfigRoot, "table_layouts"),
  ];
  for (const dir of layoutRootCandidates) {
    if (
      await pathExists(path.join(dir, "layout_mapping.json"))
      && await pathExists(path.join(dir, "templates/parents/dissolution_full.json"))
    ) return dir;
  }
  return "";
}

async function copyPathIfExists(source, target) {
  if (!(await pathExists(source))) return false;
  await fs.cp(source, target, {
    recursive: true,
    filter: (src) => !src.endsWith(`${path.sep}.DS_Store`) && path.basename(src) !== ".DS_Store",
  });
  return true;
}

async function countFiles(dir) {
  if (!(await pathExists(dir))) return 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const file = path.join(dir, entry.name);
    count += entry.isDirectory() ? await countFiles(file) : 1;
  }
  return count;
}

async function syncSourceBundle({ sourceRoot, layoutRoot }) {
  if (path.resolve(sourceRoot) === path.resolve(qcSourceRoot)) {
    return { copied: false, sourceRoot: qcSourceRoot };
  }
  await fs.rm(qcSourceRoot, { recursive: true, force: true });
  await fs.mkdir(qcSourceRoot, { recursive: true });
  const copied = {};
  copied.products = await copyPathIfExists(path.join(sourceRoot, "products.yaml"), path.join(qcSourceRoot, "products.yaml"));
  copied.record_templates = await copyPathIfExists(path.join(sourceRoot, "record_templates"), path.join(qcSourceRoot, "record_templates"));
  copied.methods = await copyPathIfExists(path.join(sourceRoot, "methods"), path.join(qcSourceRoot, "methods"));
  copied.md_canonical = await copyPathIfExists(
    path.join(sourceRoot, "source_docs/schema/md_canonical"),
    path.join(qcSourceRoot, "source_docs/schema/md_canonical"),
  );
  copied.table_layouts = await copyPathIfExists(layoutRoot, path.join(qcSourceRoot, "table_layouts"));
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    purpose: "Self-contained pharma-qc source bundle; pharma-ops can be archived after verification.",
    source_root: sourceRoot,
    layout_root: layoutRoot,
    copied,
    counts: {
      record_templates: await countFiles(path.join(qcSourceRoot, "record_templates")),
      methods: await countFiles(path.join(qcSourceRoot, "methods")),
      md_canonical: await countFiles(path.join(qcSourceRoot, "source_docs/schema/md_canonical")),
      table_layouts: await countFiles(path.join(qcSourceRoot, "table_layouts")),
    },
  };
  await fs.writeFile(path.join(qcSourceRoot, "source_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { copied: true, sourceRoot: qcSourceRoot, manifest };
}

async function loadOperationParams(layoutRoot) {
  if (!layoutRoot) return {};
  const entries = await fs.readdir(layoutRoot, { withFileTypes: true }).catch(() => []);
  const index = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith("_operation_params.yaml")) continue;
    const data = rec(await readYaml(path.join(layoutRoot, entry.name)));
    for (const [product, stages] of Object.entries(rec(data.products))) {
      for (const [stage, tests] of Object.entries(rec(stages))) {
        for (const [test, value] of Object.entries(rec(tests))) {
          const params = rec(rec(value)["操作方法参数"]);
          if (!Object.keys(params).length) continue;
          const key = `products/${product}/${stage}/${test}`;
          index[key] = { ...index[key], [entry.name.replace(/\.yaml$/, "")]: params };
        }
      }
    }
  }
  return index;
}

async function loadRecordTemplateSources() {
  if (await pathExists(recordOutRoot)) {
    const files = await listFiles(recordOutRoot, ".json");
    if (files.length) {
      return Promise.all(files.map(async (file) => {
        const data = rec(await readJsonIfExists(file));
        const productKey = str(data.product_key || rec(data.product).key, path.basename(file, ".json"));
        return {
          productKey,
          template: data.stages ? canonicalRecordToTemplate(data) : rec(data.record || data),
          sourceType: "json",
          file,
        };
      }));
    }
  }
  const files = await listFiles(templatesRoot, ".yaml");
  return Promise.all(files.map(async (file) => ({
    productKey: path.basename(file, ".yaml"),
    template: rec(await readYaml(file)),
    sourceType: "yaml_migration",
    file,
  })));
}

function canonicalRecordToTemplate(record) {
  const stages = {};
  for (const [stageKey, stage] of Object.entries(rec(record.stages))) {
    stages[stageKey] = {
      "显示名": str(stage.label || stageKey),
      "检验前确认": rec(stage.precheck),
      "检测项": arr(stage.tests).map((test) => ({
        "序号": str(test.sequence),
        "名称": str(test.name),
        "英文名": str(test.key),
        "方法": str(test.method),
        "标准规定模板": str(rec(test.record_config).standard_template),
        "标准规定参数": rec(rec(test.record_config).standard_params),
        "结论名称": str(rec(test.record_config).conclusion_name),
        "结论含数值": rec(test.record_config).has_numeric_conclusion === true,
        "结论判定": rec(rec(test.record_config).conclusion_rule),
        "清场模板": str(rec(test.record_config).cleanup_template),
        "附加说明模板": str(rec(test.record_config).attachment_template),
        "附加说明参数": rec(rec(test.record_config).attachment_params),
      })),
    };
  }
  return {
    "产品名称": str(rec(record.product).name, str(record.product_name)),
    "阶段": stages,
  };
}

async function writeCanonicalRecordFiles(products, rawStageIndex, generatedAt) {
  await fs.rm(recordOutRoot, { recursive: true, force: true });
  await fs.mkdir(recordOutRoot, { recursive: true });
  for (const product of products) {
    const data = {
      schema_version: 1,
      generated_at: generatedAt,
      runtime_source: "pharma-qc JSON",
      product: {
        key: product.key,
        name: product.name,
      },
      stages: Object.fromEntries(Object.entries(product.stages).map(([stageKey, stage]) => {
        const rawStage = rec(rawStageIndex[`${product.key}/${stageKey}`]);
        return [stageKey, {
          key: stageKey,
          label: stage.label,
          precheck: rec(rawStage["检验前确认"]),
          tests: stage.tests.map((test) => compactObject({
            key: test.key,
            sequence: test.sequence,
            name: test.name,
            method: test.method,
            method_key: test.method_key,
            method_ref: test.method_ref,
            method_source: test.method_source,
            file: test.file,
            record_config: test.record_config,
            copy_from_packaging: test.copy_from_packaging === true || undefined,
            copied_from: test.copied_from || undefined,
          })),
        }];
      })),
    };
    await fs.writeFile(path.join(recordOutRoot, `${product.key}.json`), `${JSON.stringify(compactObject(data), null, 2)}\n`, "utf8");
  }
}

function formatText(value, params) {
  return str(value).replace(/\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/g, (match, a, b) => {
    const param = params[a || b];
    return param === undefined || typeof param === "object" ? match : String(param);
  });
}

function substitute(value, params) {
  if (typeof value === "string") return formatText(value, params);
  if (Array.isArray(value)) return value.map((item) => substitute(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substitute(val, params)]));
  }
  return value;
}

function looksLikeBodyText(value) {
  const text = str(value).trim();
  return text.length > 36 || /[，。,；;。]/.test(text);
}

function asBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function maybeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function maybePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stringRecord(value) {
  const entries = Object.entries(rec(value))
    .map(([key, val]) => [key, str(val)])
    .filter(([, val]) => val);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function stringArrayRecord(value) {
  const entries = Object.entries(rec(value))
    .map(([key, val]) => [key, arr(val).map((item) => str(item)).filter(Boolean)])
    .filter(([, val]) => val.length);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function asRange(value) {
  if (Array.isArray(value)) return { min: maybeNumber(value[0]) ?? null, max: maybeNumber(value[1]) ?? null };
  const range = rec(value);
  const min = maybeNumber(range.min);
  const max = maybeNumber(range.max);
  return min === undefined && max === undefined ? undefined : { min: min ?? null, max: max ?? null };
}

function widthFromChars(value) {
  const chars = Number(value);
  if (!Number.isFinite(chars) || chars <= 0) return undefined;
  return `${Math.max(2.5, chars * 0.62)}rem`;
}

function paramString(params, name) {
  const value = params[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function paramScope(raw, params) {
  const paramsPath = str(raw.params_path || raw.paramsPath);
  return paramsPath ? { ...params, ...rec(params[paramsPath]) } : params;
}

function formatTemplateKeepParams(text, params) {
  return str(text).replace(/\[([^\]]*\{([\w.-]+)\}[^\]]*)\]/g, (match, body, key) => (
    params[key] == null || params[key] === "" ? "" : body
  ));
}

function fieldPart(label) {
  const match = str(label).match(/^(.+?)（(.+)）$/);
  return { type: "line", field: match?.[1] || label, placeholder: match?.[2], width: "6.5rem", underline: true };
}

function blankPart(fieldKey, blank) {
  return { type: "line", fieldKey, width: `${Math.max(3.5, Math.min(12, str(blank).length * 0.9))}em`, underline: true };
}

const inlineTokenRe = /\{FIELD:([^}]+)\}|\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}|[_＿]{2,}/g;

function inlineParts(text, params, keyPrefix, literalMode = "text", paramName = "") {
  const parts = [];
  let cursor = 0;
  let blankIndex = 0;
  for (const match of str(text).matchAll(inlineTokenRe)) {
    if (match.index > cursor) {
      const literal = text.slice(cursor, match.index);
      if (literal) parts.push(literalMode === "param" ? { type: "param", name: paramName, defaultValue: literal } : { type: "text", text: literal });
    }
    if (match[1]) {
      parts.push(fieldPart(match[1]));
    } else if (match[2] || match[3]) {
      const key = match[2] || match[3];
      const value = params[key];
      if (value == null || typeof value === "object") {
        parts.push({ type: "param", name: key });
      } else {
        parts.push(...inlineParts(String(value), params, `${keyPrefix}/${key}`, "param", key));
      }
    } else {
      blankIndex += 1;
      parts.push(blankPart(`${keyPrefix}/blank_${blankIndex}`, match[0]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < str(text).length) {
    const literal = str(text).slice(cursor);
    if (literal) parts.push(literalMode === "param" ? { type: "param", name: paramName, defaultValue: literal } : { type: "text", text: literal });
  }
  return parts;
}

function textParts(template, params, keyPrefix = "layout/operation") {
  return inlineParts(formatTemplateKeepParams(template, params), params, keyPrefix);
}

function layoutPart(raw, params = {}) {
  const part = rec(raw);
  const type = str(part.type, "text");
  const name = str(part.name);
  const defaultValue = type === "param" && name ? str(params[name]) : "";
  return {
    type,
    text: formatText(str(part.text), params) || undefined,
    sectionRef: str(part.section_ref || part.sectionRef) || undefined,
    sectionSuffix: str(part.section_suffix || part.sectionSuffix) || undefined,
    fieldKey: str(part.field_key || part.fieldKey || part.key) || undefined,
    field: str(part.field) || undefined,
    name: name || undefined,
    options: arr(part.options).map((option) => str(option)).filter(Boolean),
    width: str(part.width) || widthFromChars(part.initial_chars || part.initialChars),
    underline: asBoolean(part.underline),
    placeholder: str(part.placeholder ?? part.hint) || undefined,
    multiline: asBoolean(part.multiline ?? part.multiLine),
    rows: maybePositiveNumber(part.rows ?? part.min_rows ?? part.minRows),
    withTime: asBoolean(part.with_time ?? part.withTime),
    inputType: str(part.input_type || part.inputType) || undefined,
    defaultValue: defaultValue || str(part.default ?? part.default_value) || undefined,
    defaultOffsetDays: maybeNumber(part.default_offset_days ?? part.defaultOffsetDays),
    readonlyDisplay: asBoolean(part.readonly_display ?? part.readOnlyDisplay),
    occurrence: maybePositiveNumber(part.occurrence ?? part.field_occurrence ?? part.fieldOccurrence),
    startKey: str(part.start_key || part.start_date_key || part.from_key || part.startKey) || undefined,
    endKey: str(part.end_key || part.end_date_key || part.to_key || part.endKey) || undefined,
    startHourKey: str(part.start_hour_key || part.startHourKey) || undefined,
    endHourKey: str(part.end_hour_key || part.endHourKey) || undefined,
    recommendedRange: asRange(part.recommended_range ?? part.recommendedRange ?? part.expected_range ?? part.expectedRange),
    summaryDay: maybePositiveNumber(part.summary_day ?? part.summaryDay),
    advancedFormulaText: str(part.advanced_formula_text ?? part.advancedFormulaText) || undefined,
    advancedFormulaTextMap: stringRecord(part.advanced_formula_text_map ?? part.advancedFormulaTextMap),
    advancedFormulaValueFieldKey: str(part.advanced_formula_value_field_key ?? part.advancedFormulaValueFieldKey) || undefined,
    advancedDependencyFieldKeys: arr(part.advanced_dependency_field_keys ?? part.advancedDependencyFieldKeys).map((item) => str(item)).filter(Boolean),
    advancedDependencyFieldKeyMap: stringArrayRecord(part.advanced_dependency_field_key_map ?? part.advancedDependencyFieldKeyMap),
    advancedDependencyValueFieldKey: str(part.advanced_dependency_value_field_key ?? part.advancedDependencyValueFieldKey) || undefined,
    path: str(part.path) || undefined,
    stripPlaceholder: asBoolean(part.strip_placeholder ?? part.stripPlaceholder),
    bold: asBoolean(part.bold),
  };
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, val]) => val !== undefined)
      .map(([key, val]) => [key, compactObject(val)]));
  }
  return value;
}

function layoutCell(raw, params = {}) {
  const cell = rec(raw);
  const textPath = str(cell.text_path || cell.textPath);
  const text = textPath ? paramString(params, textPath) || "" : formatText(str(cell.raw_text || cell.rawText || cell.text), params);
  return compactObject({
    rawText: text,
    parts: arr(cell.parts).map((part) => layoutPart(part, params)),
    colspan: asNumber(cell.colspan),
    rowspan: asNumber(cell.rowspan),
    isEmpty: cell.is_empty === true || cell.isEmpty === true,
    header: asBoolean(cell.header),
    align: str(cell.align) || undefined,
    bold: asBoolean(cell.bold),
    width: str(cell.width) || undefined,
    className: str(cell.className) || undefined,
  });
}

function simpleCell(rawText, parts = [], colspan = 1) {
  return { rawText, parts, colspan, rowspan: 1, isEmpty: false };
}

function customPart(raw) {
  const data = rec(raw);
  return compactObject({
    type: str(data.type, "text"),
    text: str(data.text) || undefined,
    field: str(data.field) || undefined,
    fieldKey: str(data.field_key || data.fieldKey || data.key) || undefined,
    options: arr(data.options).map((item) => str(item)).filter(Boolean),
    readonlyDisplay: data.readonly_display === true || data.readOnlyDisplay === true,
    advancedFormulaText: str(data.advanced_formula_text || data.advancedFormulaText) || undefined,
    advancedFormulaTextMap: stringRecord(data.advanced_formula_text_map || data.advancedFormulaTextMap),
    advancedFormulaValueFieldKey: str(data.advanced_formula_value_field_key || data.advancedFormulaValueFieldKey) || undefined,
    advancedDependencyFieldKeys: arr(data.advanced_dependency_field_keys || data.advancedDependencyFieldKeys).map((item) => str(item)).filter(Boolean),
    advancedDependencyFieldKeyMap: stringArrayRecord(data.advanced_dependency_field_key_map || data.advancedDependencyFieldKeyMap),
    advancedDependencyValueFieldKey: str(data.advanced_dependency_value_field_key || data.advancedDependencyValueFieldKey) || undefined,
  });
}

function fieldCell(field, options = []) {
  return simpleCell("", [{ type: options.length ? "select" : "field", field, options }]);
}

function precheckFilesBlock(raw, params) {
  const scope = paramScope(raw, params);
  const files = arr(scope[str(raw.files_param || raw.filesParam, "precheck_files")]);
  const section = str(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo, "1.1");
  const title = str(raw.file_title || raw.fileTitle || raw.title, "文件");
  const fieldPrefix = str(raw.field_prefix || raw.fieldPrefix, "pre_check");
  return {
    type: "table",
    label: str(raw.label, "precheck-files"),
    rows: [
      [simpleCell(`${section} ${title}`, [], 3)],
      [simpleCell("文件名称"), simpleCell("文件编码"), simpleCell("是否在实验现场")],
      ...files.map((file, index) => {
        const item = rec(file);
        return [
          simpleCell(str(item.name || item["名称"])),
          simpleCell(str(item.code || item["编码"])),
          simpleCell("", [{ type: "radio", fieldKey: `${fieldPrefix}/file_${index + 1}`, options: ["是", "否"] }]),
        ];
      }),
    ],
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  };
}

function precheckConfirmBlock(raw, params) {
  const scope = paramScope(raw, params);
  const items = arr(scope[str(raw.items_param || raw.itemsParam, "precheck_items")]);
  const envOptions = arr(scope[str(raw.env_options_param || raw.envOptionsParam, "precheck_env_options")]).map((option) => str(option)).filter(Boolean);
  const sectionBase = str(raw.section_base || raw.sectionBase || raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo, "1");
  const envTitle = str(raw.environment_title || raw.environmentTitle, "实验环境");
  const fieldPrefix = str(raw.field_prefix || raw.fieldPrefix, "pre_check");
  return {
    type: "table",
    label: str(raw.label, "precheck-confirm"),
    rows: [
      ...items.map((item, index) => {
        const data = rec(item);
        return [
          simpleCell(`${sectionBase}.${index + 2} ${str(data.name || data["名称"])}`),
          simpleCell("", [{ type: "radio", fieldKey: `${fieldPrefix}/confirm_${index + 1}`, options: ["是", "否"] }]),
        ];
      }),
      [
        simpleCell(`${sectionBase}.${items.length + 2} ${envTitle}`),
        simpleCell("", [{ type: "radio", fieldKey: `${fieldPrefix}/env`, options: envOptions.length ? envOptions : ["符合要求", "不符合要求"] }]),
      ],
    ],
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  };
}

function experimentProjectsBlock(raw, params) {
  const tests = arr(params[str(raw.tests_param || raw.testsParam, "tests")]);
  if (!tests.length) return null;
  return {
    type: "table",
    label: str(raw.label, "experiment-projects"),
    sectionSuffix: str(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo) || undefined,
    rows: [
      [simpleCell("序号"), simpleCell("项目"), simpleCell("方法"), simpleCell("组件")],
      ...tests.map((test) => {
        const item = rec(test);
        return [
          simpleCell(str(item.sequence)),
          simpleCell(str(item.name)),
          simpleCell(str(item.methodName || item.method_name)),
          simpleCell(str(item.templateId || item.template_id)),
        ];
      }),
    ],
    order: Number(raw.order) || undefined,
  };
}

function customLayoutBlock(raw, params) {
  const type = str(raw.type);
  if (type === "precheck_files_table") return precheckFilesBlock(raw, params);
  if (type === "precheck_confirm_table") return precheckConfirmBlock(raw, params);
  if (type === "experiment_projects_table") return experimentProjectsBlock(raw, params);
  if (type === "structured_operation_method" || type === "related_substances_operation_method") {
    const scope = paramScope(raw, params);
    const profile = str(scope.profile, str(raw.profile));
    const segments = arr(rec(raw.profile_segments || raw.profileSegments)[profile]);
    const parts = [];
    segments.forEach((segment, index) => {
      const item = rec(segment);
      const template = item.source ? str(scope[str(item.source)]) : str(item.template);
      const valueParts = textParts(template, scope, `layout/operation/${str(item.label, `segment_${index + 1}`)}`);
      if (!valueParts.length) return;
      const label = str(item.label);
      if (parts.length) parts.push({ type: "text", text: " " });
      if (label) parts.push({ type: "text", text: `${label}：` });
      parts.push(...valueParts);
    });
    return parts.length ? compactObject({ type: "paragraph", parts, order: Number(raw.order) || undefined, moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined }) : null;
  }
  if (type === "related_substances_peak_area_calculation") {
    const systemRows = arr(params[str(raw.system_rows_param || raw.systemRowsParam)]);
    const peakRows = arr(params[str(raw.peak_rows_param || raw.peakRowsParam)]);
    const resultRows = arr(params[str(raw.result_rows_param || raw.resultRowsParam)]);
    return compactObject({
      type: "table",
      label: str(raw.label),
      rows: [
        [simpleCell("项目"), simpleCell("记录", [], 2)],
        ...systemRows.map((row) => {
          const item = rec(row);
          return [simpleCell(str(item.text || item.label)), fieldCell(str(item.field), arr(item.options).map((option) => str(option)).filter(Boolean)), simpleCell("")];
        }),
        ...peakRows.map((row) => {
          const item = rec(row);
          return [simpleCell(str(item.group)), simpleCell(str(item.item)), fieldCell(str(item.field))];
        }),
        ...resultRows.map((row) => {
          const item = rec(row);
          return [simpleCell(str(item.label)), simpleCell("", arr(item.parts).map(customPart), 2)];
        }),
      ],
      order: Number(raw.order) || undefined,
    });
  }
  if (type === "related_substances_weighing_table") {
    const rows = arr(params[str(raw.rows_param || raw.rowsParam)]);
    return compactObject({
      type: "table",
      label: str(raw.label),
      rows: [
        [simpleCell("名称"), simpleCell("含量/规格"), simpleCell("称样")],
        ...rows.map((row, index) => {
          const item = rec(row);
          return [
            simpleCell(str(item.name)),
            simpleCell(str(item.content)),
            simpleCell("", [{ type: "field", field: str(item.field || `称样${index + 1}-毛重`) }, { type: "text", text: ` ${str(item.unit)}` }]),
          ];
        }),
      ],
      order: Number(raw.order) || undefined,
    });
  }
  if (type === "sectioned_operation_steps") {
    const scope = paramScope(raw, params);
    const steps = arr(scope[str(raw.steps_param || raw.stepsParam, "identification_steps")]);
    const parts = [];
    let lastSectionSuffix = "";
    for (const step of steps) {
      const item = rec(step);
      const sectionSuffix = str(item.section_suffix || item.sectionSuffix);
      const title = str(item.title || item.text);
      const body = str(item.body);
      if (!sectionSuffix || !title) continue;
      lastSectionSuffix = sectionSuffix;
      if (parts.length) parts.push({ type: "br" });
      if (looksLikeBodyText(title)) {
        parts.push({ type: "section_heading", text: "", sectionSuffix, bold: true });
        parts.push({ type: "text", text: title });
      } else {
        parts.push({ type: "section_heading", text: title, sectionSuffix, bold: true });
      }
      if (body) parts.push({ type: "br" }, { type: "text", text: body });
    }
    return parts.length ? compactObject({
      type: "paragraph",
      sectionSuffix: lastSectionSuffix,
      parts,
      order: Number(raw.order) || undefined,
      moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
    }) : null;
  }
  return null;
}

function applyBlockParams(block, params) {
  const overrideKeys = [
    "temperature_range", "humidity_limit", "room_rows", "devices", "materials", "standards", "items", "field_prefix",
    "section_suffix", "section_slot", "section_role", "section_ref", "section_anchor", "has_value", "auto_judgment",
    "conclusion_name", "unit", "order", "module_order",
  ];
  const overrides = Object.fromEntries(overrideKeys.flatMap((key) => params[key] !== undefined ? [[key, params[key]]] : []));
  return Object.fromEntries(Object.entries({ ...block, ...overrides }).map(([key, value]) => [key, substitute(value, params)]));
}

function mapLayoutBlock(value, params = {}) {
  const raw = applyBlockParams(rec(value), params);
  const custom = customLayoutBlock(raw, params);
  if (custom) return custom;
  const type = str(raw.type, "table");
  const rows = arr(raw.rows).map((row) => arr(rec(row).cells).map((cell) => layoutCell(cell, params)));
  if (type === "table" && rows.length === 0) return null;
  const textPath = str(raw.text_path || raw.textPath);
  const resolvedText = textPath ? paramString(params, textPath) || "" : str(raw.text || raw.fixed_text);
  const resolvedTitle = str(raw.title) || (type === "title" ? resolvedText : "");
  return compactObject({
    type,
    label: str(raw.label) || undefined,
    title: resolvedTitle || undefined,
    text: resolvedText || undefined,
    sectionSuffix: str(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo) || undefined,
    sectionSlot: str(raw.section_slot || raw.sectionSlot) || undefined,
    sectionRole: str(raw.section_role || raw.sectionRole) || undefined,
    sectionRef: str(raw.section_ref || raw.sectionRef) || undefined,
    sectionAnchor: asBoolean(raw.section_anchor ?? raw.sectionAnchor),
    fieldPrefix: str(raw.field_prefix || raw.fieldPrefix) || undefined,
    inspectionDateKey: str(raw.inspection_date_key || raw.inspectionDateKey) || undefined,
    completionDateKey: str(raw.completion_date_key || raw.completionDateKey) || undefined,
    judgmentDateKey: str(raw.judgment_date_key || raw.judgmentDateKey) || undefined,
    packagingKey: str(raw.packaging_key || raw.packagingKey) || undefined,
    sampleQuantityKey: str(raw.sample_quantity_key || raw.sampleQuantityKey) || undefined,
    fieldKeyOverrides: rec(raw.field_key_overrides || raw.fieldKeyOverrides),
    fileSectionSuffix: str(raw.file_section_suffix || raw.fileSectionSuffix || raw.file_section_no || raw.fileSectionNo) || undefined,
    fileTitle: str(raw.file_title || raw.fileTitle) || undefined,
    rows: rows.length ? rows : undefined,
    parts: arr(raw.parts).map((part) => layoutPart(part, params)),
    devices: arr(raw.devices).map((device) => ({ name: str(rec(device).name, "仪器、设备"), status: str(rec(device).status) || undefined })),
    materials: arr(raw.materials).map((material) => ({ name: str(rec(material).name || material, "试验材料") })),
    standards: arr(raw.standards).map((standard) => ({ name: str(rec(standard).name || standard, "对照品") })),
    items: arr(raw.items).map((item) => str(rec(item).text || rec(item).name || item)).filter(Boolean),
    temperatureRange: paramString(raw, "temperature_range"),
    humidityLimit: paramString(raw, "humidity_limit"),
    roomRows: asNumber(raw.room_rows || raw.rows, 1),
    hasValue: asBoolean(raw.has_value ?? raw.hasValue),
    autoJudgment: asBoolean(raw.auto_judgment ?? raw.autoJudgment),
    conclusionName: str(raw.conclusion_name || raw.conclusionName) || undefined,
    unit: str(raw.unit) || undefined,
    fieldKey: str(raw.field_key || raw.fieldKey || raw.key) || undefined,
    buttonText: str(raw.button_text || raw.buttonText) || undefined,
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  });
}

function sortedLayoutEntries(items) {
  const entryOrder = (item, key) => Number(item[key] ?? rec(item.params)[key] ?? 0);
  return items.sort((a, b) => (
    (entryOrder(a, "module_order") || entryOrder(a, "moduleOrder")) - (entryOrder(b, "module_order") || entryOrder(b, "moduleOrder"))
    || entryOrder(a, "order") - entryOrder(b, "order")
  ));
}

function normalizeLayoutKey(key) {
  const clean = path.posix.normalize(str(key).replace(/\\/g, "/").replace(/\.json$/, ""));
  if (!clean || clean.startsWith("../") || clean === ".." || path.isAbsolute(clean)) throw new Error(`Invalid QC layout key: ${key}`);
  return clean;
}

async function readLayoutTemplate(layoutRoot, templateId) {
  const clean = normalizeLayoutKey(templateId);
  const templatesRootPath = path.resolve(layoutRoot, "templates");
  const file = path.resolve(templatesRootPath, `${clean}.json`);
  if (file !== templatesRootPath && !file.startsWith(`${templatesRootPath}${path.sep}`)) throw new Error(`Invalid QC layout key: ${templateId}`);
  return rec(await readJsonIfExists(file));
}

async function expandLayoutTemplate(layoutRoot, templateId, params, seen = new Set()) {
  const id = normalizeLayoutKey(templateId);
  if (seen.has(id)) return [];
  seen.add(id);
  const data = await readLayoutTemplate(layoutRoot, id);
  const mergedParams = { ...rec(data.params), ...params };
  const entries = sortedLayoutEntries([...arr(data.includes), ...arr(data.blocks)].map(rec));
  const blocks = [];
  for (const entry of entries) {
    const isInclude = str(entry.type) === "include" || !!entry.template_id;
    if (!isInclude) {
      const block = mapLayoutBlock(entry, mergedParams);
      if (block) blocks.push(block);
      continue;
    }
    const variantKeys = [str(entry.variant_param), ...arr(entry.variant_param_aliases).map((alias) => str(alias))].filter(Boolean);
    const variantValue = variantKeys.map((key) => str(mergedParams[key])).find(Boolean) || (variantKeys.length ? str(entry.default_variant) : "");
    const variantRaw = rec(entry.variants)[variantValue];
    const variant = typeof variantRaw === "string" ? { template_id: variantRaw } : rec(variantRaw);
    if (variant.skip === true) continue;
    const childId = str(variant.template_id || entry.template_id);
    if (!childId) continue;
    const childParams = { ...rec(entry.params), ...mergedParams, ...rec(variant.params) };
    blocks.push(...await expandLayoutTemplate(layoutRoot, childId, childParams, new Set(seen)));
  }
  return blocks;
}

function flattenMarker(marker) {
  const parsed = parseMdMarker(marker);
  if (!parsed) return "";
  return parsed.default_value || parsed.suggested_value || parsed.parameter_hint || "";
}

function plainTextFromMd(value) {
  return str(value)
    .replace(/\{(?:FIELD|PREFILL):[^}]*\}/g, (marker) => flattenMarker(marker))
    .replace(/\{(?:FIELD|PREFILL):[A-Za-z0-9_%-]+:?/g, "")
    .replace(/[{}]/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function splitHint(value) {
  const text = str(value).trim();
  if (!text) return { parameter_hint: "", suggested_value: "" };
  const match = text.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  if (match) {
    return {
      parameter_hint: match[1].trim(),
      suggested_value: match[2].trim(),
    };
  }
  return { parameter_hint: text, suggested_value: "" };
}

function parseMdMarker(marker) {
  const match = str(marker).match(/^\{(FIELD|PREFILL):([^}:]+)(?::([^}]*))?\}$/);
  if (!match) return null;
  const kind = match[1];
  const type = match[2] || "";
  const text = match[3] || "";
  const hint = splitHint(text);
  return {
    kind,
    type,
    text,
    role: kind === "PREFILL" ? "default" : "parameter",
    default_value: kind === "PREFILL" ? text.trim() : "",
    suggested_value: kind === "FIELD" ? hint.suggested_value : "",
    parameter_hint: kind === "FIELD" ? hint.parameter_hint : "",
    raw: marker,
  };
}

function normalizeMalformedMdMarkers(value) {
  return str(value)
    .replace(/\{FIELD:number:([^{}]*?)[、，]\s*②\{FIELD:text\}([^{}]*?)\}/g, "{FIELD:number:$1}、②{FIELD:text}$2");
}

function mdFieldsFromText(value) {
  return [...normalizeMalformedMdMarkers(value).matchAll(/\{(?:FIELD|PREFILL):[^}]*\}/g)]
    .map((match) => parseMdMarker(match[0]))
    .filter(Boolean)
    .map((field, index) => ({ index: index + 1, ...field }));
}

function escapeRegExp(value) {
  return str(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionTitleContinuation(section) {
  const title = str(section?.title).trim();
  const match = title.match(/^(操作方法|测定与计算|称重与测定计算|称重|检查法|测定法)(?:\s*[:：]?\s*)?([\s\S]*)$/);
  if (!match) return "";
  return str(match[2]).trim();
}

function sectionRawBody(section) {
  const body = str(arr(section?.lines).join("\n"))
    .replace(/^####\s+\d+(?:\.\d+)*\s+.*(?:\r?\n)+/, "")
    .trim();
  const continuation = sectionTitleContinuation(section);
  if (!continuation) return body;
  if (normalizeComparableText(body).startsWith(normalizeComparableText(continuation))) return body;
  return `${continuation}\n${body}`.trim();
}

function stripInlineSubsections(text, sequence) {
  const sectionNo = escapeRegExp(sequence);
  return str(text)
    .replace(new RegExp(`\\s*${sectionNo}\\.\\d+(?:\\.\\d+)*\\s+[^\\n]*[\\s\\S]*$`), "")
    .replace(/\n#{1,6}\s+[\s\S]*$/, "")
    .trim();
}

function inlineSubsectionTail(text, sequence) {
  const sectionNo = escapeRegExp(sequence);
  const match = str(text).match(new RegExp(`${sectionNo}\\.\\d+(?:\\.\\d+)*\\s+[^\\n]*[\\s\\S]*$`));
  return match ? match[0].trim() : "";
}

function mdOperationSection(mdTest) {
  const sections = arr(mdTest?.sections);
  return sections.find((section) => /操作方法/.test(str(section.title)))
    ?? sections.find((section) => /测定法|检查法|操作/.test(str(section.title)));
}

function stripMoistureMeasurementTable(text) {
  const body = str(text).trim();
  const headerMatch = body.match(/称\s*样\s*[（(]\s*g\s*[）)]\s*(?:\||\s|　)*水\s*分\s*[（(]\s*[%％]\s*[）)]\s*(?:\||\s|　)*平\s*均\s*[（(]\s*[%％]\s*[）)]\s*(?:\||\s|　)*R\s*D\s*[≤<]\s*2(?:\.0)?\s*[%％]/i);
  if (!headerMatch || headerMatch.index === undefined) return body;
  return body.slice(0, headerMatch.index).trim();
}

function stripOperationMarkdownTableTail(text) {
  const body = str(text).trim();
  const tableStartPatterns = [
    /\n\s*\|/,
    /\n\s*[^。\n|]{1,80}\|/,
    /(?:^|[。；;]\s*|[\n\r]\s*)(?:计算|第一次测试|第二次测试|第三次测试|称样|样品称样|对照含量|对照品计算|供试品计算|名称|时间（分钟）|吸光度|20粒总重|每粒装量|峰面积|系统适用性|对照：|测定与计算)\s*[^。；;\n]{0,80}\|/,
    /(?:^|[。；;]\s*|[\n\r]\s*)(?:数据记录表|测定与计算|称重)\s*(?:吸光度波长|样品称样|对照含量|对照品计算|供试品计算|计算公式|供试品溶出度|峰面积|名称|平均|RD|RSD)/,
    /(?:^|\s)\d+(?:\.\d+){2,}\s+(?:称重|测定与计算)\s+(?:样品称样|对照品计算|供试品计算|计算公式|峰面积|名称|含量|平均|RD|RSD)/,
  ];
  const starts = tableStartPatterns
    .map((pattern) => {
      const match = body.match(pattern);
      return match?.index;
    })
    .filter((index) => Number.isInteger(index));
  if (!starts.length) return body;
  const start = Math.min(...starts);
  return body.slice(0, start).trim();
}

function stripVisibleMarkdownTableMarkers(text) {
  return str(text)
    .replace(/(?:^|\n)\s*(?:\*\*)?数据记录表：?(?:\*\*)?\s*(?=\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripDanglingMeasurementHeading(text) {
  return str(text)
    .replace(/(?:[。；;]\s*)?测定与计算[:：]?\s*$/u, "")
    .trim();
}

function mdOperationBody(section, testKeyValue = "") {
  if (!section) return "";
  let body = stripInlineSubsections(sectionRawBody(section), str(section.sequence));
  body = stripOperationMarkdownTableTail(body);
  body = stripVisibleMarkdownTableMarkers(body);
  body = stripDanglingMeasurementHeading(body);
  if (testKeyValue === "moisture") return stripMoistureMeasurementTable(body);
  return body;
}

function partsComparableText(parts) {
  return arr(parts).map((part) => {
    const data = rec(part);
    const type = str(data.type);
    if (type === "text" || type === "note" || type === "hint") return str(data.text);
    if (type === "param") return str(data.defaultValue || data.name);
    if (type === "br") return "\n";
    if (type === "line" || type === "field" || type === "date") return str(data.defaultValue || data.placeholder || data.field || data.name);
    if (type === "radio" || type === "checkbox" || type === "select") return arr(data.options).map((option) => str(option)).join("/");
    return "";
  }).join("");
}

function paragraphSectionHeadingText(block) {
  const data = rec(block);
  if (str(data.type) !== "paragraph") return "";
  const parts = arr(data.parts).filter((part) => str(rec(part).type) !== "br");
  if (!parts.length) return "";
  const isOnlySectionHeadings = parts.every((part) => str(rec(part).type) === "section_heading");
  if (!isOnlySectionHeadings) return "";
  return parts.map((part) => str(rec(part).text || rec(part).title)).join("").trim();
}

function cellComparableText(cell) {
  const data = rec(cell);
  return `${str(data.rawText)}${partsComparableText(data.parts)}`;
}

function blocksComparableText(blocks) {
  return arr(blocks).map((block) => {
    const data = rec(block);
    return [
      str(data.title),
      str(data.text),
      str(data.label),
      partsComparableText(data.parts),
      arr(data.rows).flatMap((row) => arr(row).map(cellComparableText)).join("\n"),
    ].filter(Boolean).join("\n");
  }).join("\n");
}

function normalizeComparableText(value) {
  return plainTextFromMd(value)
    .replace(/[（(]通则(\d+)[）)]/g, "通则$1")
    .replace(/[，。；：、,.；:()（）【】\[\]《》<>]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function comparableSegments(value) {
  return str(value)
    .split(/[\n。；;]/)
    .map((segment) => ({ raw: segment.trim(), normalized: normalizeComparableText(segment) }))
    .filter((segment) => segment.normalized.length >= 16);
}

function uncoveredComparableSegments(sourceText, targetText, minimumLength = 20) {
  const targetNormalized = normalizeComparableText(targetText);
  return comparableSegments(sourceText)
    .filter((segment) => segment.normalized.length >= minimumLength)
    .filter((segment) => !segmentCovered(segment, targetNormalized));
}

function looksLikeMdTableSegment(segment) {
  const raw = str(segment?.raw).trim();
  if (!raw.includes("|")) return false;
  const cells = splitMdTableRow(raw).filter((cell) => normalizeComparableText(cell).length > 0 || /\{(?:FIELD|PREFILL):/.test(cell));
  return cells.length >= 2;
}

function segmentCovered(segment, targetNormalized) {
  if (!segment.normalized) return true;
  if (targetNormalized.includes(segment.normalized)) return true;
  if (segment.normalized.length < 28) return false;
  let covered = 0;
  let total = 0;
  for (let index = 0; index <= segment.normalized.length - 24; index += 12) {
    total += 1;
    if (targetNormalized.includes(segment.normalized.slice(index, index + 24))) covered += 1;
  }
  return total > 0 && covered / total >= 0.55;
}

function textCoverageRatio(sourceText, targetText) {
  const segments = comparableSegments(sourceText);
  if (!segments.length) return 1;
  const targetNormalized = normalizeComparableText(targetText);
  const covered = segments.filter((segment) => segmentCovered(segment, targetNormalized)).length;
  return covered / segments.length;
}

function labelOrder(value) {
  const text = str(value);
  const labels = ["方法", "供试品溶液制备", "对照品溶液制备", "色谱条件", "色谱条件与系统适用性试验", "系统适用性要求", "测定法"];
  return labels
    .map((label) => ({ label, index: text.indexOf(label) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.label.replace("色谱条件与系统适用性试验", "色谱条件"));
}

function optionsFromMdHint(value) {
  return str(value)
    .split(/[\/、，,；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSimpleUnit(value) {
  const text = str(value).trim();
  return !!text && /^[A-Za-zμµ%％℃°·/0-9.-]+$/.test(text);
}

function stripSuggestedUnit(value, unit) {
  const text = str(value).trim();
  const cleanUnit = str(unit).trim();
  if (!cleanUnit) return text;
  return text.endsWith(cleanUnit) ? text.slice(0, -cleanUnit.length).trim() : text;
}

function mdFieldWidth(field) {
  const suggested = str(field.suggested_value);
  const hint = str(field.parameter_hint);
  const widthSeed = suggested || hint;
  const chars = Math.max(4, Math.min(18, Array.from(widthSeed).length || 4));
  return `${chars * 0.65}rem`;
}

function mdMarkerLayoutParts(marker, fieldKey) {
  const parsed = parseMdMarker(marker);
  if (!parsed) return [{ type: "text", text: marker }];
  if (parsed.kind === "PREFILL") return parsed.default_value ? [{ type: "text", text: parsed.default_value }] : [];

  const hint = str(parsed.parameter_hint).trim();
  const suggested = str(parsed.suggested_value).trim();
  const type = str(parsed.type).trim().toLowerCase();
  if (type === "date") return [{ type: "date", fieldKey }];
  if (type === "checkbox" || type === "radio") {
    const options = optionsFromMdHint(hint);
    return [{ type: "radio", fieldKey, options: options.length ? options : ["是", "否"] }];
  }
  if (type === "select") {
    const options = optionsFromMdHint(hint);
    return [{ type: "select", fieldKey, options: options.length ? options : undefined, underline: true }];
  }

  const simpleUnit = isSimpleUnit(hint) ? hint : "";
  const placeholder = simpleUnit ? stripSuggestedUnit(suggested, simpleUnit) : "";
  const trailingText = simpleUnit
    ? simpleUnit
    : hint || "";
  const visibleSuggested = suggested ? `（${suggested}）` : "";
  const line = compactObject({
    type: "line",
    fieldKey,
    field: simpleUnit ? undefined : hint || undefined,
    unit: simpleUnit || undefined,
    inputType: type === "number" ? "number" : undefined,
    width: mdFieldWidth(parsed),
    underline: true,
    placeholder: placeholder && !/[^\d.,:：～~ -]/.test(placeholder) ? placeholder : undefined,
  });
  return [
    line,
    ...(trailingText ? [{ type: "text", text: trailingText }] : []),
    ...(visibleSuggested ? [{ type: "text", text: visibleSuggested }] : []),
  ];
}

const mdInlineHeadingLabels = [
  "色谱条件与系统适用性试验",
  "色谱条件与系统适应性试验",
  "色谱条件、系统适应性要求",
  "系统适用性要求",
  "系统适应性要求",
  "系统适用性试验",
  "系统适用性溶液",
  "供试品溶液制备",
  "对照品溶液制备",
  "对照溶液制备",
  "色谱条件",
  "溶出条件",
  "测定法",
  "检查法",
].sort((a, b) => b.length - a.length);

const mdInlineHeadingPattern = new RegExp(`(?:\\*\\*)?(${mdInlineHeadingLabels.map(escapeRegExp).join("|")})(?:\\*\\*)?\\s*([：:]?)`, "g");

function lastPartIsBreak(parts) {
  return str(rec(parts[parts.length - 1]).type) === "br";
}

function pushMdTextPart(parts, text) {
  if (!text) return;
  parts.push({ type: "text", text });
}

function pushMdLiteralSegment(parts, segment) {
  let cursor = 0;
  mdInlineHeadingPattern.lastIndex = 0;
  for (const match of str(segment).matchAll(mdInlineHeadingPattern)) {
    const index = match.index ?? 0;
    const label = match[1];
    const colon = match[2] || "";
    const previousLiteral = segment.slice(cursor, index);
    if (label === "测定法" && !colon && /溶出度与释放度\s*$/.test(previousLiteral)) {
      continue;
    }
    if (index > cursor) pushMdTextPart(parts, previousLiteral);
    const visibleColon = colon || "：";
    if (parts.length && !lastPartIsBreak(parts)) parts.push({ type: "br" });
    parts.push({ type: "text", text: `${label}${visibleColon}`, bold: true });
    cursor = index + match[0].length;
  }
  if (cursor < str(segment).length) pushMdTextPart(parts, str(segment).slice(cursor));
}

function pushMdLiteralParts(parts, literal) {
  const chunks = str(literal).split(/(\r?\n+)/);
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (/\r?\n/.test(chunk)) {
      if (!lastPartIsBreak(parts)) parts.push({ type: "br" });
    } else {
      pushMdLiteralSegment(parts, chunk);
    }
  }
}

function mdInlineLayoutParts(value, keyPrefix) {
  value = normalizeMalformedMdMarkers(value);
  const parts = [];
  let cursor = 0;
  let fieldIndex = 0;
  for (const match of str(value).matchAll(/\{(?:FIELD|PREFILL):[^}]*\}/g)) {
    if (match.index > cursor) pushMdLiteralParts(parts, value.slice(cursor, match.index));
    fieldIndex += 1;
    parts.push(...mdMarkerLayoutParts(match[0], `${keyPrefix}/md_field_${fieldIndex}`));
    cursor = match.index + match[0].length;
  }
  if (cursor < str(value).length) pushMdLiteralParts(parts, str(value).slice(cursor));
  return parts;
}

function mdOperationParagraphBlock(section, stageKey, testKeyValue, previousBlock = {}) {
  const body = mdOperationBody(section, testKeyValue);
  if (!body) return null;
  return compactObject({
    type: "paragraph",
    label: "md_operation_method",
    sectionRole: "operation_text",
    sectionRef: "operation",
    sourceTemplateId: "original_md",
    sourceSection: str(section.sequence) || undefined,
    parts: mdInlineLayoutParts(body, `${stageKey}/${testKeyValue}/operation`),
    order: Number(previousBlock.order) || 136,
    moduleOrder: Number(previousBlock.moduleOrder) || 15,
  });
}

function normalizeOperationTextBlocks(layoutBlocks, stageKey, testKeyValue) {
  let index = 0;
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) !== "operation_text") return block;
    const text = str(data.text);
    if (!text || !/\{(?:FIELD|PREFILL):[^}]*\}/.test(text)) return block;
    index += 1;
    return {
      ...data,
      parts: mdInlineLayoutParts(text, `${stageKey}/${testKeyValue}/operation_text_${index}`),
    };
  });
}

function normalizeFriabilityOperationTextBlocks(layoutBlocks, testKeyValue) {
  if (testKeyValue !== "friability") return layoutBlocks;
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) !== "operation_text") return block;
    const text = str(data.text);
    if (!/脆碎度|0923|吹风机|圆筒|转动/.test(text)) return block;
    const normalized = text
      .replace(/\{FIELD:g（?6\.5g）?\}/g, "{FIELD:g（约6.5g）}")
      .replace(/转动\s*\{FIELD:次（100次）\}\s*。取出，同法除去粉末，精密称定。?/g, "转动100次。取出，同法除去粉末，精密称定{FIELD:g}。");
    if (normalized === text) return block;
    return {
      ...data,
      text: normalized,
    };
  });
}

const FRIABILITY_SAMPLE_FIRST_PRODUCTS = new Set([
  "berberine_tannate",
  "compound_rutin",
  "methimazole",
]);

function normalizeFriabilityOperationPartsBlocks(layoutBlocks, productKey, stageKey, testKeyValue) {
  if (testKeyValue !== "friability") return layoutBlocks;
  const sampleFirst = FRIABILITY_SAMPLE_FIRST_PRODUCTS.has(productKey);
  const normalizedText = sampleFirst
    ? "取供试品适量，照通则（0923）法测定，用吹风机吹去片剂脱落的粉末，精密称定{FIELD:g（约6.5g）}g（约6.5g），置圆筒中，转动100次。取出，同法除去粉末，精密称定{FIELD:g}g。"
    : "照通则（0923）法测定。取供试品适量，用吹风机吹去片剂脱落的粉末，精密称定{FIELD:g（约6.5g）}g（约6.5g），置圆筒中，转动100次。取出，同法除去粉末，精密称定{FIELD:g}g。";
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) !== "operation_text") return block;
    const text = str(data.text);
    if (!/吹风机|圆筒|转动100次|精密称定\{FIELD:g/.test(text)) return block;
    const prefix = `${stageKey}/${testKeyValue}/operation_text_1`;
    return {
      ...data,
      text: normalizedText,
      parts: [
        textPart(sampleFirst
          ? "取供试品适量，照通则（0923）法测定，用吹风机吹去片剂脱落的粉末，精密称定"
          : "照通则（0923）法测定。取供试品适量，用吹风机吹去片剂脱落的粉末，精密称定"),
        { type: "line", fieldKey: `${prefix}/md_field_1`, width: "2.6rem", underline: true },
        textPart("g（约6.5g），置圆筒中，转动100次。取出，同法除去粉末，精密称定"),
        { type: "line", fieldKey: `${prefix}/md_field_2`, width: "2.6rem", underline: true },
        textPart("g。"),
      ],
    };
  });
}

function disintegrationFieldKey(stageKey, name) {
  return `${stageKey}/disintegration/${str(name).replace(/[\\/]/g, "_")}`;
}

function disintegrationLinePart(stageKey, name, width = "3.2rem") {
  return {
    type: "line",
    fieldKey: disintegrationFieldKey(stageKey, name),
    width,
    underline: true,
  };
}

function normalizeDisintegrationOperationPartsBlocks(layoutBlocks, stageKey, testKeyValue) {
  if (testKeyValue !== "disintegration") return layoutBlocks;
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) !== "operation_text") return block;
    return {
      ...data,
      text: "取本品{FIELD:片（6片）}，分别置于含有{FIELD:ml（1000ml）}37℃±1℃的水中，照崩解时限检查法（通则0921），崩解时限为{FIELD:分钟}。",
      parts: [
        textPart("取本品"),
        disintegrationLinePart(stageKey, "取样片数"),
        textPart("片（6片），分别置于含有"),
        disintegrationLinePart(stageKey, "介质体积"),
        textPart("ml（1000ml）37℃±1℃的水中，照崩解时限检查法（通则0921），崩解时限为"),
        disintegrationLinePart(stageKey, "崩解时限"),
        textPart("分钟。"),
      ],
    };
  });
}

function normalizeHydrochlorothiazideIdentificationPartsBlocks(layoutBlocks, productKey, stageKey, testKeyValue) {
  if (productKey !== "hydrochlorothiazide" || stageKey !== "finished" || testKeyValue !== "identification") return layoutBlocks;
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) !== "paragraph" || str(data.label) !== "md_operation_method") return block;
    const parts = [];
    for (const part of arr(data.parts)) {
      const item = rec(part);
      if (str(item.type) === "text" && /__\s+___。$/.test(str(item.text))) {
        const leading = str(item.text).replace(/__\s+___。$/, "");
        if (leading) parts.push(textPart(leading));
        parts.push({ type: "line", fieldKey: "finished/identification/operation/md_field_8", width: "2.6rem", underline: true });
        parts.push(textPart(" "));
        parts.push({ type: "line", fieldKey: "finished/identification/operation/md_field_9", width: "2.6rem", underline: true });
        parts.push(textPart("。"));
        continue;
      }
      parts.push(part);
    }
    return { ...data, parts };
  });
}

function disintegrationMethodGroup(stageKey) {
  return {
    name: "崩解时限",
    source: "dedicated_layout",
    fields: [
      methodField("取样片数", disintegrationFieldKey(stageKey, "取样片数"), "fillable", "", { group: "崩解时限", type: "number", unit: "片" }),
      methodField("介质体积", disintegrationFieldKey(stageKey, "介质体积"), "fillable", "", { group: "崩解时限", type: "number", unit: "ml" }),
      methodField("崩解时限", disintegrationFieldKey(stageKey, "崩解时限"), "fillable", "", { group: "崩解时限", type: "number", unit: "分钟" }),
    ],
  };
}

function isEmptyStructuredOperationBlock(block) {
  const data = rec(block);
  const type = str(data.type);
  if (type !== "structured_operation_method" && type !== "related_substances_operation_method") return false;
  const text = str(data.text || data.rawText || data.title || data.label).trim();
  if (text) return false;
  if (arr(data.parts).length) return false;
  if (arr(data.rows).length) return false;
  if (arr(data.devices).length) return false;
  if (arr(data.materials).length) return false;
  if (arr(data.standards).length) return false;
  if (arr(data.items).length) return false;
  return true;
}

function removeEmptyStructuredOperationBlocks(layoutBlocks) {
  return arr(layoutBlocks).filter((block) => !isEmptyStructuredOperationBlock(block));
}

function isDeprecatedDisplayParamText(value) {
  const text = str(value).trim();
  if (!text) return false;
  if (text.includes("related_substances_numbered_rules")) return true;
  if (/\bprofile\s*=/.test(text)) return true;
  if (text.includes("含量测定项下记录的色谱图")) return true;
  return text.includes("取本品") && text.includes("目测") && text.includes("本品为");
}

function demoteDeprecatedDisplayParams(value) {
  if (Array.isArray(value)) return value.map((item) => demoteDeprecatedDisplayParams(item));
  if (!value || typeof value !== "object") return value;
  const data = { ...value };
  if (str(data.type) === "param") {
    const text = str(data.defaultValue || data.text || data.name).trim();
    return { type: "text", text };
  }
  return Object.fromEntries(Object.entries(data).map(([key, val]) => [key, demoteDeprecatedDisplayParams(val)]));
}

function stripDeprecatedParamValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripDeprecatedParamValues(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return isDeprecatedDisplayParamText(value) ? undefined : value;
  }
  return Object.fromEntries(Object.entries(value).flatMap(([key, val]) => {
    const nextValue = stripDeprecatedParamValues(val);
    return nextValue === undefined ? [] : [[key, nextValue]];
  }));
}

function removeFinalDedicatedDuplicateParagraphs(layoutBlocks, productKey, stageKey, testKeyValue) {
  const isRetentionTimeIdentification = (
    spironolactoneIdentificationApplies(productKey, stageKey, testKeyValue)
    || (productKey === "isosorbide_dinitrate" && stageKey === "finished" && testKeyValue === "identification")
  );
  if (!isRetentionTimeIdentification) return layoutBlocks;
  return arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
    return !(
      str(data.type) === "paragraph"
      && !str(data.label)
      && !str(data.sourceTemplateId)
      && /含量测定项下记录的色谱图.*保留时间.*一致/.test(partsText)
    );
  });
}

function operationParagraphIndex(layoutBlocks) {
  const titleIndex = arr(layoutBlocks).findIndex((block) => (
    (str(rec(block).sectionRole) === "operation" && str(rec(block).type) === "title")
    || /操作方法/.test(str(rec(block).title))
  ));
  if (titleIndex < 0) return -1;
  const nextIndex = titleIndex + 1;
  return str(rec(layoutBlocks[nextIndex]).type) === "paragraph" ? nextIndex : -1;
}

function shouldUseMdOperationParagraph(layoutBlocks, mdBlock, testKeyValue = "") {
  const mdText = partsComparableText(mdBlock.parts);
  const operationText = blocksComparableText(arr(layoutBlocks).filter((block) => (
    str(rec(block).type) === "operation_text"
    && str(rec(block).label) !== "md_operation_method"
  )));
  if (operationText && ["weight_variation", "fill_variation", "friability", "disintegration"].includes(testKeyValue)) return false;
  if (operationText && textCoverageRatio(mdText, operationText) >= 0.78) return false;
  const index = operationParagraphIndex(layoutBlocks);
  if (index < 0) return true;
  const currentText = partsComparableText(rec(layoutBlocks[index]).parts);
  const currentNormalized = normalizeComparableText(currentText);
  const mdNormalized = normalizeComparableText(mdText);
  if (!mdNormalized || currentNormalized === mdNormalized) return false;
  const currentOrder = labelOrder(currentText).join("|");
  const mdOrder = labelOrder(mdText).join("|");
  if (currentOrder && mdOrder && currentOrder !== mdOrder) return true;
  const mdLabels = labelOrder(mdText);
  if (mdLabels.some((label) => label !== "方法" && !currentText.includes(label))) return true;
  return textCoverageRatio(mdText, currentText) < 0.78;
}

function reconcileOperationLayoutBlocks(layoutBlocks, mdTest, stageKey, testKeyValue) {
  const section = mdOperationSection(mdTest);
  const mdBlock = mdOperationParagraphBlock(section, stageKey, testKeyValue, layoutBlocks[operationParagraphIndex(layoutBlocks)] ?? {});
  if (!mdBlock || !shouldUseMdOperationParagraph(layoutBlocks, mdBlock, testKeyValue)) return layoutBlocks;
  const nextBlocks = [...layoutBlocks];
  const index = operationParagraphIndex(nextBlocks);
  if (index >= 0) {
    nextBlocks[index] = mdBlock;
    return nextBlocks;
  }
  const titleIndex = nextBlocks.findIndex((block) => (
    (str(rec(block).sectionRole) === "operation" && str(rec(block).type) === "title")
    || /操作方法/.test(str(rec(block).title))
  ));
  nextBlocks.splice(titleIndex >= 0 ? titleIndex + 1 : nextBlocks.length, 0, mdBlock);
  return nextBlocks;
}

function measurementSection(mdTest) {
  return arr(mdTest?.sections).find((section) => /测定与计算/.test(str(section.title)));
}

function splitMdTableRow(line) {
  let cells = str(line).trim().split("|").map((cell) => cell.trim());
  if (cells[0] === "") cells = cells.slice(1);
  if (cells[cells.length - 1] === "") cells = cells.slice(0, -1);
  return cells;
}

function firstSystemSuitabilityTable(section) {
  const lines = sectionRawBody(section).split(/\r?\n/);
  let started = false;
  const rows = [];
  for (const line of lines) {
    const text = line.trim();
    if (!started) {
      if (!text.includes("|") || !/系统适用性/.test(text) || !/是否符合规定/.test(text)) continue;
      started = true;
    } else if (!text) {
      continue;
    } else if (!text.includes("|")) {
      break;
    }
    rows.push(splitMdTableRow(text));
  }
  if (rows.length < 2) return null;
  const header = rows[0];
  const itemIndex = header.findIndex((cell) => /项目/.test(cell));
  const resultIndex = header.findIndex((cell) => /结果/.test(cell));
  const judgmentIndex = header.findIndex((cell) => /是否符合规定/.test(cell));
  if (itemIndex < 0 || judgmentIndex < 0) return null;
  const columnIndexes = [itemIndex, resultIndex, judgmentIndex].filter((index, pos, self) => index >= 0 && self.indexOf(index) === pos);
  return {
    groupLabel: header[0] || "系统适用性",
    header,
    columnIndexes,
    dataRows: rows.slice(1),
  };
}

function mdTableCell(rawText, keyPrefix, extra = {}) {
  const parts = mdInlineLayoutParts(rawText, keyPrefix);
  const textOnly = parts.length && parts.every((part) => str(rec(part).type) === "text");
  return compactObject({
    rawText: textOnly ? parts.map((part) => str(part.text)).join("") : "",
    parts: textOnly ? [] : parts,
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    ...extra,
  });
}

function mdTableRowsFromRawLines(section) {
  const lines = sectionRawBody(section).split(/\r?\n/);
  const tables = [];
  let current = null;
  let pendingTitle = "";

  function finish() {
    if (current && current.rows.length) tables.push(current);
    current = null;
  }

  for (const line of lines) {
    const text = line.trim();
    const inlineHeading = text.match(/^(\d+(?:\.\d+){2,})\s+(.+)$/);
    if (inlineHeading && !text.includes("|")) {
      finish();
      pendingTitle = inlineHeading[2].trim();
      continue;
    }
    if (!text) continue;
    if (!text.includes("|")) {
      finish();
      if (!/[。；;]$/.test(text) && text.length <= 24) pendingTitle = text;
      continue;
    }
    const row = splitMdTableRow(text);
    const hasContent = row.some((cell) => normalizeComparableText(cell).length > 0 || /\{(?:FIELD|PREFILL):/.test(cell));
    if (!hasContent) continue;
    if (!current) {
      current = {
        title: pendingTitle || str(section.title),
        sourceSection: str(section.sequence),
        rows: [],
      };
      pendingTitle = "";
    }
    current.rows.push(row);
  }
  finish();
  return tables.filter((table) => (
    table.rows.length > 0
    && table.rows.some((row) => row.length >= 2)
    && normalizeComparableText(table.rows.flat().join("")).length >= 18
  ));
}

function tableComparableText(table) {
  return arr(table.rows).map((row) => arr(row).join(" ")).join("\n");
}

function tableCoveredByLayout(table, layoutBlocks) {
  const tableText = tableComparableText(table);
  const tableNormalized = normalizeComparableText(tableText);
  if (!tableNormalized) return true;
  const layoutText = blocksComparableText(arr(layoutBlocks).filter((block) => str(rec(block).type) === "table"));
  const layoutNormalized = normalizeComparableText(layoutText);
  if (layoutNormalized.includes(tableNormalized)) return true;
  return textCoverageRatio(tableText, layoutText) >= 0.88;
}

function tableLabel(table, index) {
  const title = str(table.title).replace(/^[-—:：\s]+|[-—:：\s]+$/g, "");
  if (title && !/操作方法|测定与计算/.test(title)) return title;
  const firstCell = arr(arr(table.rows)[0])[0];
  const label = plainTextFromMd(firstCell).replace(/[|]/g, "").trim();
  return label || `MD补充表格${index}`;
}

function dedicatedLayoutCoversMdTable(table, layoutBlocks, stageKey, testKeyValue, index) {
  const label = tableLabel(table, index);
  const layoutLabels = new Set(arr(layoutBlocks).map((block) => str(rec(block).label)));
  if (
    testKeyValue === "friability"
    && label === "第一次测试"
    && layoutLabels.has("脆碎度三次减失重量计算")
  ) return true;
  if (
    (testKeyValue === "fill_variation" || testKeyValue === "weight_variation")
    && /^20[粒片]总重[（(]g[）)]$/.test(label)
    && arr(layoutBlocks).some((block) => /20[粒片](?:装量|重量)差异/.test(str(rec(block).label)))
  ) return true;
  return false;
}

function mdFallbackTableBlock(table, stageKey, testKeyValue, tableIndex, order) {
  const prefix = `${stageKey}/${testKeyValue}/md_table_${tableIndex}`;
  return compactObject({
    type: "table",
    label: tableLabel(table, tableIndex),
    sectionRef: "operation",
    sourceTemplateId: "original_md",
    sourceSection: table.sourceSection || undefined,
    rows: table.rows.map((row, rowIndex) => row.map((cell, cellIndex) => (
      mdTableCell(cell, `${prefix}/r${rowIndex + 1}_c${cellIndex + 1}`, { header: rowIndex === 0 && !/\{FIELD:/.test(row.join("")) ? true : undefined })
    ))),
    order,
  });
}

function mdHeaderCell(rawText, extra = {}) {
  return compactObject({
    rawText: str(rawText),
    parts: [],
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    header: true,
    ...extra,
  });
}

function systemSuitabilityTableBlock(mdTest, stageKey, testKeyValue, previousBlock = {}) {
  const section = measurementSection(mdTest);
  const table = firstSystemSuitabilityTable(section);
  if (!table) return null;
  const prefix = `${stageKey}/${testKeyValue}/system_suitability`;
  return compactObject({
    type: "table",
    label: "系统适用性",
    sectionRef: "operation",
    sourceTemplateId: "original_md",
    sourceSection: str(section.sequence) || undefined,
    rows: [
      [
        mdHeaderCell(table.groupLabel, { rowspan: table.dataRows.length + 1, header: false, align: "center", width: "20%" }),
        ...table.columnIndexes.map((index) => mdHeaderCell(table.header[index], { align: "center" })),
      ],
      ...table.dataRows.map((row, rowIndex) => (
        table.columnIndexes.map((index, colIndex) => (
          mdTableCell(row[index] || "", `${prefix}/r${rowIndex + 1}_c${colIndex + 1}`, { align: colIndex === table.columnIndexes.length - 1 ? "center" : undefined })
        ))
      )),
    ],
    order: Number(previousBlock.order) || 150.5,
    moduleOrder: Number(previousBlock.moduleOrder) || undefined,
  });
}

function hasSystemSuitabilityTable(layoutBlocks) {
  return arr(layoutBlocks).some((block) => (
    str(rec(block).type) === "table"
    && /系统适用性/.test(str(rec(block).label || rec(block).title))
  ));
}

function measurementTitleIndex(layoutBlocks) {
  return arr(layoutBlocks).findIndex((block) => (
    str(rec(block).type) === "title"
    && /测定与计算/.test(str(rec(block).title || rec(block).text))
  ));
}

function referenceCalculationTitleIndex(layoutBlocks) {
  return arr(layoutBlocks).findIndex((block) => (
    str(rec(block).type) === "title"
    && /对照品计算/.test(str(rec(block).title || rec(block).text))
  ));
}

function reconcileMeasurementLayoutBlocks(layoutBlocks, mdTest, stageKey, testKeyValue) {
  if (hasSystemSuitabilityTable(layoutBlocks)) return layoutBlocks;
  const insertAfter = measurementTitleIndex(layoutBlocks);
  const insertBefore = referenceCalculationTitleIndex(layoutBlocks);
  const neighbor = insertBefore >= 0 ? layoutBlocks[insertBefore] : layoutBlocks[insertAfter + 1];
  const block = systemSuitabilityTableBlock(mdTest, stageKey, testKeyValue, neighbor ?? {});
  if (!block) return layoutBlocks;
  const nextBlocks = [...layoutBlocks];
  if (insertAfter >= 0) {
    nextBlocks.splice(insertAfter + 1, 0, block);
  } else if (insertBefore >= 0) {
    nextBlocks.splice(insertBefore, 0, block);
  } else {
    nextBlocks.push(block);
  }
  return nextBlocks;
}

function sectionsWithMethodContent(mdTest) {
  return arr(mdTest?.sections).filter((section) => /操作方法|测定与计算|测定法|检查法/.test(str(section.title)));
}

function postMethodBlockIndex(layoutBlocks) {
  return arr(layoutBlocks).findIndex((block) => (
    ["standard", "abnormal", "cleanup", "conclusion", "attachment"].includes(str(rec(block).sectionRole))
    || ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion", "attachment_upload"].includes(str(rec(block).type))
  ));
}

function reconcileMissingMdTables(layoutBlocks, mdTest, stageKey, testKeyValue) {
  const fallbackTables = sectionsWithMethodContent(mdTest)
    .flatMap((section) => mdTableRowsFromRawLines(section))
    .filter((table, index) => (
      !dedicatedLayoutCoversMdTable(table, layoutBlocks, stageKey, testKeyValue, index + 1)
      && !tableCoveredByLayout(table, layoutBlocks)
    ));
  if (!fallbackTables.length) return layoutBlocks;
  const nextBlocks = [...layoutBlocks];
  const insertAt = postMethodBlockIndex(nextBlocks);
  const blocks = fallbackTables.map((table, index) => mdFallbackTableBlock(table, stageKey, testKeyValue, index + 1, 155 + index / 100));
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...blocks);
  return nextBlocks;
}

function mdFallbackParagraphBlock(section, missingSegments, stageKey, testKeyValue, index) {
  const body = missingSegments
    .map((segment) => segment.raw)
    .filter(Boolean)
    .join("。");
  if (!normalizeComparableText(body)) return null;
  return compactObject({
    type: "paragraph",
    label: `md_supplement_paragraph_${index}`,
    sectionRole: "md_supplement",
    sectionRef: "operation",
    sourceTemplateId: "original_md",
    sourceSection: str(section.sequence) || undefined,
    parts: mdInlineLayoutParts(body, `${stageKey}/${testKeyValue}/md_supplement_${index}`),
    order: 156 + index / 100,
  });
}

function reconcileMissingMdParagraphs(layoutBlocks, mdTest, stageKey, testKeyValue) {
  let currentText = blocksComparableText(layoutBlocks);
  const blocks = [];
  const hasDedicatedOperationText = arr(layoutBlocks).some((block) => str(rec(block).type) === "operation_text");
  const fixedCheckUsesDedicatedOperation = hasDedicatedOperationText
    && ["weight_variation", "fill_variation", "friability", "disintegration"].includes(testKeyValue);
  for (const section of sectionsWithMethodContent(mdTest)) {
    const sectionSequence = str(section.sequence);
    let sourceBody = sectionRawBody(section);
    if (fixedCheckUsesDedicatedOperation && /操作方法|测定法|检查法/.test(str(section.title))) continue;
    const alreadyHasMdOperation = /操作方法|测定法|检查法/.test(str(section.title))
      && arr(layoutBlocks).some((block) => (
        str(rec(block).label) === "md_operation_method"
        && str(rec(block).sourceSection) === sectionSequence
      ));
    if (alreadyHasMdOperation) {
      sourceBody = inlineSubsectionTail(sourceBody, sectionSequence);
      if (!sourceBody) continue;
    }
    if (testKeyValue === "moisture") {
      sourceBody = stripMoistureMeasurementTable(sourceBody);
      if (!sourceBody) continue;
    }
    sourceBody = stripOperationMarkdownTableTail(sourceBody);
    sourceBody = stripVisibleMarkdownTableMarkers(sourceBody);
    sourceBody = stripDanglingMeasurementHeading(sourceBody);
    const missing = uncoveredComparableSegments(sourceBody, currentText, 20)
      .filter((segment) => !/^[-|:]+$/.test(segment.raw.replace(/\s/g, "")))
      .filter((segment) => !segment.raw.includes("|"))
      .filter((segment) => !looksLikeMdTableSegment(segment));
    if (!missing.length) continue;
    const block = mdFallbackParagraphBlock(section, missing, stageKey, testKeyValue, blocks.length + 1);
    if (!block) continue;
    blocks.push(block);
    currentText += `\n${blocksComparableText([block])}`;
  }
  if (!blocks.length) return layoutBlocks;
  const nextBlocks = [...layoutBlocks];
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...blocks);
  return nextBlocks;
}

function textPart(text, extra = {}) {
  return { type: "text", text, ...extra };
}

const DIAMMONIUM_INTERMEDIATE_CONTENT_PREFIX = "intermediate/content/diammonium";
const DIAMMONIUM_PACKAGING_DISSOLUTION_PREFIX = "packaging/dissolution/diammonium";

function diammoniumContentPrefix(stageKey) {
  return `${str(stageKey) || "intermediate"}/content/diammonium`;
}

function diammoniumFieldKey(name) {
  return `${diammoniumContentPrefix("intermediate")}/${str(name).replace(/[\\/]/g, "_")}`;
}

function diammoniumDissolutionFieldKey(name) {
  return `${DIAMMONIUM_PACKAGING_DISSOLUTION_PREFIX}/${str(name).replace(/[\\/]/g, "_")}`;
}

function inputPart(field, options = {}) {
  return compactObject({
    type: "field",
    field,
    fieldKey: str(options.fieldKey) || undefined,
    width: str(options.width) || "5em",
    readonlyDisplay: options.readonlyDisplay === true,
  });
}

function methodField(field, fieldKey, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name: field,
    group: str(extra.group) || "专用字段",
    attr,
    type: str(extra.type) || "number",
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: fieldKey,
  });
}

function dInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: diammoniumFieldKey(field) });
}

function ddInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: diammoniumDissolutionFieldKey(field) });
}

function moistureFieldKey(stageKey, testKeyValue, name) {
  return `${stageKey}/${testKeyValue}/moisture/${str(name).replace(/[\\/]/g, "_")}`;
}

function moistureMethodField(stageKey, testKeyValue, name, attr = "fillable", formula = "", unit = "%") {
  return compactObject({
    name,
    group: "水分",
    type: "number",
    attr,
    unit,
    formula: formula || undefined,
    field_key: moistureFieldKey(stageKey, testKeyValue, name),
  });
}

function moistureMethodGroup(stageKey, testKeyValue) {
  return {
    name: "水分",
    source: "physical/moisture",
    fields: [
      moistureMethodField(stageKey, testKeyValue, "称样1", "fillable", "", "g"),
      moistureMethodField(stageKey, testKeyValue, "水分1"),
      moistureMethodField(stageKey, testKeyValue, "称样2", "fillable", "", "g"),
      moistureMethodField(stageKey, testKeyValue, "水分2"),
      moistureMethodField(stageKey, testKeyValue, "平均水分", "calculated", "(水分1 + 水分2) / 2"),
      moistureMethodField(stageKey, testKeyValue, "RD", "calculated", "ABS(水分1 - 水分2) / 平均水分 * 100"),
    ],
  };
}

function reconcileMoistureLayoutBlocks(layoutBlocks, stageKey, testKeyValue) {
  if (testKeyValue !== "moisture") return layoutBlocks;
  const moistureFields = new Set(["称样1", "水分1", "称样2", "水分2", "平均水分", "RD"]);
  const calculatedFields = new Set(["平均水分", "RD"]);
  return arr(layoutBlocks).map((block) => {
    if (str(rec(block).label) !== "水分称样") return block;
    return {
      ...block,
      rows: arr(block.rows).map((row) => arr(row).map((cell) => ({
        ...cell,
        parts: arr(cell.parts).map((part) => {
          const data = rec(part);
          const field = str(data.field || data.name);
          if (!moistureFields.has(field)) return part;
          return {
            ...part,
            fieldKey: moistureFieldKey(stageKey, testKeyValue, field),
            readonlyDisplay: calculatedFields.has(field) ? true : data.readonlyDisplay,
          };
        }),
      }))),
    };
  });
}

function azithromycinFinishedMoistureApplies(productKey, stageKey, testKeyValue) {
  return productKey === "azithromycin" && stageKey === "finished" && testKeyValue === "moisture";
}

function azithromycinFinishedMoistureFieldKey(name) {
  return `finished/moisture/azithromycin_kf/${str(name).replace(/[\\/]/g, "_")}`;
}

function azithromycinFinishedMoistureInput(name, options = {}) {
  return inputPart(name, {
    ...options,
    fieldKey: azithromycinFinishedMoistureFieldKey(name),
    width: str(options.width) || "4.5em",
  });
}

function azithromycinFinishedMoistureRadio(name) {
  return {
    type: "radio",
    fieldKey: azithromycinFinishedMoistureFieldKey(name),
    options: ["是", "否"],
  };
}

function azithromycinFinishedMoistureOperationBlocks() {
  return [
    {
      type: "paragraph",
      label: "阿奇霉素胶囊水分操作方法",
      sectionRole: "operation_text",
      sectionRef: "operation",
      sourceTemplateId: "dedicated/azithromycin_finished_moisture",
      parts: [textPart("照水分测定法（通则0832第一法1）测定。")],
      order: 136,
    },
    {
      type: "paragraph",
      label: "阿奇霉素胶囊水分标定说明",
      sectionRole: "operation_text",
      sectionRef: "operation",
      sourceTemplateId: "dedicated/azithromycin_finished_moisture",
      parts: [
        textPart("2.3.3.1 标定", { bold: true }),
        textPart(" 精密称取纯化水约10～30mg，精密称定，注入水分测定仪中，仪器自动标定。连续标定3次，以平均值作为费休氏液校正值。校正结果如下：（计算公式：f=m/v）。"),
      ],
      order: 137,
    },
    azithromycinFinishedMoistureCalibrationTable(),
    {
      type: "paragraph",
      label: "阿奇霉素胶囊水分供试品测定说明",
      sectionRole: "operation_text",
      sectionRef: "operation",
      sourceTemplateId: "dedicated/azithromycin_finished_moisture",
      parts: [
        textPart("2.3.3.2 供试品水分测定", { bold: true }),
        textPart(" 取10ml干燥量瓶，分别编号，精密称取供试品（约相当于阿奇霉素0.25g），分别置上述10ml量瓶中；精密称取量瓶与供试品重量，分别迅速加至水分测定仪滴定杯中，仪器自动测定，再精密称取空瓶重量，计算供试品重量。记录每次测定结果，计算3次结果平均值。[计算公式：水分=（v×f/1000m）×100%]"),
      ],
      order: 145,
    },
    azithromycinFinishedMoistureSampleTable(),
  ];
}

function azithromycinFinishedMoistureCalibrationTable() {
  const rows = [[
    contentCell("序号", { width: "6%", align: "center" }),
    contentCell("水+取样针（mg）", { width: "12%", align: "center" }),
    contentCell("取样针（mg）", { width: "12%", align: "center" }),
    contentCell("水（mg）", { width: "12%", align: "center" }),
    contentCell("V（ml）", { width: "12%", align: "center" }),
    contentCell("f", { width: "12%", align: "center" }),
    contentCell("平均值（mg/ml）", { width: "13%", align: "center" }),
    contentCell("标定值的平均值±1.0%", { width: "17%", align: "center" }),
    contentCell("标定结果符合规定", { width: "14%", align: "center" }),
  ]];
  for (let index = 1; index <= 3; index += 1) {
    const row = [
      contentCell(String(index), { align: "center" }),
      contentCell([azithromycinFinishedMoistureInput(`标定${index}-水加取样针`)]),
      contentCell([azithromycinFinishedMoistureInput(`标定${index}-取样针`)]),
      contentCell([azithromycinFinishedMoistureInput(`标定${index}-水`, { readonlyDisplay: true })]),
      contentCell([azithromycinFinishedMoistureInput(`标定${index}-V`)]),
      contentCell([azithromycinFinishedMoistureInput(`标定${index}-f`, { readonlyDisplay: true })]),
    ];
    if (index === 1) {
      row.push(contentCell([azithromycinFinishedMoistureInput("标定平均f", { readonlyDisplay: true })], { rowspan: 3 }));
      row.push(contentCell([
        azithromycinFinishedMoistureInput("标定下限", { readonlyDisplay: true, width: "4em" }),
        textPart(" ～ "),
        azithromycinFinishedMoistureInput("标定上限", { readonlyDisplay: true, width: "4em" }),
      ], { rowspan: 3 }));
    }
    row.push(contentCell([azithromycinFinishedMoistureRadio(`标定${index}-结果`)], { align: "center" }));
    rows.push(row);
  }
  return {
    type: "table",
    label: "阿奇霉素胶囊水分标定",
    sourceTemplateId: "dedicated/azithromycin_finished_moisture",
    columnWidths: ["6%", "12%", "12%", "12%", "12%", "12%", "13%", "17%", "14%"],
    rows,
    order: 140,
  };
}

function azithromycinFinishedMoistureSampleTable() {
  const rows = [[
    contentCell("序号", { width: "6%", align: "center" }),
    contentCell("样+量瓶（g）", { width: "14%", align: "center" }),
    contentCell("量瓶（g）", { width: "14%", align: "center" }),
    contentCell("样（g）", { width: "14%", align: "center" }),
    contentCell("V（ml）", { width: "14%", align: "center" }),
    contentCell("水分（%）", { width: "14%", align: "center" }),
    contentCell("平均值（%）", { width: "12%", align: "center" }),
    contentCell("RD（%）（应≤8.0%）", { width: "12%", align: "center" }),
  ]];
  for (let index = 1; index <= 3; index += 1) {
    const row = [
      contentCell(String(index), { align: "center" }),
      contentCell([azithromycinFinishedMoistureInput(`样${index}-样加量瓶`)]),
      contentCell([azithromycinFinishedMoistureInput(`样${index}-量瓶`)]),
      contentCell([azithromycinFinishedMoistureInput(`样${index}-净重`, { readonlyDisplay: true })]),
      contentCell([azithromycinFinishedMoistureInput(`样${index}-V`)]),
      contentCell([azithromycinFinishedMoistureInput(`样${index}-水分`, { readonlyDisplay: true }), textPart("%")]),
    ];
    if (index === 1) {
      row.push(contentCell([azithromycinFinishedMoistureInput("平均水分", { readonlyDisplay: true }), textPart("%")], { rowspan: 3 }));
      row.push(contentCell([azithromycinFinishedMoistureInput("RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 3 }));
    }
    rows.push(row);
  }
  return {
    type: "table",
    label: "阿奇霉素胶囊水分测定与计算",
    sourceTemplateId: "dedicated/azithromycin_finished_moisture",
    columnWidths: ["6%", "14%", "14%", "14%", "14%", "14%", "12%", "12%"],
    rows,
    order: 150,
  };
}

function azithromycinFinishedMoistureLayoutBlocks(layoutBlocks) {
  const insertAt = arr(layoutBlocks).findIndex((block) => str(rec(block).type) === "standard_text" || str(rec(block).sectionRole) === "standard");
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    return !(
      label === "md_operation_method"
      || label === "水分称样"
      || /^md_supplement_paragraph_/.test(label)
      || /阿奇霉素胶囊水分/.test(label)
    );
  });
  const position = insertAt >= 0 ? Math.min(insertAt, nextBlocks.length) : postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(position >= 0 ? position : nextBlocks.length, 0, ...azithromycinFinishedMoistureOperationBlocks());
  return nextBlocks;
}

function azithromycinFinishedMoistureMethodGroup() {
  const fields = [];
  const add = (name, attr = "fillable", formula = "", extra = {}) => fields.push(methodField(
    name,
    azithromycinFinishedMoistureFieldKey(name),
    attr,
    formula,
    { group: "阿奇霉素胶囊水分", ...extra },
  ));
  for (let index = 1; index <= 3; index += 1) {
    add(`标定${index}-水加取样针`, "fillable", "", { unit: "mg" });
    add(`标定${index}-取样针`, "fillable", "", { unit: "mg" });
    add(`标定${index}-水`, "calculated", `标定${index}-水加取样针 - 标定${index}-取样针`, { unit: "mg" });
    add(`标定${index}-V`, "fillable", "", { unit: "ml" });
    add(`标定${index}-f`, "calculated", `标定${index}-水 / 标定${index}-V`, { unit: "mg/ml" });
    add(`标定${index}-结果`, "fillable", "", { type: "select" });
  }
  add("标定平均f", "calculated", "(标定1-f + 标定2-f + 标定3-f) / 3", { unit: "mg/ml" });
  add("标定下限", "calculated", "标定平均f * 0.99", { unit: "mg/ml" });
  add("标定上限", "calculated", "标定平均f * 1.01", { unit: "mg/ml" });
  for (let index = 1; index <= 3; index += 1) {
    add(`样${index}-样加量瓶`, "fillable", "", { unit: "g" });
    add(`样${index}-量瓶`, "fillable", "", { unit: "g" });
    add(`样${index}-净重`, "calculated", `样${index}-样加量瓶 - 样${index}-量瓶`, { unit: "g" });
    add(`样${index}-V`, "fillable", "", { unit: "ml" });
    add(`样${index}-水分`, "calculated", `(样${index}-V * 标定平均f / (1000 * 样${index}-净重)) * 100`, { unit: "%" });
  }
  add("平均水分", "calculated", "(样1-水分 + 样2-水分 + 样3-水分) / 3", { unit: "%" });
  add("RD", "calculated", "(MAX(样1-水分, 样2-水分, 样3-水分) - MIN(样1-水分, 样2-水分, 样3-水分)) / 平均水分 * 100", { unit: "%" });
  return {
    name: "阿奇霉素胶囊水分",
    source: "dedicated_layout",
    fields,
  };
}

function contentCell(partsOrText, options = {}) {
  const parts = Array.isArray(partsOrText) ? partsOrText : [];
  return compactObject({
    rawText: typeof partsOrText === "string" ? partsOrText : "",
    parts,
    colspan: Number(options.colspan) || 1,
    rowspan: Number(options.rowspan) || 1,
    isEmpty: false,
    width: str(options.width) || undefined,
    align: str(options.align) || undefined,
    bold: options.bold === true,
  });
}

function diammoniumIntermediateContentWeighingTable() {
  return {
    type: "table",
    label: "甘草酸二铵中间体含量称重",
    sourceTemplateId: "dedicated/diammonium_glycyrrhizinate_intermediate_content",
    columnWidths: ["14%", "14%", "18%", "18%", "18%", "18%"],
    rows: [
      [
        contentCell("样品称样", { rowspan: 3, width: "15%" }),
        contentCell("理论粒重（g）", { width: "16%" }),
        contentCell([
          dInput("投料量"),
          textPart(" / ["),
          dInput("批量"),
          textPart("（万粒）×10] = "),
          dInput("理论粒重", { readonlyDisplay: true }),
          textPart(" g/粒"),
        ], { colspan: 4 }),
      ],
      [
        contentCell("样 1"),
        contentCell([
          dInput("样1-毛重"),
          textPart(" - "),
          dInput("样1-皮重"),
          textPart(" = "),
          dInput("样1-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 4 }),
      ],
      [
        contentCell("样 2"),
        contentCell([
          dInput("样2-毛重"),
          textPart(" - "),
          dInput("样2-皮重"),
          textPart(" = "),
          dInput("样2-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 4 }),
      ],
    ],
    order: 140,
  };
}

function diammoniumPackagingContentWeighingTable() {
  return {
    type: "table",
    label: "甘草酸二铵中间体含量称重",
    sourceTemplateId: "dedicated/diammonium_glycyrrhizinate_intermediate_content",
    columnWidths: ["14%", "14%", "18%", "18%", "18%", "18%"],
    rows: [
      [
        contentCell("样品称样", { rowspan: 3, width: "15%" }),
        contentCell("粒重（g）", { width: "16%" }),
        contentCell([
          textPart("（"),
          dInput("20粒总毛重"),
          textPart(" - "),
          dInput("20粒总皮重"),
          textPart("） ÷ 20 = "),
          dInput("平均粒重", { readonlyDisplay: true }),
          textPart(" g/粒"),
        ], { colspan: 4 }),
      ],
      [
        contentCell("样 1"),
        contentCell([
          dInput("样1-毛重"),
          textPart(" - "),
          dInput("样1-皮重"),
          textPart(" = "),
          dInput("样1-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 4 }),
      ],
      [
        contentCell("样 2"),
        contentCell([
          dInput("样2-毛重"),
          textPart(" - "),
          dInput("样2-皮重"),
          textPart(" = "),
          dInput("样2-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 4 }),
      ],
    ],
    order: 140,
  };
}

function diammoniumMeasurementTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label,
    sourceTemplateId: "dedicated/diammonium_glycyrrhizinate_intermediate_content",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function diammoniumIntermediateContentMeasurementBlocks() {
  return [
    diammoniumMeasurementTable("甘草酸二铵中间体含量测定与计算", ["13%", "21.75%", "21.75%", "21.75%", "21.75%"], [
      [contentCell("对照品计算", { colspan: 5, bold: true })],
      [
        contentCell([textPart("对照含量:"), dInput("对照含量"), textPart("%")], { rowspan: 2 }),
        contentCell([textPart("对照 1："), dInput("对照1-称量"), textPart("mg")]),
        contentCell([
          textPart("m="),
          dInput("对照1-毛重"),
          textPart(" - "),
          dInput("对照1-皮重"),
          textPart(" = "),
          dInput("对照1-净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell([textPart("对照 2："), dInput("对照2-称量"), textPart("mg")]),
        contentCell([
          textPart("m="),
          dInput("对照2-毛重"),
          textPart(" - "),
          dInput("对照2-皮重"),
          textPart(" = "),
          dInput("对照2-净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 8, width: "13%" }),
        contentCell([textPart("对照波长："), dInput("对照波长"), textPart("nm")], { colspan: 4 }),
      ],
      [
        contentCell("空白"),
        contentCell([textPart("OD:"), dInput("对照空白OD")]),
        contentCell("空白溶剂"),
        contentCell([textPart("OD:"), dInput("空白溶剂OD")]),
      ],
      [
        contentCell("对照"),
        contentCell("OD/mg"),
        contentCell("平均（OD/mg）"),
        contentCell("RD≤1.0%"),
      ],
      [
        contentCell([textPart("OD1:"), dInput("对照1-OD")]),
        contentCell([dInput("对照1-OD/mg", { readonlyDisplay: true })]),
        contentCell([dInput("平均-OD/mg", { readonlyDisplay: true })], { rowspan: 2 }),
        contentCell([dInput("对照RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell([textPart("OD2:"), dInput("对照2-OD")]),
        contentCell([dInput("对照2-OD/mg", { readonlyDisplay: true })]),
      ],
      [
        contentCell([textPart("样品波长："), dInput("样品波长"), textPart("nm")], { colspan: 4 }),
      ],
      [
        contentCell("空白"),
        contentCell([textPart("OD:"), dInput("样品空白OD")]),
        contentCell("空白溶剂"),
        contentCell([textPart("OD:"), dInput("样品空白溶剂OD")]),
      ],
      [
        contentCell([textPart("OD1:"), dInput("样1-OD")], { colspan: 2 }),
        contentCell([textPart("OD2:"), dInput("样2-OD")], { colspan: 2 }),
      ],
      [
        contentCell("计算", { rowspan: 4 }),
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量=CX×A×OD", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×对%×25×1.898×平均粒重]×100%/（OD对×10×50×M样重）", { colspan: 3, align: "left" }),
      ],
      [
        contentCell([textPart("样 1="), dInput("样1-净重", { readonlyDisplay: true }), textPart(" g")]),
        contentCell([textPart("样 2="), dInput("样2-净重", { readonlyDisplay: true }), textPart(" g")]),
        contentCell("平均含量（%）"),
        contentCell("RD 应≤2.0%"),
      ],
      [
        contentCell([textPart("含量 1="), dInput("样1-含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("含量 2="), dInput("样2-含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("平均:"), dInput("平均含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("RD="), dInput("RD", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function diammoniumStageLabel(stageKey) {
  if (stageKey === "packaging") return "待包装品";
  if (stageKey === "finished") return "成品";
  return "中间体";
}

function stageDiammoniumContentValue(value, stageKey) {
  if (typeof value !== "string") return value;
  const stageLabel = diammoniumStageLabel(stageKey);
  return value
    .replaceAll(DIAMMONIUM_INTERMEDIATE_CONTENT_PREFIX, diammoniumContentPrefix(stageKey))
    .replaceAll("diammonium_glycyrrhizinate_intermediate_content", `diammonium_glycyrrhizinate_${stageKey}_content`)
    .replaceAll("甘草酸二铵中间体含量", `甘草酸二铵${stageLabel}含量`);
}

function stageDiammoniumContentObject(value, stageKey) {
  if (Array.isArray(value)) return value.map((item) => stageDiammoniumContentObject(item, stageKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, stageDiammoniumContentObject(val, stageKey)]));
  }
  return stageDiammoniumContentValue(value, stageKey);
}

function diammoniumContentLayoutBlocks(stageKey) {
  const weighing = stageKey === "intermediate"
    ? diammoniumIntermediateContentWeighingTable()
    : diammoniumPackagingContentWeighingTable();
  return stageDiammoniumContentObject([
    weighing,
    ...diammoniumIntermediateContentMeasurementBlocks(),
  ], stageKey);
}

function diammoniumIdentificationFieldKey(name) {
  return `finished/identification/diammonium_glycyrrhizinate/${str(name).replace(/[\\/]/g, "_")}`;
}

function diammoniumIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: diammoniumIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function diammoniumIdentificationOperationBlock() {
  const input = diammoniumIdentificationInput;
  return {
    type: "paragraph",
    label: "甘草酸二铵胶囊成品鉴别操作方法",
    sourceTemplateId: "dedicated/diammonium_glycyrrhizinate_finished_identification",
    order: 136,
    moduleOrder: 20,
    parts: [
      textPart("2.2.4.1", { bold: true }),
      textPart(" 取本品的内容物适量"),
      input("2.2.4.1-内容物取样量", { width: "6em" }),
      textPart("g(约相当于甘草酸二铵0.5 g)，加80%乙醇"),
      input("2.2.4.1-80%乙醇体积", { width: "5em" }),
      textPart("mL（25ml），加热使甘草酸二铵溶解，滤过，滤液蒸干，残渣加稀盐酸"),
      input("2.2.4.1-稀盐酸体积", { width: "4.4em" }),
      textPart("ml（4 ml）与水"),
      input("2.2.4.1-水体积", { width: "4.4em" }),
      textPart("ml（6ml）煮沸"),
      input("2.2.4.1-煮沸时间", { width: "4.4em" }),
      textPart("min(10分钟)，放冷，滤过，滤液备用。取沉淀用水洗涤至洗液呈中性，置105℃干燥"),
      input("2.2.4.1-干燥时间", { width: "4.4em" }),
      textPart("小时(1小时)，加乙醇"),
      input("2.2.4.1-乙醇体积", { width: "4.4em" }),
      textPart("ml(10ml)使溶解，取乙醇溶液"),
      input("2.2.4.1-乙醇溶液体积", { width: "4.4em" }),
      textPart("ml(1ml)，加10%2.6-二叔丁基对苯甲酚乙醇溶液"),
      input("2.2.4.1-BHT乙醇溶液体积", { width: "4.4em" }),
      textPart("ml(0.5ml)和20%氢氧化钠溶液"),
      input("2.2.4.1-氢氧化钠溶液体积", { width: "4.4em" }),
      textPart("ml(1ml)，置水浴上加热"),
      input("2.2.4.1-水浴加热时间", { width: "4.4em" }),
      textPart("（30分钟）分钟液面出现"),
      input("2.2.4.1-液面现象", { width: "7em" }),
      textPart("。"),
      { type: "br" },
      textPart("2.2.4.2 "),
      textPart("取鉴别(1)项下的滤液"),
      input("2.2.4.2-滤液体积", { width: "4.4em" }),
      textPart("ml(1ml)，加间苯二酚"),
      input("2.2.4.2-间苯二酚取样量", { width: "4.4em" }),
      textPart("mg(10mg)和盐酸"),
      input("2.2.4.2-盐酸滴数", { width: "4.4em" }),
      textPart("滴(5滴)，煮沸"),
      input("2.2.4.2-煮沸时间", { width: "4.4em" }),
      textPart("分钟(1 分钟)，放冷，加苯"),
      input("2.2.4.2-苯体积", { width: "4.4em" }),
      textPart("ml(3ml)，振摇，苯层即显"),
      input("2.2.4.2-苯层显色", { width: "7em" }),
      textPart("。"),
      { type: "br" },
      textPart("2.2.4.3 "),
      textPart("取含量测定下的溶液，照紫外可见分光光度法(通则0401)测定，在"),
      input("2.2.4.3-最大吸收波长", { width: "4.4em" }),
      textPart("nm(252nm±2nm)的波长处有最大吸收。"),
    ],
  };
}

function normalizeDiammoniumFinishedIdentificationBlocks(layoutBlocks) {
  const detailBlock = diammoniumIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && (arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[123]$/.test(str(rec(part).sectionSuffix)))
        || /甘草酸二铵|间苯二酚|含量测定下的溶液/.test(partsText));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output.filter((block) => {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
    return !(
      str(data.type) === "paragraph"
      && !str(data.label)
      && !str(data.sourceTemplateId)
      && /含量测定项下记录的色谱图.*保留时间.*一致/.test(partsText)
    );
  });
}

function diammoniumIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-内容物取样量", "number", "g"],
    ["2.2.4.1-80%乙醇体积", "number", "mL"],
    ["2.2.4.1-稀盐酸体积", "number", "ml"],
    ["2.2.4.1-水体积", "number", "ml"],
    ["2.2.4.1-煮沸时间", "number", "min"],
    ["2.2.4.1-干燥时间", "number", "小时"],
    ["2.2.4.1-乙醇体积", "number", "ml"],
    ["2.2.4.1-乙醇溶液体积", "number", "ml"],
    ["2.2.4.1-BHT乙醇溶液体积", "number", "ml"],
    ["2.2.4.1-氢氧化钠溶液体积", "number", "ml"],
    ["2.2.4.1-水浴加热时间", "number", "分钟"],
    ["2.2.4.1-液面现象", "text", ""],
    ["2.2.4.2-滤液体积", "number", "ml"],
    ["2.2.4.2-间苯二酚取样量", "number", "mg"],
    ["2.2.4.2-盐酸滴数", "number", "滴"],
    ["2.2.4.2-煮沸时间", "number", "分钟"],
    ["2.2.4.2-苯体积", "number", "ml"],
    ["2.2.4.2-苯层显色", "text", ""],
    ["2.2.4.3-最大吸收波长", "number", "nm"],
  ];
  return {
    name: "甘草酸二铵胶囊成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, diammoniumIdentificationFieldKey(name), "fillable", "", {
      group: "甘草酸二铵胶囊成品鉴别",
      type,
      unit,
    })),
  };
}

function diammoniumDissolutionMeasurementTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label,
    sourceTemplateId: "dedicated/diammonium_glycyrrhizinate_packaging_dissolution",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function diammoniumPackagingDissolutionMeasurementBlocks() {
  return [
    {
      type: "title",
      title: "测定与计算",
      text: "测定与计算",
      sectionRef: "operation",
      order: 150,
    },
    diammoniumDissolutionMeasurementTable("甘草酸二铵待包装品溶出度测定与计算", ["10%", "14%", "25.33%", "25.33%", "25.34%"], [
      [contentCell("对照品计算", { colspan: 5, bold: true })],
      [
        contentCell([textPart("对照含量："), ddInput("对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          ddInput("对照毛重"),
          textPart(" - "),
          ddInput("对照皮重"),
          textPart(" = "),
          ddInput("对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), ddInput("样品波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), ddInput("空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), ddInput("空白溶剂OD")]),
        contentCell([textPart("对照 OD:"), ddInput("对照OD")], { colspan: 2 }),
      ],
      [
        contentCell("供试品"),
        contentCell([textPart("样 1:"), ddInput("样1-OD")]),
        contentCell([textPart("样 2:"), ddInput("样2-OD")]),
        contentCell([textPart("样 3:"), ddInput("样3-OD")]),
      ],
      [
        contentCell("(OD)"),
        contentCell([textPart("样 4:"), ddInput("样4-OD")]),
        contentCell([textPart("样 5:"), ddInput("样5-OD")]),
        contentCell([textPart("样 6:"), ddInput("样6-OD")]),
      ],
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量=CX×A×OD", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×1.898×对%×对量]×100%/[（OD对-OD空白）×25]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), ddInput("样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), ddInput("样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), ddInput("样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), ddInput("样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), ddInput("样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), ddInput("样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function pantoprazoleContentApplies(productKey, stageKey, testKeyValue) {
  return productKey === "pantoprazole" && testKeyValue === "content" && ["intermediate", "packaging"].includes(stageKey);
}

function pantoprazoleContentFieldKey(stageKey, name) {
  return `${stageKey}/content/pantoprazole_uv/${str(name).replace(/[\\/]/g, "_")}`;
}

function pantoprazoleInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: pantoprazoleContentFieldKey(stageKey, field) });
}

function pantoprazoleContentTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `泮托拉唑钠肠溶片${diammoniumStageLabel(stageKey)}含量${label}`,
    sourceTemplateId: `dedicated/pantoprazole_${stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function pantoprazoleContentWeighingTable(stageKey) {
  const sampleWeightRow = stageKey === "intermediate"
    ? [
        contentCell("理论片重（g）"),
        contentCell([
          textPart("投料量（Kg）/[批量（万片）×10]="),
          pantoprazoleInput(stageKey, "投料量"),
          textPart(" / ["),
          pantoprazoleInput(stageKey, "批量"),
          textPart("×10] = "),
          pantoprazoleInput(stageKey, "理论片重", { readonlyDisplay: true }),
          textPart(" g/片"),
        ], { colspan: 3 }),
      ]
    : [
        contentCell("片重（g）"),
        contentCell([
          pantoprazoleInput(stageKey, "20片总净重"),
          textPart(" ÷ 20 = "),
          pantoprazoleInput(stageKey, "平均片重", { readonlyDisplay: true }),
          textPart(" g/片"),
        ], { colspan: 3 }),
      ];
  return pantoprazoleContentTable(stageKey, "称重", ["16%", "18%", "22%", "22%", "22%"], [
    [
      contentCell([textPart("对照含量："), pantoprazoleInput(stageKey, "对照含量"), textPart("%")], { rowspan: 2 }),
      contentCell("对照称样（mg）", { rowspan: 2 }),
      contentCell("对照 1"),
      contentCell([
        pantoprazoleInput(stageKey, "对照1-毛重"),
        textPart(" - "),
        pantoprazoleInput(stageKey, "对照1-皮重"),
        textPart(" = "),
        pantoprazoleInput(stageKey, "对照1-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 2 }),
    ],
    [
      contentCell("对照 2"),
      contentCell([
        pantoprazoleInput(stageKey, "对照2-毛重"),
        textPart(" - "),
        pantoprazoleInput(stageKey, "对照2-皮重"),
        textPart(" = "),
        pantoprazoleInput(stageKey, "对照2-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 2 }),
    ],
    [
      contentCell("样品称样", { rowspan: 3 }),
      ...sampleWeightRow,
    ],
    [
      contentCell("样 1"),
      contentCell([
        pantoprazoleInput(stageKey, "样1-毛重"),
        textPart(" - "),
        pantoprazoleInput(stageKey, "样1-皮重"),
        textPart(" = "),
        pantoprazoleInput(stageKey, "样1-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 3 }),
    ],
    [
      contentCell("样 2"),
      contentCell([
        pantoprazoleInput(stageKey, "样2-毛重"),
        textPart(" - "),
        pantoprazoleInput(stageKey, "样2-皮重"),
        textPart(" = "),
        pantoprazoleInput(stageKey, "样2-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 3 }),
    ],
  ], 141);
}

function pantoprazoleContentMeasurementBlocks(stageKey) {
  return [
    pantoprazoleContentTable(stageKey, "测定与计算", ["13%", "21.75%", "21.75%", "21.75%", "21.75%"], [
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 7 }),
        contentCell([textPart("波长："), pantoprazoleInput(stageKey, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白OD:"), pantoprazoleInput(stageKey, "空白OD")], { colspan: 2 }),
        contentCell([textPart("空白溶剂OD:"), pantoprazoleInput(stageKey, "空白溶剂OD")], { colspan: 2 }),
      ],
      [contentCell("对照"), contentCell("OD/mg"), contentCell("平均（OD/mg）"), contentCell("RD≤1.0%")],
      [
        contentCell([textPart("OD1："), pantoprazoleInput(stageKey, "对照1-OD")]),
        contentCell([pantoprazoleInput(stageKey, "对照1-OD/mg", { readonlyDisplay: true })]),
        contentCell([pantoprazoleInput(stageKey, "平均-OD/mg", { readonlyDisplay: true })], { rowspan: 2 }),
        contentCell([pantoprazoleInput(stageKey, "对照RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell([textPart("OD2："), pantoprazoleInput(stageKey, "对照2-OD")]),
        contentCell([pantoprazoleInput(stageKey, "对照2-OD/mg", { readonlyDisplay: true })]),
      ],
      [contentCell("样品", { colspan: 4 })],
      [
        contentCell([textPart("OD1："), pantoprazoleInput(stageKey, "样1-OD")], { colspan: 2 }),
        contentCell([textPart("OD2："), pantoprazoleInput(stageKey, "样2-OD")], { colspan: 2 }),
      ],
      [
        contentCell("计算", { rowspan: 6 }),
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×0.9458×对%×2×片重×1000]×100%/[OD×m样重×40]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell([textPart("样 1="), pantoprazoleInput(stageKey, "样1-净重", { readonlyDisplay: true }), textPart(" mg")]),
        contentCell([textPart("样 1="), pantoprazoleInput(stageKey, "样1-含量", { readonlyDisplay: true }), textPart("×100%=")], { colspan: 3, align: "left" }),
      ],
      [
        contentCell([textPart("样 2="), pantoprazoleInput(stageKey, "样2-净重", { readonlyDisplay: true }), textPart(" mg")]),
        contentCell([textPart("样 2="), pantoprazoleInput(stageKey, "样2-含量", { readonlyDisplay: true }), textPart("×100%=")], { colspan: 3, align: "left" }),
      ],
      [
        contentCell("平均（%）"),
        contentCell([pantoprazoleInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { colspan: 3 }),
      ],
      [
        contentCell("RD≤2.0%"),
        contentCell([pantoprazoleInput(stageKey, "RD", { readonlyDisplay: true }), textPart("%")], { colspan: 3 }),
      ],
    ], 151),
  ];
}

function pantoprazoleContentLayoutBlocks(stageKey) {
  return [
    pantoprazoleContentWeighingTable(stageKey),
    ...pantoprazoleContentMeasurementBlocks(stageKey),
  ];
}

function pantoprazoleAcidResistanceApplies(productKey, stageKey, testKeyValue) {
  return productKey === "pantoprazole" && stageKey === "finished" && testKeyValue === "acid_resistance";
}

function pantoprazoleAcidResistanceFieldKey(name) {
  return `finished/acid_resistance/pantoprazole_uv/${str(name).replace(/[\\/]/g, "_")}`;
}

function pantoprazoleAcidResistanceInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: pantoprazoleAcidResistanceFieldKey(field) });
}

function pantoprazoleAcidResistanceSelect(field, options = []) {
  return {
    type: "select",
    field,
    fieldKey: pantoprazoleAcidResistanceFieldKey(field),
    options,
  };
}

function pantoprazoleAcidResistanceTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `泮托拉唑钠肠溶片成品耐酸力${label}`,
    sourceTemplateId: "dedicated/pantoprazole_finished_acid_resistance",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function pantoprazoleAcidResistanceLayoutBlocks() {
  return [
    pantoprazoleAcidResistanceTable("测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("测定与计算", { colspan: 5, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), pantoprazoleAcidResistanceInput("对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          pantoprazoleAcidResistanceInput("对照毛重"),
          textPart(" - "),
          pantoprazoleAcidResistanceInput("对照皮重"),
          textPart(" = "),
          pantoprazoleAcidResistanceInput("对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), pantoprazoleAcidResistanceInput("检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), pantoprazoleAcidResistanceInput("空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), pantoprazoleAcidResistanceInput("空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), pantoprazoleAcidResistanceInput("对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), pantoprazoleAcidResistanceInput("样1-OD")]),
        contentCell([textPart("样 2:"), pantoprazoleAcidResistanceInput("样2-OD")]),
        contentCell([textPart("样 3:"), pantoprazoleAcidResistanceInput("样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), pantoprazoleAcidResistanceInput("样4-OD")]),
        contentCell([textPart("样 5:"), pantoprazoleAcidResistanceInput("样5-OD")]),
        contentCell([textPart("样 6:"), pantoprazoleAcidResistanceInput("样6-OD")]),
      ],
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×m对×对%×0.9458×4]×100%/[（OD对-OD空白）×40]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("耐酸力", { rowspan: 2 }),
        contentCell([textPart("样 1="), pantoprazoleAcidResistanceInput("样1-耐酸力", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), pantoprazoleAcidResistanceInput("样2-耐酸力", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), pantoprazoleAcidResistanceInput("样3-耐酸力", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("平均："), pantoprazoleAcidResistanceInput("平均耐酸力", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell([textPart("样 4="), pantoprazoleAcidResistanceInput("样4-耐酸力", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), pantoprazoleAcidResistanceInput("样5-耐酸力", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), pantoprazoleAcidResistanceInput("样6-耐酸力", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function spironolactoneRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "spironolactone" && stageKey === "finished" && testKeyValue === "related_substances";
}

function spironolactoneRelatedFieldKey(name) {
  return `finished/related_substances/spironolactone_double_wavelength/${str(name).replace(/[\\/]/g, "_")}`;
}

function spironolactoneRelatedInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: spironolactoneRelatedFieldKey(name) });
}

function spironolactoneRelatedRadio(name) {
  return {
    type: "radio",
    fieldKey: spironolactoneRelatedFieldKey(name),
    options: ["是", "否"],
  };
}

function spironolactoneRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...spironolactoneRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(spironolactoneRelatedFieldKey),
  };
}

function spironolactoneRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `螺内酯片成品有关物质${label}`,
    sourceTemplateId: "dedicated/spironolactone_finished_related_substances",
    columnWidths,
    rows,
    order,
  };
}

function spironolactoneRelatedLayoutBlocks() {
  return [
    spironolactoneRelatedTable("称样", ["22%", "16%", "62%"], [
      [contentCell("2.3.5.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("坎利酮对照品（mg）"),
        contentCell([spironolactoneRelatedInput("坎利酮对照品含量"), textPart("%")]),
        contentCell([
          spironolactoneRelatedInput("坎利酮对照品毛重"),
          textPart(" - "),
          spironolactoneRelatedInput("坎利酮对照品皮重"),
          textPart(" = "),
          spironolactoneRelatedInput("坎利酮对照品净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ]),
      ],
      [
        contentCell("供试品（g）"),
        contentCell("/"),
        contentCell([
          spironolactoneRelatedInput("供试品毛重"),
          textPart(" - "),
          spironolactoneRelatedInput("供试品皮重"),
          textPart(" = "),
          spironolactoneRelatedInput("供试品净重", { readonlyDisplay: true }),
          textPart(" g"),
        ]),
      ],
    ], 141),
    spironolactoneRelatedTable("计算", ["22%", "56%", "22%"], [
      [contentCell("2.3.5.2 计算", { colspan: 3, bold: true, align: "left" })],
      [contentCell("系统适用性", { rowspan: 2 }), contentCell("项目"), contentCell("是否符合规定")],
      [
        contentCell("螺内酯峰与坎利酮峰的分离度应大于1.4。（254nm）"),
        contentCell([spironolactoneRelatedRadio("系统适用性分离度")]),
      ],
      [
        contentCell("对照溶液", { rowspan: 2 }),
        contentCell("对照溶液（1）峰面积（254nm）"),
        contentCell([textPart("Ar1="), spironolactoneRelatedInput("对照溶液1峰面积254nm")]),
      ],
      [
        contentCell("对照溶液（2）峰面积（254nm）"),
        contentCell([textPart("Ar2="), spironolactoneRelatedInput("对照溶液2峰面积254nm")]),
      ],
      [
        contentCell("对照品"),
        contentCell("对照品溶液（2）峰面积（283nm）"),
        contentCell([textPart("Ar3="), spironolactoneRelatedInput("坎利酮对照峰面积283nm")]),
      ],
      [
        contentCell("供试品", { rowspan: 2 }),
        contentCell("杂质峰面积和（254nm）"),
        contentCell([textPart("Ar样1="), spironolactoneRelatedInput("供试品杂质峰面积和254nm")]),
      ],
      [
        contentCell("坎利酮杂质峰（283nm）"),
        contentCell([textPart("A供坎="), spironolactoneRelatedInput("供试品坎利酮峰面积283nm")]),
      ],
      [contentCell("供试品", { colspan: 3 })],
      [
        contentCell("254nm"),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          spironolactoneRelatedReadonly(
            "254nm杂质",
            "254nm杂质 = 供试品杂质峰面积和254nm / 对照溶液1峰面积254nm × 100%",
            ["供试品杂质峰面积和254nm", "对照溶液1峰面积254nm"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("283nm"),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          spironolactoneRelatedReadonly(
            "283nm坎利酮",
            "283nm坎利酮 = 供试品坎利酮峰面积283nm / 坎利酮对照峰面积283nm × 100%",
            ["供试品坎利酮峰面积283nm", "坎利酮对照峰面积283nm"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("两波长杂质总量"),
        contentCell([
          spironolactoneRelatedReadonly(
            "总杂",
            "总杂 = 254nm杂质 + 283nm坎利酮",
            ["254nm杂质", "283nm坎利酮"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 151),
  ];
}

function spironolactoneRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "螺内酯片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: spironolactoneRelatedFieldKey(name),
    options: arr(extra.options).map((item) => str(item)).filter(Boolean),
  });
}

function spironolactoneRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(spironolactoneRelatedMethodField(...args));
  add("坎利酮对照品含量", "fillable", "", { unit: "%" });
  add("坎利酮对照品毛重", "fillable", "", { unit: "mg" });
  add("坎利酮对照品皮重", "fillable", "", { unit: "mg" });
  add("坎利酮对照品净重", "calculated", "坎利酮对照品毛重 - 坎利酮对照品皮重", { unit: "mg" });
  add("供试品毛重", "fillable", "", { unit: "g" });
  add("供试品皮重", "fillable", "", { unit: "g" });
  add("供试品净重", "calculated", "供试品毛重 - 供试品皮重", { unit: "g" });
  add("系统适用性分离度", "fillable", "", { type: "select", options: ["是", "否"] });
  add("对照溶液1峰面积254nm");
  add("对照溶液2峰面积254nm");
  add("坎利酮对照峰面积283nm");
  add("供试品杂质峰面积和254nm");
  add("供试品坎利酮峰面积283nm");
  add("254nm杂质", "calculated", "供试品杂质峰面积和254nm / 对照溶液1峰面积254nm * 100", { unit: "%" });
  add("283nm坎利酮", "calculated", "供试品坎利酮峰面积283nm / 坎利酮对照峰面积283nm * 100", { unit: "%" });
  add("总杂", "calculated", "254nm杂质 + 283nm坎利酮", { unit: "%" });
  add("结论-结果", "calculated", "总杂", { unit: "%" });
  return {
    name: "螺内酯片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function spironolactoneRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "螺内酯片有关物质称样与计算补充表", "**数据记录表：**"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...spironolactoneRelatedLayoutBlocks());
  return nextBlocks;
}

function levofloxacinRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "levofloxacin" && stageKey === "finished" && testKeyValue === "related_substances";
}

function levofloxacinRelatedFieldKey(name) {
  return `finished/related_substances/levofloxacin_gradient/${str(name).replace(/[\\/]/g, "_")}`;
}

function levofloxacinRelatedInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: levofloxacinRelatedFieldKey(name) });
}

function levofloxacinRelatedRadio(name) {
  return {
    type: "radio",
    fieldKey: levofloxacinRelatedFieldKey(name),
    options: ["是", "否"],
  };
}

function levofloxacinRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...levofloxacinRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(levofloxacinRelatedFieldKey),
  };
}

function levofloxacinRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `盐酸左氧氟沙星胶囊成品有关物质${label}`,
    sourceTemplateId: "dedicated/levofloxacin_finished_related_substances",
    columnWidths,
    rows,
    order,
  };
}

function levofloxacinRelatedLayoutBlocks() {
  return [
    levofloxacinRelatedTable("称样", ["28%", "21%", "51%"], [
      [contentCell("2.2.5.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("杂质 A 对照品（mg）"),
        contentCell([levofloxacinRelatedInput("杂质A对照品含量"), textPart("%")]),
        contentCell([levofloxacinRelatedInput("杂质A对照品称样"), textPart(" mg")]),
      ],
      [
        contentCell("供试品（g）"),
        contentCell("/"),
        contentCell([levofloxacinRelatedInput("供试品称样"), textPart(" g")]),
      ],
    ], 141),
    levofloxacinRelatedTable("计算", ["21%", "56%", "23%"], [
      [contentCell("2.2.5.2 计算", { colspan: 3, bold: true, align: "left" })],
      [contentCell("系统适用性", { rowspan: 2 }), contentCell("项目"), contentCell("是否符合规定")],
      [
        contentCell("左氧氟沙星峰与杂质 E 峰和左氧氟沙星峰与环丙沙星峰的分离度应分别大于 2.0 与 2.5"),
        contentCell([levofloxacinRelatedRadio("系统适用性分离度")]),
      ],
      [
        contentCell("对照品"),
        contentCell("杂质 A 峰面积（238nm）"),
        contentCell([textPart("ARB="), levofloxacinRelatedInput("杂质A对照品峰面积")]),
      ],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积（294nm）"),
        contentCell([textPart("AR对="), levofloxacinRelatedInput("对照溶液主峰面积")]),
      ],
      [
        contentCell("供试品", { rowspan: 3 }),
        contentCell("杂质 A 峰面积（238nm）"),
        contentCell([textPart("AXB="), levofloxacinRelatedInput("杂质A峰面积")]),
      ],
      [
        contentCell("其他单个最大峰面积（294nm）"),
        contentCell([textPart("AR单="), levofloxacinRelatedInput("其他单个最大杂质峰面积")]),
      ],
      [
        contentCell("总杂质峰面积和（294nm）"),
        contentCell([textPart("AR总="), levofloxacinRelatedInput("其他各杂质峰面积和")]),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2 })],
      [
        contentCell("杂质 A%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          levofloxacinRelatedReadonly(
            "杂质A",
            "杂质A = 杂质A峰面积 / 杂质A对照品峰面积 × 100%",
            ["杂质A峰面积", "杂质A对照品峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("单大%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          levofloxacinRelatedReadonly(
            "其他单杂",
            "其他单杂 = 其他单个最大杂质峰面积 / 对照溶液主峰面积 × 100%",
            ["其他单个最大杂质峰面积", "对照溶液主峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("总和%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          levofloxacinRelatedReadonly(
            "总杂",
            "总杂 = 其他各杂质峰面积和 / 对照溶液主峰面积 × 100%",
            ["其他各杂质峰面积和", "对照溶液主峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 151),
  ];
}

function levofloxacinRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "盐酸左氧氟沙星胶囊成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: levofloxacinRelatedFieldKey(name),
    options: arr(extra.options).map((item) => str(item)).filter(Boolean),
  });
}

function levofloxacinRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(levofloxacinRelatedMethodField(...args));
  add("杂质A对照品含量", "fillable", "", { unit: "%" });
  add("杂质A对照品称样", "fillable", "", { unit: "mg" });
  add("供试品称样", "fillable", "", { unit: "g" });
  add("系统适用性分离度", "fillable", "", { type: "select", options: ["是", "否"] });
  add("杂质A对照品峰面积");
  add("对照溶液主峰面积");
  add("杂质A峰面积");
  add("其他单个最大杂质峰面积");
  add("其他各杂质峰面积和");
  add("杂质A", "calculated", "杂质A峰面积 / 杂质A对照品峰面积 * 100", { unit: "%" });
  add("其他单杂", "calculated", "其他单个最大杂质峰面积 / 对照溶液主峰面积 * 100", { unit: "%" });
  add("总杂", "calculated", "其他各杂质峰面积和 / 对照溶液主峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总杂", { unit: "%" });
  return {
    name: "盐酸左氧氟沙星胶囊成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function levofloxacinRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "盐酸左氧氟沙星有关物质系统适用性与梯度表", "名称", "**数据记录表：**"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...levofloxacinRelatedLayoutBlocks());
  return nextBlocks;
}

const ALLOPURINOL_RELATED_NAMED_IMPURITIES = ["杂质A", "杂质B", "杂质C", "杂质D", "杂质E"];

function allopurinolRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "allopurinol" && stageKey === "finished" && testKeyValue === "related_substances";
}

function allopurinolRelatedFieldKey(name) {
  return `finished/related_substances/allopurinol_hplc/${str(name).replace(/[\\/]/g, "_")}`;
}

function allopurinolRelatedInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: allopurinolRelatedFieldKey(name) });
}

function allopurinolRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...allopurinolRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: arr(dependencyNames).map(allopurinolRelatedFieldKey),
  };
}

function allopurinolRelatedNetWeightParts(name) {
  return [
    textPart("m="),
    allopurinolRelatedInput(`称样/${name}-毛重`),
    textPart(" - "),
    allopurinolRelatedInput(`称样/${name}-皮重`),
    textPart(" = "),
    allopurinolRelatedReadonly(
      `称样/${name}-净重`,
      `称样/${name}-净重 = 称样/${name}-毛重 - 称样/${name}-皮重`,
      [`称样/${name}-毛重`, `称样/${name}-皮重`],
    ),
    textPart(" mg"),
  ];
}

function allopurinolRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `别嘌醇片成品有关物质${label}`,
    sourceTemplateId: "dedicated/allopurinol_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function allopurinolRelatedWeighingTable() {
  const referenceRows = [
    ["杂质A对照品（mg）", "杂质A"],
    ["杂质B对照品（mg）", "杂质B"],
    ["杂质C对照品（mg）", "杂质C"],
    ["杂质D对照品（mg）", "杂质D"],
    ["杂质E对照品（mg）", "杂质E"],
    ["别嘌醇对照品（mg）", "别嘌醇对照"],
  ];
  return allopurinolRelatedTable("称样", ["26%", "14%", "60%"], [
    [contentCell("2.3.5.1 称样", { colspan: 3, bold: true, align: "left" })],
    [contentCell("对照品名称"), contentCell("含量（%）"), contentCell("称样")],
    ...referenceRows.map(([label, name]) => [
      contentCell(label),
      contentCell(allopurinolRelatedInput(`称样/${name}-含量`)),
      contentCell(allopurinolRelatedNetWeightParts(name), { align: "left" }),
    ]),
    [
      contentCell("供试品（mg）"),
      contentCell("/"),
      contentCell(allopurinolRelatedNetWeightParts("供试品"), { align: "left" }),
    ],
  ], 141);
}

function allopurinolRelatedReferenceArParts(name) {
  const prefix = `对照/${name}`;
  return [
    allopurinolRelatedInput(`${prefix}/Ar1`),
    allopurinolRelatedInput(`${prefix}/Ar2`),
    allopurinolRelatedInput(`${prefix}/Ar3`),
    allopurinolRelatedReadonly(
      `${prefix}/Ar`,
      `${prefix}/Ar = (${prefix}/Ar1 + ${prefix}/Ar2 + ${prefix}/Ar3) / 3`,
      [`${prefix}/Ar1`, `${prefix}/Ar2`, `${prefix}/Ar3`],
    ),
    allopurinolRelatedReadonly(
      `${prefix}/RSD`,
      `${prefix}/RSD = RSD(${prefix}/Ar1, ${prefix}/Ar2, ${prefix}/Ar3)`,
      [`${prefix}/Ar1`, `${prefix}/Ar2`, `${prefix}/Ar3`],
    ),
  ];
}

function allopurinolRelatedMeasurementTable() {
  const referenceRows = [
    ["杂质A", "杂质A"],
    ["杂质C", "杂质C"],
    ["杂质B", "杂质B"],
    ["别嘌醇", "别嘌醇对照"],
    ["杂质D", "杂质D"],
    ["杂质E", "杂质E"],
  ];
  return allopurinolRelatedTable("测定", ["16%", "17%", "17%", "17%", "16%", "17%"], [
    [contentCell("2.3.5.2 测定", { colspan: 6, bold: true, align: "left" })],
    [
      contentCell("系统适用性", { rowspan: 3 }),
      contentCell("项目", { colspan: 3 }),
      contentCell("结果"),
      contentCell("是否符合规定"),
    ],
    [
      contentCell("杂质B峰与杂质C峰分离度应不小于1.5。", { colspan: 3 }),
      contentCell(allopurinolRelatedInput("系统适用性-1")),
      contentCell(allopurinolRelatedReadonly(
        "系统适用性-1是否符合",
        "系统适用性-1是否符合 = 系统适用性-1 >= 1.5",
        ["系统适用性-1"],
      )),
    ],
    [
      contentCell("别嘌醇色谱峰的拖尾因子不得大于1.5。", { colspan: 3 }),
      contentCell(allopurinolRelatedInput("系统适用性-2")),
      contentCell(allopurinolRelatedReadonly(
        "系统适用性-2是否符合",
        "系统适用性-2是否符合 = 系统适用性-2 <= 1.5",
        ["系统适用性-2"],
      )),
    ],
    [contentCell("名称"), contentCell("Ar1"), contentCell("Ar2"), contentCell("Ar3"), contentCell("Ar"), contentCell("RSD≤2.0%")],
    ...referenceRows.map(([label, name]) => [
      contentCell(label),
      ...allopurinolRelatedReferenceArParts(name).map((part) => contentCell(part)),
    ]),
  ], 156);
}

function allopurinolRelatedResultPart(name) {
  const formulas = {
    "结果/杂质A": {
      text: "结果/杂质A = 供试品/杂质A-Ar × 称样/杂质A-净重 × 称样/杂质A-含量 × 6 × 10 × 100 / (对照/杂质A/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/杂质A-Ar", "称样/杂质A-净重", "称样/杂质A-含量", "对照/杂质A/Ar", "称样/供试品-净重"],
    },
    "结果/杂质B": {
      text: "结果/杂质B = 供试品/杂质B-Ar × 称样/杂质B-净重 × 称样/杂质B-含量 × 3 × 10 × 100 / (对照/杂质B/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/杂质B-Ar", "称样/杂质B-净重", "称样/杂质B-含量", "对照/杂质B/Ar", "称样/供试品-净重"],
    },
    "结果/杂质C": {
      text: "结果/杂质C = 供试品/杂质C-Ar × 称样/杂质C-净重 × 称样/杂质C-含量 × 3 × 10 × 100 / (对照/杂质C/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/杂质C-Ar", "称样/杂质C-净重", "称样/杂质C-含量", "对照/杂质C/Ar", "称样/供试品-净重"],
    },
    "结果/杂质D": {
      text: "结果/杂质D = 供试品/杂质D-Ar × 称样/杂质D-净重 × 称样/杂质D-含量 × 3 × 10 × 100 / (对照/杂质D/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/杂质D-Ar", "称样/杂质D-净重", "称样/杂质D-含量", "对照/杂质D/Ar", "称样/供试品-净重"],
    },
    "结果/杂质E": {
      text: "结果/杂质E = 供试品/杂质E-Ar × 称样/杂质E-净重 × 称样/杂质E-含量 × 3 × 10 × 100 / (对照/杂质E/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/杂质E-Ar", "称样/杂质E-净重", "称样/杂质E-含量", "对照/杂质E/Ar", "称样/供试品-净重"],
    },
    "结果/单杂": {
      text: "结果/单杂 = 供试品/未知单个Ar × 称样/别嘌醇对照-净重 × 称样/别嘌醇对照-含量 × 3 × 10 × 100 / (对照/别嘌醇对照/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["供试品/未知单个Ar", "称样/别嘌醇对照-净重", "称样/别嘌醇对照-含量", "对照/别嘌醇对照/Ar", "称样/供试品-净重"],
    },
    "结果/总杂": {
      text: "结果/总杂 = 结果/杂质A + 结果/杂质B + 结果/杂质C + 结果/杂质D + 结果/杂质E + 供试品/未知总Ar × 称样/别嘌醇对照-净重 × 称样/别嘌醇对照-含量 × 3 × 10 × 100 / (对照/别嘌醇对照/Ar × 称样/供试品-净重 × 100 × 100 × 100)",
      deps: ["结果/杂质A", "结果/杂质B", "结果/杂质C", "结果/杂质D", "结果/杂质E", "供试品/未知总Ar", "称样/别嘌醇对照-净重", "称样/别嘌醇对照-含量", "对照/别嘌醇对照/Ar", "称样/供试品-净重"],
    },
  };
  const formula = formulas[name] || { text: name, deps: [] };
  return allopurinolRelatedReadonly(name, formula.text, formula.deps);
}

function allopurinolRelatedCalculationTable() {
  const resultRows = [
    ["杂质A（%）", "结果/杂质A"],
    ["杂质B（%）", "结果/杂质B"],
    ["杂质C（%）", "结果/杂质C"],
    ["杂质D（%）", "结果/杂质D"],
    ["杂质E（%）", "结果/杂质E"],
    ["单杂（%）", "结果/单杂"],
    ["总杂（%）", "结果/总杂"],
  ];
  return allopurinolRelatedTable("计算", ["11%", "12.7%", "12.7%", "12.7%", "12.7%", "12.7%", "12.7%", "12.8%"], [
    [contentCell("2.3.5.3 计算", { colspan: 8, bold: true, align: "left" })],
    [contentCell("供试品"), contentCell("杂质A"), contentCell("杂质B"), contentCell("杂质C"), contentCell("杂质D"), contentCell("杂质E"), contentCell("单（未知）"), contentCell("总（未知）")],
    [
      contentCell("Ar"),
      contentCell(allopurinolRelatedInput("供试品/杂质A-Ar")),
      contentCell(allopurinolRelatedInput("供试品/杂质B-Ar")),
      contentCell(allopurinolRelatedInput("供试品/杂质C-Ar")),
      contentCell(allopurinolRelatedInput("供试品/杂质D-Ar")),
      contentCell(allopurinolRelatedInput("供试品/杂质E-Ar")),
      contentCell(allopurinolRelatedInput("供试品/未知单个Ar")),
      contentCell(allopurinolRelatedInput("供试品/未知总Ar")),
    ],
    ...resultRows.map(([label, field]) => [
      contentCell(label),
      contentCell(allopurinolRelatedResultPart(field), { colspan: 7 }),
    ]),
  ], 171);
}

function allopurinolRelatedLayoutBlocks() {
  return [
    allopurinolRelatedWeighingTable(),
    allopurinolRelatedMeasurementTable(),
    allopurinolRelatedCalculationTable(),
  ];
}

function allopurinolRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "测定", "计算", "测定与计算"].includes(title))
      || ["多对照称样", "系统适用性", "对照品峰面积", "多杂质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...allopurinolRelatedLayoutBlocks());
  return nextBlocks;
}

function allopurinolContentApplies(productKey, stageKey, testKeyValue) {
  return productKey === "allopurinol" && testKeyValue === "content" && ["intermediate", "packaging"].includes(stageKey);
}

function allopurinolContentPrefix(stageKey) {
  return `${stageKey}/content/allopurinol_uv`;
}

function allopurinolContentFieldKey(stageKey, name) {
  return `${allopurinolContentPrefix(stageKey)}/${str(name).replace(/[\\/]/g, "_")}`;
}

function allopurinolInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: allopurinolContentFieldKey(stageKey, field) });
}

function allopurinolIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "allopurinol" && stageKey === "finished" && testKeyValue === "identification";
}

function allopurinolIdentificationFieldKey(name) {
  return `finished/identification/allopurinol/${str(name).replace(/[\\/]/g, "_")}`;
}

function allopurinolIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: allopurinolIdentificationFieldKey(name), width: str(options.width) || "5em" });
}

function allopurinolIdentificationHeading(sectionSuffix) {
  return { type: "section_heading", sectionSuffix, bold: true };
}

function allopurinolIdentificationLayoutBlocks(layoutBlocks) {
  const paragraph = {
    type: "paragraph",
    label: "别嘌醇片成品鉴别操作方法",
    sourceTemplateId: "dedicated/allopurinol_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      allopurinolIdentificationHeading("4.1"),
      textPart("取本品细粉"),
      allopurinolIdentificationInput("2.2.4.1-取样量"),
      textPart(" g（约相当于别嘌醇0.1g），加5%氢氧化钠"),
      allopurinolIdentificationInput("2.2.4.1-5%氢氧化钠体积"),
      textPart(" ml（10ml），搅拌使别嘌醇溶解，滤过，取滤液"),
      allopurinolIdentificationInput("2.2.4.1-滤液体积"),
      textPart(" ml（5ml），加碱性碘化汞钾试液"),
      allopurinolIdentificationInput("2.2.4.1-碱性碘化汞钾试液体积"),
      textPart(" ml（1ml），加热至沸，放置后生成"),
      allopurinolIdentificationInput("2.2.4.1-沉淀结果"),
      textPart("（黄色）沉淀。"),
      { type: "br" },
      allopurinolIdentificationHeading("4.2"),
      textPart("取含量测定项下的溶液，照紫外-可见分光光度法（通则0401）测定，在225nm～255nm波长处进行扫描，在"),
      allopurinolIdentificationInput("2.2.4.2-最大吸收波长"),
      textPart(" nm（250nm±2nm）的波长处有最大吸收"),
      allopurinolIdentificationInput("2.2.4.2-最大吸收结果"),
      textPart("，在"),
      allopurinolIdentificationInput("2.2.4.2-最小吸收波长"),
      textPart(" nm（231nm±2nm）的波长处有最小吸收"),
      allopurinolIdentificationInput("2.2.4.2-最小吸收结果"),
      textPart("。在231nm与250nm波长处的吸光度比值为"),
      allopurinolIdentificationInput("2.2.4.2-吸光度比值"),
      textPart("（应为0.52～0.60）。"),
      { type: "br" },
      allopurinolIdentificationHeading("4.3"),
      textPart("取本品细粉"),
      allopurinolIdentificationInput("2.2.4.3-取样量"),
      textPart(" g（约相当于别嘌醇0.2g），加氢氧化钠试液"),
      allopurinolIdentificationInput("2.2.4.3-氢氧化钠试液体积"),
      textPart(" mL（40mL），研磨使溶解，滤过，滤液加稀盐酸酸化至析出结晶，滤过，结晶用无水乙醇洗涤后，用无水乙醚洗涤，室温干燥后，在105℃干燥3小时，依法测定，本品的红外光吸收图谱应与对照的图谱(光谱集194图)"),
      allopurinolIdentificationInput("2.2.4.3-红外图谱结果"),
      textPart("（一致）。"),
    ],
  };
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isOriginalOperationParagraph = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && str(rec(part).sectionSuffix) === "4.1");
    if (isOriginalOperationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(paragraph);
      inserted = true;
    }
  }
  if (!inserted) output.splice(Math.max(1, output.length - 1), 0, paragraph);
  return output;
}

function allopurinolIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-取样量", "number", "g"],
    ["2.2.4.1-5%氢氧化钠体积", "number", "ml"],
    ["2.2.4.1-滤液体积", "number", "ml"],
    ["2.2.4.1-碱性碘化汞钾试液体积", "number", "ml"],
    ["2.2.4.1-沉淀结果", "text", ""],
    ["2.2.4.2-最大吸收波长", "number", "nm"],
    ["2.2.4.2-最大吸收结果", "text", ""],
    ["2.2.4.2-最小吸收波长", "number", "nm"],
    ["2.2.4.2-最小吸收结果", "text", ""],
    ["2.2.4.2-吸光度比值", "number", ""],
    ["2.2.4.3-取样量", "number", "g"],
    ["2.2.4.3-氢氧化钠试液体积", "number", "mL"],
    ["2.2.4.3-红外图谱结果", "text", ""],
  ];
  return {
    name: "别嘌醇片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, allopurinolIdentificationFieldKey(name), "fillable", "", { group: "别嘌醇片成品鉴别", type, unit })),
  };
}

function allopurinolContentTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `别嘌醇片${diammoniumStageLabel(stageKey)}含量${label}`,
    sourceTemplateId: `dedicated/allopurinol_${stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function allopurinolContentWeighingTable(stageKey) {
  if (stageKey === "intermediate") {
    return allopurinolContentTable(stageKey, "称重", ["15%", "16%", "69%"], [
      [
        contentCell("样品称样", { rowspan: 3 }),
        contentCell("理论片重（g）"),
        contentCell([
          textPart("投料量（Kg）/[批量（万片）×10]="),
          allopurinolInput(stageKey, "投料量"),
          textPart(" / ["),
          allopurinolInput(stageKey, "批量"),
          textPart("×10] = "),
          allopurinolInput(stageKey, "理论片重", { readonlyDisplay: true }),
          textPart(" g/片"),
        ]),
      ],
      [
        contentCell("样 1"),
        contentCell([
          allopurinolInput(stageKey, "样1-毛重"),
          textPart(" - "),
          allopurinolInput(stageKey, "样1-皮重"),
          textPart(" = "),
          allopurinolInput(stageKey, "样1-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("样 2"),
        contentCell([
          allopurinolInput(stageKey, "样2-毛重"),
          textPart(" - "),
          allopurinolInput(stageKey, "样2-皮重"),
          textPart(" = "),
          allopurinolInput(stageKey, "样2-净重", { readonlyDisplay: true }),
          textPart(" g"),
        ], { colspan: 2 }),
      ],
    ], 141);
  }
  return allopurinolContentTable(stageKey, "称重", ["15%", "16%", "69%"], [
    [
      contentCell("样品称样", { rowspan: 3 }),
      contentCell("片重（g）"),
      contentCell([
        textPart("（"),
        allopurinolInput(stageKey, "20片总毛重"),
        textPart(" - "),
        allopurinolInput(stageKey, "20片总皮重"),
        textPart("） ÷20 = "),
        allopurinolInput(stageKey, "平均片重", { readonlyDisplay: true }),
        textPart(" g/片"),
      ]),
    ],
    [
      contentCell("样 1"),
      contentCell([
        allopurinolInput(stageKey, "样1-毛重"),
        textPart(" - "),
        allopurinolInput(stageKey, "样1-皮重"),
        textPart(" = "),
        allopurinolInput(stageKey, "样1-净重", { readonlyDisplay: true }),
        textPart(" g"),
      ], { colspan: 2 }),
    ],
    [
      contentCell("样 2"),
      contentCell([
        allopurinolInput(stageKey, "样2-毛重"),
        textPart(" - "),
        allopurinolInput(stageKey, "样2-皮重"),
        textPart(" = "),
        allopurinolInput(stageKey, "样2-净重", { readonlyDisplay: true }),
        textPart(" g"),
      ], { colspan: 2 }),
    ],
  ], 141);
}

function allopurinolContentMeasurementBlocks(stageKey) {
  return [
    allopurinolContentTable(stageKey, "测定与计算", ["13%", "22%", "21.7%", "21.65%", "21.65%"], [
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 3 }),
        contentCell([textPart("波长："), allopurinolInput(stageKey, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell("空白"),
        contentCell([textPart("OD:"), allopurinolInput(stageKey, "空白OD")]),
        contentCell("空白溶剂"),
        contentCell([textPart("OD:"), allopurinolInput(stageKey, "空白溶剂OD")]),
      ],
      [
        contentCell("样品OD", { colspan: 2 }),
        contentCell([textPart("OD1："), allopurinolInput(stageKey, "样1-OD")]),
        contentCell([textPart("OD2："), allopurinolInput(stageKey, "样2-OD")]),
      ],
      [
        contentCell("计算", { rowspan: 4 }),
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量=CX×A×OD", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×100×片重]×100%/（m×571×0.1）", { colspan: 3, align: "left" }),
      ],
      [
        contentCell([textPart("样 1="), allopurinolInput(stageKey, "样1-净重", { readonlyDisplay: true }), textPart(" g")]),
        contentCell([textPart("样 2="), allopurinolInput(stageKey, "样2-净重", { readonlyDisplay: true }), textPart(" g")]),
        contentCell("平均含量（%）"),
        contentCell("RD 应≤2.0%"),
      ],
      [
        contentCell([textPart("含量 1="), allopurinolInput(stageKey, "样1-含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("含量 2="), allopurinolInput(stageKey, "样2-含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("平均:"), allopurinolInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("RD="), allopurinolInput(stageKey, "RD", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function allopurinolContentLayoutBlocks(stageKey) {
  return [
    allopurinolContentWeighingTable(stageKey),
    ...allopurinolContentMeasurementBlocks(stageKey),
  ];
}

function compoundRutinContentApplies(productKey, stageKey, testKeyValue) {
  return productKey === "compound_rutin" && testKeyValue === "content" && ["intermediate", "packaging"].includes(stageKey);
}

function compoundRutinContentFieldKey(stageKey, name) {
  return `${stageKey}/content/compound_rutin/${str(name).replace(/[\\/]/g, "_")}`;
}

function compoundRutinInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: compoundRutinContentFieldKey(stageKey, field) });
}

function compoundRutinContentTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `复方芦丁片${diammoniumStageLabel(stageKey)}含量${label}`,
    sourceTemplateId: `dedicated/compound_rutin_${stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function compoundRutinTabletWeightParts(stageKey) {
  if (stageKey === "intermediate") {
    return [
      textPart("投料量（Kg）/[批量（万片）×10]="),
      compoundRutinInput(stageKey, "投料量"),
      textPart(" / ["),
      compoundRutinInput(stageKey, "批量"),
      textPart("×10] = "),
      compoundRutinInput(stageKey, "理论片重", { readonlyDisplay: true }),
      textPart(" g/片"),
    ];
  }
  return [
    compoundRutinInput(stageKey, "20片总重"),
    textPart(" ÷ 20 = "),
    compoundRutinInput(stageKey, "平均片重", { readonlyDisplay: true }),
    textPart(" g/片"),
  ];
}

function compoundRutinRutinWeighingTable(stageKey) {
  const tabletWeightLabel = stageKey === "intermediate" ? "理论片重（g）" : "片重（g）";
  return compoundRutinContentTable(stageKey, "芦丁称重", ["15%", "16%", "11%", "58%"], [
    [
      contentCell([textPart("对照含量"), lineBreakPart(), compoundRutinInput(stageKey, "芦丁对照含量"), textPart("%")], { rowspan: 2 }),
      contentCell([textPart("对照称样"), lineBreakPart(), textPart("（mg）")], { rowspan: 2 }),
      contentCell("对照1"),
      contentCell([textPart("m1="), compoundRutinInput(stageKey, "芦丁对照1-毛重"), textPart(" - "), compoundRutinInput(stageKey, "芦丁对照1-皮重"), textPart(" = "), compoundRutinInput(stageKey, "芦丁对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
    ],
    [
      contentCell("对照2"),
      contentCell([textPart("m2="), compoundRutinInput(stageKey, "芦丁对照2-毛重"), textPart(" - "), compoundRutinInput(stageKey, "芦丁对照2-皮重"), textPart(" = "), compoundRutinInput(stageKey, "芦丁对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
    ],
    [
      contentCell("样品称样（g）", { rowspan: 3 }),
      contentCell(tabletWeightLabel),
      contentCell(compoundRutinTabletWeightParts(stageKey), { colspan: 2 }),
    ],
    [
      contentCell("样1"),
      contentCell([compoundRutinInput(stageKey, "芦丁样1-毛重"), textPart(" - "), compoundRutinInput(stageKey, "芦丁样1-皮重"), textPart(" = "), compoundRutinInput(stageKey, "芦丁样1-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
    ],
    [
      contentCell("样2"),
      contentCell([compoundRutinInput(stageKey, "芦丁样2-毛重"), textPart(" - "), compoundRutinInput(stageKey, "芦丁样2-皮重"), textPart(" = "), compoundRutinInput(stageKey, "芦丁样2-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
    ],
  ], 140);
}

function compoundRutinRutinCalculationTable(stageKey) {
  return compoundRutinContentTable(stageKey, "芦丁测定与计算", ["13%", "21%", "16%", "16%", "17%", "17%"], [
    [contentCell("对照品计算", { colspan: 6, align: "left" })],
    [contentCell("吸光度", { rowspan: 5 }), contentCell([textPart("波长："), compoundRutinInput(stageKey, "芦丁检测波长"), textPart("nm")], { colspan: 5, align: "left" })],
    [contentCell([textPart("空白 OD:"), compoundRutinInput(stageKey, "芦丁空白OD")], { colspan: 2, align: "left" }), contentCell([textPart("空白溶剂 OD:"), compoundRutinInput(stageKey, "芦丁空白溶剂OD")], { colspan: 3, align: "left" })],
    [contentCell("名称"), contentCell("对照"), contentCell("OD/mg"), contentCell("平均（OD/mg）"), contentCell("RD≤1.0%")],
    [contentCell([textPart("对照 1："), compoundRutinInput(stageKey, "芦丁对照1-净重", { readonlyDisplay: true }), textPart("mg")]), contentCell([textPart("OD1："), compoundRutinInput(stageKey, "芦丁对照1-OD")]), contentCell([compoundRutinInput(stageKey, "芦丁对照1-OD/mg", { readonlyDisplay: true })]), contentCell([compoundRutinInput(stageKey, "芦丁平均OD/mg", { readonlyDisplay: true })], { rowspan: 2 }), contentCell([compoundRutinInput(stageKey, "芦丁对照RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
    [contentCell([textPart("对照 2："), compoundRutinInput(stageKey, "芦丁对照2-净重", { readonlyDisplay: true }), textPart("mg")]), contentCell([textPart("OD2："), compoundRutinInput(stageKey, "芦丁对照2-OD")]), contentCell([compoundRutinInput(stageKey, "芦丁对照2-OD/mg", { readonlyDisplay: true })])],
    [contentCell("供试品计算", { colspan: 6, align: "left" })],
    [contentCell("计算公式", { rowspan: 2 }), contentCell("含量=CX×A×OD", { colspan: 5, align: "left" })],
    [contentCell("含量（%）=[（OD样-OD空白）×对照%×1.089×2×片重/m×A×20]×100%", { colspan: 5, align: "left" })],
    [contentCell("名称"), contentCell("称重"), contentCell("样品OD"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("RD≤2.0%")],
    [contentCell("供试品样 1"), contentCell([compoundRutinInput(stageKey, "芦丁样1-净重", { readonlyDisplay: true }), textPart("g")]), contentCell([compoundRutinInput(stageKey, "芦丁样1-OD")]), contentCell([compoundRutinInput(stageKey, "芦丁样1-含量", { readonlyDisplay: true })]), contentCell([compoundRutinInput(stageKey, "芦丁平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([compoundRutinInput(stageKey, "芦丁RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
    [contentCell("供试品样 2"), contentCell([compoundRutinInput(stageKey, "芦丁样2-净重", { readonlyDisplay: true }), textPart("g")]), contentCell([compoundRutinInput(stageKey, "芦丁样2-OD")]), contentCell([compoundRutinInput(stageKey, "芦丁样2-含量", { readonlyDisplay: true })])],
  ], 151);
}

function compoundRutinVitaminCalculationTable(stageKey) {
  const firstRows = stageKey === "intermediate"
    ? [
        [contentCell("样品称样（g）", { rowspan: 3 }), contentCell("理论片重（g）"), contentCell(compoundRutinTabletWeightParts(stageKey), { colspan: 4 })],
        [contentCell("样1"), contentCell([compoundRutinInput(stageKey, "维C样1-毛重"), textPart(" - "), compoundRutinInput(stageKey, "维C样1-皮重"), textPart(" = "), compoundRutinInput(stageKey, "维C样1-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 4 })],
        [contentCell("样2"), contentCell([compoundRutinInput(stageKey, "维C样2-毛重"), textPart(" - "), compoundRutinInput(stageKey, "维C样2-皮重"), textPart(" = "), compoundRutinInput(stageKey, "维C样2-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 4 })],
      ]
    : [
        [contentCell("样品称样（g）", { rowspan: 2 }), contentCell("样1"), contentCell([compoundRutinInput(stageKey, "维C样1-毛重"), textPart(" - "), compoundRutinInput(stageKey, "维C样1-皮重"), textPart(" = "), compoundRutinInput(stageKey, "维C样1-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 4 })],
        [contentCell("样2"), contentCell([compoundRutinInput(stageKey, "维C样2-毛重"), textPart(" - "), compoundRutinInput(stageKey, "维C样2-皮重"), textPart(" = "), compoundRutinInput(stageKey, "维C样2-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 4 })],
      ];
  return compoundRutinContentTable(stageKey, "维生素C称重测定与计算", ["16%", "16%", "19%", "16%", "17%", "16%"], [
    ...firstRows,
    [contentCell("供试品计算", { colspan: 6, align: "left" })],
    [contentCell("计算公式"), contentCell("含量=[（C×V×0.008806×片重）/（m×0.5×0.05×0.05）]×100%", { colspan: 5, align: "left" })],
    [contentCell("滴定液"), contentCell([textPart("C="), compoundRutinInput(stageKey, "维C滴定液浓度"), textPart(" mol/L")], { colspan: 5, align: "left" })],
    [contentCell("名称"), contentCell("称重"), contentCell("消耗碘滴定液 ml"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("RD≤0.8%")],
    [contentCell("供试品样 1"), contentCell([compoundRutinInput(stageKey, "维C样1-净重", { readonlyDisplay: true }), textPart("g")]), contentCell([compoundRutinInput(stageKey, "维C样1-滴定体积")]), contentCell([compoundRutinInput(stageKey, "维C样1-含量", { readonlyDisplay: true })]), contentCell([compoundRutinInput(stageKey, "维C平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([compoundRutinInput(stageKey, "维C RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
    [contentCell("供试品样 2"), contentCell([compoundRutinInput(stageKey, "维C样2-净重", { readonlyDisplay: true }), textPart("g")]), contentCell([compoundRutinInput(stageKey, "维C样2-滴定体积")]), contentCell([compoundRutinInput(stageKey, "维C样2-含量", { readonlyDisplay: true })])],
  ], 152);
}

function compoundRutinContentLayoutBlocks(stageKey) {
  return [
    compoundRutinRutinWeighingTable(stageKey),
    compoundRutinRutinCalculationTable(stageKey),
    compoundRutinVitaminCalculationTable(stageKey),
  ];
}

function hydrochlorothiazideContentUniformityApplies(productKey, stageKey, testKeyValue) {
  return productKey === "hydrochlorothiazide"
    && testKeyValue === "content_uniformity"
    && ["packaging", "finished"].includes(stageKey);
}

function hydrochlorothiazideUniformityFieldKey(stageKey, name) {
  return `${stageKey}/content_uniformity/hydrochlorothiazide_hplc_uniformity/${str(name).replace(/[\\/]/g, "_")}`;
}

function hydrochlorothiazideUniformityInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: hydrochlorothiazideUniformityFieldKey(stageKey, field) });
}

function hydrochlorothiazideUniformityTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `氢氯噻嗪片含量均匀度${label}`,
    sourceTemplateId: `dedicated/hydrochlorothiazide_${stageKey}_content_uniformity`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function hydrochlorothiazideUniformityReferenceTable(stageKey) {
  return hydrochlorothiazideUniformityTable(stageKey, "对照称样", ["14%", "39%", "14%", "16%", "17%"], [
    [
      contentCell([textPart("对照称重"), lineBreakPart(), textPart("含量："), hydrochlorothiazideUniformityInput(stageKey, "对照含量"), textPart("%")], { rowspan: 2 }),
      contentCell([
        textPart("m = "),
        hydrochlorothiazideUniformityInput(stageKey, "对照-毛重"),
        textPart(" - "),
        hydrochlorothiazideUniformityInput(stageKey, "对照-皮重"),
        textPart(" = "),
        hydrochlorothiazideUniformityInput(stageKey, "对照称重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { rowspan: 2 }),
      contentCell("峰面积（Ar）", { rowspan: 2 }),
      contentCell([hydrochlorothiazideUniformityInput(stageKey, "对照峰面积1")]),
      contentCell([
        textPart("Ar="),
        hydrochlorothiazideUniformityInput(stageKey, "对照平均峰面积", { readonlyDisplay: true }),
      ], { rowspan: 2 }),
    ],
    [
      contentCell([hydrochlorothiazideUniformityInput(stageKey, "对照峰面积2")]),
    ],
  ], 140);
}

function hydrochlorothiazideUniformityCalculationTable(stageKey) {
  const rows = [
    [
      contentCell("均匀度计算", { colspan: 5, align: "center" }),
    ],
    [
      contentCell("计算公式", { rowspan: 2 }),
      contentCell("含量（CX）=（CR×AX）/AR", { colspan: 4, align: "left" }),
    ],
    [
      contentCell("含量（%）=[（AR样×对照称重×对照%）/（AR对×10）]×100%", { colspan: 4, align: "left" }),
    ],
    [
      contentCell("名称"),
      contentCell("峰面积（Ar）"),
      contentCell("含量（%）"),
      contentCell("平均（%）"),
      contentCell("A＋2.2S ≤13.0"),
    ],
  ];
  for (let index = 1; index <= 10; index += 1) {
    const row = [];
    if (index === 1) {
      row.push(contentCell([
        textPart("对照："),
        hydrochlorothiazideUniformityInput(stageKey, "对照称重", { readonlyDisplay: true }),
        textPart("mg"),
      ], { rowspan: 10 }));
    }
    row.push(contentCell([hydrochlorothiazideUniformityInput(stageKey, `样${index}-峰面积`)]));
    row.push(contentCell([
      hydrochlorothiazideUniformityInput(stageKey, `样${index}-含量`, { readonlyDisplay: true }),
      textPart("%"),
    ]));
    if (index === 1) {
      row.push(contentCell([
        textPart("X="),
        hydrochlorothiazideUniformityInput(stageKey, "平均含量", { readonlyDisplay: true }),
        textPart("%"),
      ], { rowspan: 10 }));
      row.push(contentCell([
        textPart("A＋2.2S="),
        hydrochlorothiazideUniformityInput(stageKey, "A＋2.2S", { readonlyDisplay: true }),
      ], { rowspan: 10 }));
    }
    rows.push(row);
  }
  return hydrochlorothiazideUniformityTable(stageKey, "测定与计算", ["18%", "18%", "14%", "16%", "34%"], rows, 150);
}

function hydrochlorothiazideUniformityLayoutBlocks(stageKey) {
  return [
    hydrochlorothiazideUniformityReferenceTable(stageKey),
    hydrochlorothiazideUniformityCalculationTable(stageKey),
  ];
}

function hydrochlorothiazideUniformityMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "氢氯噻嗪片含量均匀度",
    type: str(extra.type) || "number",
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: hydrochlorothiazideUniformityFieldKey(stageKey, name),
  });
}

function hydrochlorothiazideUniformityMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(hydrochlorothiazideUniformityMethodField(stageKey, ...args));
  add("对照含量", "fillable", "", { unit: "%" });
  add("对照-毛重", "fillable", "", { unit: "mg" });
  add("对照-皮重", "fillable", "", { unit: "mg" });
  add("对照称重", "calculated", "对照-毛重 - 对照-皮重", { unit: "mg" });
  add("对照峰面积1");
  add("对照峰面积2");
  add("对照平均峰面积", "calculated", "(对照峰面积1 + 对照峰面积2) / 2");
  for (let index = 1; index <= 10; index += 1) {
    add(`样${index}-峰面积`);
    add(`样${index}-含量`, "calculated", `样${index}-峰面积 * 对照称重 * 对照含量 * 100 / (对照平均峰面积 * 10)`, { unit: "%" });
  }
  const sampleContents = Array.from({ length: 10 }, (_, index) => `样${index + 1}-含量`);
  add("平均含量", "calculated", `(${sampleContents.join(" + ")}) / 10`, { unit: "%" });
  add("A＋2.2S", "calculated", `平均含量 + 2.2 * SQRT((${sampleContents.map((field) => `(${field} - 平均含量)^2`).join(" + ")}) / 9)`);
  return {
    name: "氢氯噻嗪片含量均匀度",
    source: "dedicated_layout",
    fields,
  };
}

function isosorbideUniformityApplies(productKey, stageKey, testKeyValue) {
  return productKey === "isosorbide_dinitrate"
    && testKeyValue === "content_uniformity"
    && ["packaging", "finished"].includes(stageKey);
}

function isosorbideUniformityFieldKey(stageKey, name) {
  return `${stageKey}/content_uniformity/isosorbide_hplc_uniformity/${str(name).replace(/[\\/]/g, "_")}`;
}

function isosorbideUniformityInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: isosorbideUniformityFieldKey(stageKey, field) });
}

function isosorbideUniformityCalculationTable(stageKey) {
  const rows = [
    [
      contentCell("计算公式", { rowspan: 2 }),
      contentCell("含量（CX）=（CR×AX）/AR", { colspan: 4, align: "left" }),
    ],
    [
      contentCell("含量（%）=[（A样×对照%×对照称重）/（A对×5×2）]×100%", { colspan: 4, align: "left" }),
    ],
    [
      contentCell("名称"),
      contentCell("峰面积（Ar）"),
      contentCell("含量（%）"),
      contentCell("平均（%）"),
      contentCell("A＋2.2S ≤13.0"),
    ],
  ];
  for (let index = 1; index <= 10; index += 1) {
    const row = [];
    if (index === 1) row.push(contentCell("供试品", { rowspan: 10 }));
    row.push(contentCell([textPart(`${index}:`), isosorbideUniformityInput(stageKey, `样${index}-峰面积`)]));
    row.push(contentCell([isosorbideUniformityInput(stageKey, `样${index}-含量`, { readonlyDisplay: true }), textPart("%")]));
    if (index === 1) {
      row.push(contentCell([textPart("X="), isosorbideUniformityInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 10 }));
      row.push(contentCell([textPart("A＋2.2S="), isosorbideUniformityInput(stageKey, "A＋2.2S", { readonlyDisplay: true })], { rowspan: 10 }));
    }
    rows.push(row);
  }
  return {
    type: "table",
    label: "硝酸异山梨酯片含量均匀度测定与计算",
    sourceTemplateId: `dedicated/isosorbide_dinitrate_${stageKey}_content_uniformity`,
    compactTable: true,
    columnWidths: ["15%", "20%", "18%", "17%", "30%"],
    rows,
    order: 150,
  };
}

function isosorbideUniformityMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "硝酸异山梨酯片含量均匀度",
    type: str(extra.type) || "number",
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: isosorbideUniformityFieldKey(stageKey, name),
  });
}

function isosorbideUniformityMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(isosorbideUniformityMethodField(stageKey, ...args));
  add("对照含量", "fillable", "", { unit: "%" });
  add("对照称重", "fillable", "", { unit: "mg" });
  add("对照峰面积", "fillable");
  for (let index = 1; index <= 10; index += 1) {
    add(`样${index}-峰面积`);
    add(`样${index}-含量`, "calculated", `样${index}-峰面积 * 对照含量 * 对照称重 * 100 / (对照峰面积 * 5 * 2)`, { unit: "%" });
  }
  const sampleContents = Array.from({ length: 10 }, (_, index) => `样${index + 1}-含量`);
  add("平均含量", "calculated", `(${sampleContents.join(" + ")}) / 10`, { unit: "%" });
  add("A＋2.2S", "calculated", `平均含量 + 2.2 * SQRT((${sampleContents.map((field) => `(${field} - 平均含量)^2`).join(" + ")}) / 9)`);
  return {
    name: "硝酸异山梨酯片含量均匀度",
    source: "dedicated_layout",
    fields,
  };
}

const SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG = {
  simvastatin: {
    displayName: "辛伐他汀片含量均匀度",
    formulaText: "含量（%）=[（A样×m对×对照%）/（Ār对×10）]×100%",
    contentFormula: (sample, refWeight, refContent, refAverage) => `${sample} * ${refWeight} * ${refContent} * 100 / (${refAverage} * 10)`,
    sampleLabel: (index) => `样${index}`,
    referenceInCalculationName: false,
  },
  spironolactone: {
    displayName: "螺内酯片含量均匀度",
    formulaText: "含量（%）=[（A样×5×M对重×对%）/（A对×20×3）]×100%",
    contentFormula: (sample, refWeight, refContent, refAverage) => `${sample} * 5 * ${refWeight} * ${refContent} * 100 / (${refAverage} * 20 * 3)`,
    sampleLabel: () => "",
    referenceInCalculationName: true,
  },
  terazosin: {
    displayName: "盐酸特拉唑嗪胶囊含量均匀度",
    formulaText: "含量（%）=[（A样×0.914×m对×对照%）/（Ār对×10）]×100%",
    contentFormula: (sample, refWeight, refContent, refAverage) => `${sample} * 0.914 * ${refWeight} * ${refContent} * 100 / (${refAverage} * 10)`,
    sampleLabel: () => "",
    referenceInCalculationName: true,
  },
};

function singleReferenceHplcUniformityApplies(productKey, stageKey, testKeyValue) {
  return testKeyValue === "content_uniformity"
    && ["packaging", "finished"].includes(stageKey)
    && Boolean(SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey]);
}

function singleReferenceHplcUniformityFieldKey(productKey, stageKey, name) {
  return `${stageKey}/content_uniformity/${productKey}_hplc_uniformity/${str(name).replace(/[\\/]/g, "_")}`;
}

function singleReferenceHplcUniformityInput(productKey, stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: singleReferenceHplcUniformityFieldKey(productKey, stageKey, field) });
}

function singleReferenceHplcUniformityReferenceTable(productKey, stageKey) {
  const config = SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey];
  return {
    type: "table",
    label: `${config.displayName}对照称样`,
    sourceTemplateId: `dedicated/${productKey}_${stageKey}_content_uniformity`,
    compactTable: true,
    columnWidths: ["16%", "33%", "16%", "17%", "18%"],
    rows: [
      [
        contentCell([textPart("对照称重"), lineBreakPart(), textPart("含量："), singleReferenceHplcUniformityInput(productKey, stageKey, "对照含量"), textPart("%")], { rowspan: 2 }),
        contentCell([
          textPart("m = "),
          singleReferenceHplcUniformityInput(productKey, stageKey, "对照-毛重"),
          textPart(" - "),
          singleReferenceHplcUniformityInput(productKey, stageKey, "对照-皮重"),
          textPart(" = "),
          singleReferenceHplcUniformityInput(productKey, stageKey, "对照称重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { rowspan: 2 }),
        contentCell("峰面积（Ar）", { rowspan: 2 }),
        contentCell([singleReferenceHplcUniformityInput(productKey, stageKey, "对照峰面积1")]),
        contentCell([textPart("Ār="), singleReferenceHplcUniformityInput(productKey, stageKey, "对照平均峰面积", { readonlyDisplay: true })], { rowspan: 2 }),
      ],
      [
        contentCell([singleReferenceHplcUniformityInput(productKey, stageKey, "对照峰面积2")]),
      ],
    ],
    order: 140,
  };
}

function singleReferenceHplcUniformityCalculationTable(productKey, stageKey) {
  const config = SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey];
  const rows = [
    [contentCell("均匀度计算", { colspan: 5, align: "center" })],
    [
      contentCell("计算公式", { rowspan: 2 }),
      contentCell("含量（CX）=（CR×AX）/AR", { colspan: 4, align: "left" }),
    ],
    [
      contentCell(config.formulaText, { colspan: 4, align: "left" }),
    ],
    [
      contentCell("名称"),
      contentCell("峰面积（Ar）"),
      contentCell("含量（%）"),
      contentCell("平均（%）"),
      contentCell("A＋2.2S ≤13.0"),
    ],
  ];
  for (let index = 1; index <= 10; index += 1) {
    const row = [];
    if (index === 1 && config.referenceInCalculationName) {
      row.push(contentCell([
        textPart("对照："),
        singleReferenceHplcUniformityInput(productKey, stageKey, "对照称重", { readonlyDisplay: true }),
        textPart("mg"),
      ], { rowspan: 10 }));
    } else if (!config.referenceInCalculationName) {
      row.push(contentCell(config.sampleLabel(index)));
    }
    row.push(contentCell([singleReferenceHplcUniformityInput(productKey, stageKey, `样${index}-峰面积`)]));
    row.push(contentCell([singleReferenceHplcUniformityInput(productKey, stageKey, `样${index}-含量`, { readonlyDisplay: true }), textPart("%")]));
    if (index === 1) {
      row.push(contentCell([textPart("X="), singleReferenceHplcUniformityInput(productKey, stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 10 }));
      row.push(contentCell([textPart("A＋2.2S="), singleReferenceHplcUniformityInput(productKey, stageKey, "A＋2.2S", { readonlyDisplay: true })], { rowspan: 10 }));
    }
    rows.push(row);
  }
  return {
    type: "table",
    label: `${config.displayName}测定与计算`,
    sourceTemplateId: `dedicated/${productKey}_${stageKey}_content_uniformity`,
    compactTable: true,
    columnWidths: config.referenceInCalculationName ? ["18%", "18%", "18%", "16%", "30%"] : ["16%", "20%", "18%", "18%", "28%"],
    rows,
    order: 150,
  };
}

function singleReferenceHplcUniformityLayoutBlocks(productKey, stageKey) {
  return [
    singleReferenceHplcUniformityReferenceTable(productKey, stageKey),
    singleReferenceHplcUniformityCalculationTable(productKey, stageKey),
  ];
}

function singleReferenceHplcUniformityMethodField(productKey, stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey].displayName,
    type: str(extra.type) || "number",
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: singleReferenceHplcUniformityFieldKey(productKey, stageKey, name),
  });
}

function singleReferenceHplcUniformityMethodGroup(productKey, stageKey) {
  const config = SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey];
  const fields = [];
  const add = (...args) => fields.push(singleReferenceHplcUniformityMethodField(productKey, stageKey, ...args));
  add("对照含量", "fillable", "", { unit: "%" });
  add("对照-毛重", "fillable", "", { unit: "mg" });
  add("对照-皮重", "fillable", "", { unit: "mg" });
  add("对照称重", "calculated", "对照-毛重 - 对照-皮重", { unit: "mg" });
  add("对照峰面积1");
  add("对照峰面积2");
  add("对照平均峰面积", "calculated", "(对照峰面积1 + 对照峰面积2) / 2");
  for (let index = 1; index <= 10; index += 1) {
    add(`样${index}-峰面积`);
    add(`样${index}-含量`, "calculated", config.contentFormula(`样${index}-峰面积`, "对照称重", "对照含量", "对照平均峰面积"), { unit: "%" });
  }
  const sampleContents = Array.from({ length: 10 }, (_, index) => `样${index + 1}-含量`);
  add("平均含量", "calculated", `(${sampleContents.join(" + ")}) / 10`, { unit: "%" });
  add("A＋2.2S", "calculated", `平均含量 + 2.2 * SQRT((${sampleContents.map((field) => `(${field} - 平均含量)^2`).join(" + ")}) / 9)`);
  return {
    name: config.displayName,
    source: "dedicated_layout",
    fields,
  };
}

function reconcileDedicatedProductLayoutBlocks(layoutBlocks, productKey, stageKey, testKeyValue) {
  if (azithromycinFinishedMoistureApplies(productKey, stageKey, testKeyValue)) {
    return azithromycinFinishedMoistureLayoutBlocks(layoutBlocks);
  }
  if (allopurinolIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return allopurinolIdentificationLayoutBlocks(layoutBlocks);
  }
  if (levofloxacinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return levofloxacinIdentificationLayoutBlocks(layoutBlocks);
  }
  if (simvastatinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return simvastatinIdentificationLayoutBlocks(layoutBlocks);
  }
  if (productKey === "isosorbide_dinitrate" && stageKey === "finished" && testKeyValue === "identification") {
    return normalizeIsosorbideFinishedIdentificationBlocks(layoutBlocks);
  }
  if (spironolactoneIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return spironolactoneIdentificationLayoutBlocks(layoutBlocks);
  }
  if (terazosinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return terazosinIdentificationLayoutBlocks(layoutBlocks);
  }
  if (allopurinolRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return allopurinolRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (spironolactoneRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return spironolactoneRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (levofloxacinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return levofloxacinRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (pantoprazoleRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return pantoprazoleRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (atenololRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return atenololRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (clarithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return clarithromycinRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (hydrochlorothiazideRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return hydrochlorothiazideRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (terazosinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return terazosinRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (verapamilRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return verapamilRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (azithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return azithromycinRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (simvastatinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    return simvastatinRelatedSubstancesLayoutBlocks(layoutBlocks);
  }
  if (hydrochlorothiazideContentUniformityApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const type = str(data.type);
      return !(
        label === "含量均匀度"
        || label === "对照称重含量：%"
        || label === "均匀度计算"
        || /^md_supplement_paragraph_/.test(label)
        || type === "sectioned_operation_steps"
        || /氢氯噻嗪片含量均匀度/.test(label)
      );
    });
    const contentBlocks = hydrochlorothiazideUniformityLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => {
      const data = rec(block);
      return str(data.type) === "title" && /(对照称样|称样|称重)/.test(str(data.title || data.text));
    });
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (weighingTitleIndex >= 0) {
      nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    } else {
      const insertAt = measurementTitleIndexValue >= 0 ? measurementTitleIndexValue : postMethodBlockIndex(nextBlocks);
      nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, {
        type: "title",
        title: "对照称样",
        text: "对照称样",
        sectionSuffix: "1",
        sectionRef: "operation",
        order: 140,
      }, contentBlocks[0]);
    }
    const nextMeasurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (nextMeasurementTitleIndexValue >= 0) {
      nextBlocks.splice(nextMeasurementTitleIndexValue + 1, 0, contentBlocks[1]);
    } else {
      const weighingBlockIndex = nextBlocks.findIndex((block) => str(rec(block).label) === str(rec(contentBlocks[0]).label));
      nextBlocks.splice((weighingBlockIndex >= 0 ? weighingBlockIndex : nextBlocks.length - 1) + 1, 0, {
        type: "title",
        title: "测定与计算",
        text: "测定与计算",
        sectionSuffix: "2",
        sectionRef: "operation",
        order: 150,
      }, contentBlocks[1]);
    }
    return nextBlocks;
  }
  if (isosorbideUniformityApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const type = str(data.type);
      return !(
        label === "含量均匀度"
        || label === "计算公式"
        || /^md_supplement_paragraph_/.test(label)
        || type === "sectioned_operation_steps"
        || /硝酸异山梨酯片含量均匀度/.test(label)
      );
    });
    const contentBlock = isosorbideUniformityCalculationTable(stageKey);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) nextBlocks.splice(measurementTitleIndexValue + 1, 0, contentBlock);
    return nextBlocks;
  }
  if (singleReferenceHplcUniformityApplies(productKey, stageKey, testKeyValue)) {
    const config = SINGLE_REFERENCE_HPLC_UNIFORMITY_CONFIG[productKey];
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const type = str(data.type);
      const onlyRecoveredWeighingHeading = /^(对照称样|称样|称重)$/.test(paragraphSectionHeadingText(block));
      return !(
        label === "含量均匀度"
        || label === "对照称重含量：%"
        || label === "均匀度计算"
        || label === "计算公式"
        || /^md_supplement_paragraph_/.test(label)
        || type === "sectioned_operation_steps"
        || onlyRecoveredWeighingHeading
        || new RegExp(`${config.displayName}(?:对照称样|测定与计算)`).test(label)
      );
    });
    const contentBlocks = singleReferenceHplcUniformityLayoutBlocks(productKey, stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => {
      const data = rec(block);
      return str(data.type) === "title" && /(对照称样|称样|称重)/.test(str(data.title || data.text));
    });
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (weighingTitleIndex >= 0) {
      nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    } else {
      const insertAt = measurementTitleIndexValue >= 0 ? measurementTitleIndexValue : postMethodBlockIndex(nextBlocks);
      nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, {
        type: "title",
        title: "对照称样",
        text: "对照称样",
        sectionSuffix: "1",
        sectionRef: "operation",
        order: 140,
      }, contentBlocks[0]);
    }
    const nextMeasurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (nextMeasurementTitleIndexValue >= 0) {
      nextBlocks.splice(nextMeasurementTitleIndexValue + 1, 0, contentBlocks[1]);
    } else {
      const weighingBlockIndex = nextBlocks.findIndex((block) => str(rec(block).label) === str(rec(contentBlocks[0]).label));
      nextBlocks.splice((weighingBlockIndex >= 0 ? weighingBlockIndex : nextBlocks.length - 1) + 1, 0, {
        type: "title",
        title: "测定与计算",
        text: "测定与计算",
        sectionSuffix: "2",
        sectionRef: "operation",
        order: 150,
      }, contentBlocks[1]);
    }
    return nextBlocks;
  }
  if (pantoprazoleContentApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        label === "HPLC称重"
        || label === "UV含量测定与计算"
        || /^md_supplement_paragraph_/.test(label)
        || label === "MD补充表格1"
        || label === "数据记录表"
        || label === "**数据记录表：**"
        || /泮托拉唑钠肠溶片.*含量(?:称重|吸光度|计算公式|结果计算)/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = pantoprazoleContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    const nextMeasurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (nextMeasurementTitleIndexValue >= 0) nextBlocks.splice(nextMeasurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (pantoprazoleAcidResistanceApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        label === "MD补充表格1"
        || label === "数据记录表"
        || label === "**数据记录表：**"
        || /^md_supplement_paragraph_/.test(label)
        || /泮托拉唑钠肠溶片成品耐酸力/.test(label)
        || /^(对照品计算|吸光度|计算公式|耐酸力)$/.test(label)
        || (str(data.type) === "title" && /^(测定与计算|称重与计算)$/.test(title))
      );
    });
    const insertAt = postMethodBlockIndex(nextBlocks);
    nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...pantoprazoleAcidResistanceLayoutBlocks());
    return nextBlocks;
  }
  if (allopurinolContentApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        label === "UV含量测定与计算"
        || /^UV吸收系数法/.test(label)
        || label === "吸光度"
        || label === "样品称样"
        || label === "MD补充表格1"
        || label === "数据记录表"
        || label === "**数据记录表：**"
        || /别嘌醇片.*含量(?:称重|吸光度|计算公式|结果计算)/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = allopurinolContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    const nextMeasurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (nextMeasurementTitleIndexValue >= 0) nextBlocks.splice(nextMeasurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (compoundRutinContentApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      const type = str(data.type);
      return !(
        label === "HPLC称重"
        || label === "UV含量测定与计算"
        || label === "对照品计算"
        || label === "供试品计算"
        || label === "样品称样（g）"
        || /^md_supplement_paragraph_/.test(label)
        || /复方芦丁片.*含量/.test(label)
        || type === "sectioned_operation_steps"
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = compoundRutinContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) nextBlocks.splice(measurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (berberineContentApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        label === "HPLC称重"
        || label === "UV含量测定与计算"
        || label === "对照品计算"
        || label === "供试品计算"
        || /^md_supplement_paragraph_/.test(label)
        || label === "MD补充表格1"
        || label === "数据记录表"
        || label === "**数据记录表：**"
        || /鞣酸小檗碱片.*含量(?:称重|对照品计算|供试品计算|结果计算)/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = berberineContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) nextBlocks.splice(measurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (
    productKey === "diammonium_glycyrrhizinate"
    && testKeyValue === "content"
    && ["intermediate", "packaging", "finished"].includes(stageKey)
  ) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const type = str(data.type);
      return !(
        label === "HPLC称重"
        || label === "UV含量测定与计算"
        || label === "对照品计算"
        || /甘草酸二铵.*含量/.test(label)
        || type === "sectioned_operation_steps"
      );
    });
    const contentBlocks = diammoniumContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) nextBlocks.splice(measurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (specialHplcContentApplies(productKey, stageKey, testKeyValue)) {
    const ctx = specialHplcContentContext(productKey, stageKey);
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      const type = str(data.type);
      return !(
        label === "HPLC称重"
        || label === "20片片重称重"
        || label === "系统适用性"
        || label === "对照品计算"
        || label === "供试品计算"
        || /^对照含量[：:]?\s*%$/.test(label)
        || label === "**数据记录表：**"
        || label === "MD补充表格1"
        || label === "数据记录表"
        || type === "sectioned_operation_steps"
        || /^md_supplement_paragraph_/.test(label)
        || /^测定法：精密量取/.test(label)
        || /(?:阿替洛尔片|阿奇霉素胶囊|克拉霉素胶囊|氢氯噻嗪片|硝酸异山梨酯片|盐酸左氧氟沙星胶囊|辛伐他汀片|螺内酯片|盐酸特拉唑嗪胶囊|盐酸维拉帕米片)含量(?:称重|系统适用性|对照品计算|供试品计算|测定与计算)/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = specialHplcContentLayoutBlocks(productKey, stageKey);
    const methodBlock = specialHplcContentMeasurementMethodBlock(ctx);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    const hasWeighingTitle = weighingTitleIndex >= 0;
    let weighingInsertIndex = weighingTitleIndex;
    if (methodBlock && hasWeighingTitle) {
      nextBlocks.splice(weighingTitleIndex, 0, methodBlock);
      if (hasWeighingTitle) weighingInsertIndex += 1;
    }
    if (hasWeighingTitle) {
      nextBlocks.splice(weighingInsertIndex + 1, 0, contentBlocks[0]);
    } else {
      const operationIndex = nextBlocks.findIndex((block) => str(rec(block).label) === "md_operation_method");
      const insertAt = operationIndex >= 0 ? operationIndex + 1 : postMethodBlockIndex(nextBlocks);
      nextBlocks.splice(
        insertAt >= 0 ? insertAt : nextBlocks.length,
        0,
        ...(methodBlock ? [methodBlock] : []),
        specialHplcContentTitleBlock("称重", "1", 140),
        contentBlocks[0],
      );
    }
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) {
      nextBlocks.splice(measurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    } else if (hasWeighingTitle) {
      const insertAt = nextBlocks.findIndex((block) => rec(block) === contentBlocks[0]);
      nextBlocks.splice((insertAt >= 0 ? insertAt : weighingInsertIndex + 1) + 1, 0, specialHplcContentTitleBlock("测定与计算", "2", 150), ...contentBlocks.slice(1));
    } else {
      const weighingBlockIndex = nextBlocks.findIndex((block) => str(rec(block).label) === str(rec(contentBlocks[0]).label));
      nextBlocks.splice((weighingBlockIndex >= 0 ? weighingBlockIndex : nextBlocks.length - 1) + 1, 0, specialHplcContentTitleBlock("测定与计算", "2", 150), ...contentBlocks.slice(1));
    }
    return nextBlocks;
  }
  if (productKey === "methimazole" && testKeyValue === "content" && ["intermediate", "packaging", "finished"].includes(stageKey)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        label === "HPLC称重"
        || label === "对照品计算"
        || label === "供试品计算"
        || label === "**数据记录表：**"
        || label === "MD补充表格1"
        || label === "数据记录表"
        || label === "名称"
        || str(data.type) === "sectioned_operation_steps"
        || /甲巯咪唑片.*含量/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = methimazoleContentLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /称重/.test(str(rec(block).title || rec(block).text)));
    if (weighingTitleIndex >= 0) {
      nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    } else {
      const insertAt = postMethodBlockIndex(nextBlocks);
      nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, {
        type: "title",
        title: "称重",
        text: "称重",
        sectionSuffix: "1",
        sectionRef: "operation",
        order: 140,
      }, contentBlocks[0]);
    }
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (measurementTitleIndexValue >= 0) {
      nextBlocks.splice(measurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    } else {
      const weighingBlockIndex = nextBlocks.findIndex((block) => str(rec(block).label) === str(rec(contentBlocks[0]).label));
      nextBlocks.splice((weighingBlockIndex >= 0 ? weighingBlockIndex : nextBlocks.length - 1) + 1, 0, {
        type: "title",
        title: "测定与计算",
        text: "测定与计算",
        sectionSuffix: "2",
        sectionRef: "operation",
        order: 150,
      }, ...contentBlocks.slice(1));
    }
    return nextBlocks;
  }
  if (methimazoleUniformityApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      const type = str(data.type);
      const parts = arr(data.parts);
      const isOnlyMethimazoleUniformityHeadings = type === "paragraph"
        && parts.length > 0
        && parts.every((part) => ["section_heading", "br"].includes(str(rec(part).type)))
        && parts.some((part) => str(rec(part).type) === "section_heading")
        && parts
          .filter((part) => str(rec(part).type) === "section_heading")
          .every((part) => /^(称重|对照品计算|供试品计算)$/.test(str(rec(part).text || rec(part).title)));
      return !(
        label === "含量均匀度"
        || label === "对照品计算"
        || label === "供试品计算"
        || /^md_supplement_paragraph_/.test(label)
        || type === "sectioned_operation_steps"
        || isOnlyMethimazoleUniformityHeadings
        || /甲巯咪唑片.*含量均匀度/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
      );
    });
    const contentBlocks = methimazoleUniformityLayoutBlocks(stageKey);
    const weighingTitleIndex = nextBlocks.findIndex((block) => str(rec(block).type) === "title" && /(称重|称样)/.test(str(rec(block).title || rec(block).text)));
    const measurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (weighingTitleIndex >= 0) {
      nextBlocks.splice(weighingTitleIndex + 1, 0, contentBlocks[0]);
    } else {
      const insertAt = measurementTitleIndexValue >= 0 ? measurementTitleIndexValue : postMethodBlockIndex(nextBlocks);
      nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, {
        type: "title",
        title: "称重",
        text: "称重",
        sectionSuffix: "1",
        sectionRef: "operation",
        order: 140,
      }, contentBlocks[0]);
    }
    const nextMeasurementTitleIndexValue = measurementTitleIndex(nextBlocks);
    if (nextMeasurementTitleIndexValue >= 0) nextBlocks.splice(nextMeasurementTitleIndexValue + 1, 0, ...contentBlocks.slice(1));
    return nextBlocks;
  }
  if (specialDissolutionApplies(productKey, stageKey, testKeyValue)) {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const data = rec(block);
      const label = str(data.label);
      const title = str(data.title || data.text);
      return !(
        /(?:溶出度|酸中释放度)(?:测定与计算|对照品计算|吸光度|计算公式|结果)$/.test(label)
        || label === "对照品计算"
        || label === "对照峰面积"
        || label === "供试品计算"
        || label === "供试品峰面积"
        || /^供试品(?:溶出量|释放量|酸中释放量)/.test(label)
        || /^峰面积/.test(label)
        || (str(data.type) === "title" && /^(对照品计算|供试品计算)$/.test(title))
        || label === "**数据记录表：**"
        || label === "MD补充表格1"
        || label === "数据记录表"
      );
    });
    const insertAt = postMethodBlockIndex(nextBlocks);
    nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...specialDissolutionLayoutBlocks(productKey, stageKey, testKeyValue));
    return nextBlocks;
  }
  if (productKey === "diammonium_glycyrrhizinate" && stageKey === "packaging" && testKeyValue === "dissolution") {
    const nextBlocks = arr(layoutBlocks).filter((block) => {
      const label = str(rec(block).label);
      return !(
        label === "对照品计算"
        || label === "数据记录表"
        || label === "MD补充表格1"
        || /溶出度.*(?:对照品计算|吸光度|计算公式|结果)/.test(label)
      );
    });
    const insertAt = postMethodBlockIndex(nextBlocks);
    nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...diammoniumPackagingDissolutionMeasurementBlocks());
    return nextBlocks;
  }
  if (productKey === "diammonium_glycyrrhizinate" && stageKey === "finished" && testKeyValue === "identification") {
    return normalizeDiammoniumFinishedIdentificationBlocks(layoutBlocks);
  }
  if (berberineIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return berberineIdentificationLayoutBlocks(layoutBlocks);
  }
  if (compoundRutinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return compoundRutinIdentificationLayoutBlocks(layoutBlocks);
  }
  if (pantoprazoleIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return pantoprazoleIdentificationLayoutBlocks(layoutBlocks);
  }
  if (methimazoleIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return methimazoleIdentificationLayoutBlocks(layoutBlocks);
  }
  if (verapamilIdentificationApplies(productKey, stageKey, testKeyValue)) {
    return verapamilIdentificationLayoutBlocks(layoutBlocks);
  }
  return layoutBlocks;
}

function normalizeRecoveredMdTableBlocks(layoutBlocks, productKey, stageKey, testKeyValue) {
  const sourceBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    if (productKey === "spironolactone" && stageKey === "finished" && testKeyValue === "identification") {
      const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
      if (
        str(data.type) === "paragraph"
        && !str(data.label)
        && !str(data.sourceTemplateId)
        && /含量测定项下记录的色谱图.*保留时间.*一致/.test(partsText)
      ) return false;
    }
    return true;
  });
  return sourceBlocks.map((block) => {
    const data = rec(block);
    const next = { ...data };
    if (str(next.type) === "paragraph" && productKey === "compound_rutin" && testKeyValue === "content" && /^md_supplement_paragraph_/.test(str(next.label))) {
      next.label = stageKey === "intermediate"
        ? "复方芦丁片中间体维生素C含量补充段"
        : "复方芦丁片芦丁含量计算补充段";
      next.sectionRole = "recovered_md";
      next.sourceTemplateId = "md_structured_recovered";
      next.parts = arr(next.parts).map((part) => {
        const item = { ...rec(part) };
        if (item.fieldKey) item.fieldKey = str(item.fieldKey).replace("/md_supplement_", "/recovered_");
        return item;
      });
      return next;
    }
    if (str(data.type) !== "table") return block;
    const label = str(next.label);
    if (productKey === "azithromycin" && stageKey === "finished" && testKeyValue === "related_substances" && label === "有关物质称样") {
      next.rows = arr(next.rows).map((row) => arr(row).map((cell) => {
        const item = { ...rec(cell) };
        if (str(item.rawText) === "含量/规格") item.rawText = "含量（%）";
        return item;
      }));
      return next;
    }
    if (label === "**数据记录表：**") {
      if (productKey === "levofloxacin" && stageKey === "finished" && testKeyValue === "related_substances") {
        next.label = "盐酸左氧氟沙星有关物质系统适用性与梯度表";
      } else if (productKey === "spironolactone" && stageKey === "finished" && testKeyValue === "related_substances") {
        next.label = "螺内酯片有关物质称样与计算补充表";
      } else {
        next.label = "原始MD补充数据表";
      }
      next.sourceTemplateId = "md_structured_recovered";
    } else if (productKey === "azithromycin" && stageKey === "finished" && testKeyValue === "related_substances" && label === "2.2.5.1称样") {
      next.__dropRecoveredMdTable = true;
    }
    if (Array.isArray(next.rows)) {
      next.rows = next.rows.filter((row) => !arr(row).every((cell) => str(rec(cell).rawText).trim() === "---"));
    }
    return next;
  }).filter((block) => !rec(block).__dropRecoveredMdTable);
}

function diammoniumMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "甘草酸二铵中间体含量",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: diammoniumFieldKey(name),
  });
}

function diammoniumIntermediateContentMethodGroup() {
  const fillable = [
    ["投料量", "Kg"],
    ["批量", "万粒"],
    ["样1-毛重", "g"],
    ["样1-皮重", "g"],
    ["样2-毛重", "g"],
    ["样2-皮重", "g"],
    ["对照含量", "%"],
    ["对照1-称量", "mg"],
    ["对照1-毛重", "mg"],
    ["对照1-皮重", "mg"],
    ["对照2-称量", "mg"],
    ["对照2-毛重", "mg"],
    ["对照2-皮重", "mg"],
    ["对照波长", "nm"],
    ["对照空白OD", ""],
    ["空白溶剂OD", ""],
    ["对照1-OD", ""],
    ["对照2-OD", ""],
    ["样品波长", "nm"],
    ["样品空白OD", ""],
    ["样品空白溶剂OD", ""],
    ["样1-OD", ""],
    ["样2-OD", ""],
  ].map(([name, unit]) => diammoniumMethodField(name, "fillable", "", { unit, type: /波长/.test(name) ? "text" : "number" }));
  const calculated = [
    ["理论粒重", "投料量 / (批量 * 10)", "g/粒"],
    ["样1-净重", "样1-毛重 - 样1-皮重", "g"],
    ["样2-净重", "样2-毛重 - 样2-皮重", "g"],
    ["对照1-净重", "对照1-毛重 - 对照1-皮重", "mg"],
    ["对照2-净重", "对照2-毛重 - 对照2-皮重", "mg"],
    ["对照1-OD/mg", "(对照1-OD - 空白溶剂OD) / 对照1-净重", ""],
    ["对照2-OD/mg", "(对照2-OD - 空白溶剂OD) / 对照2-净重", ""],
    ["平均-OD/mg", "(对照1-OD/mg + 对照2-OD/mg) / 2", ""],
    ["对照RD", "ABS(对照1-OD/mg - 对照2-OD/mg) / 平均-OD/mg * 100", "%"],
    ["样1-含量", "(样1-OD - 样品空白OD) * 对照含量 * 25 * 1.898 * 理论粒重 * 100 / (平均-OD/mg * 10 * 50 * 样1-净重)", "%"],
    ["样2-含量", "(样2-OD - 样品空白OD) * 对照含量 * 25 * 1.898 * 理论粒重 * 100 / (平均-OD/mg * 10 * 50 * 样2-净重)", "%"],
    ["平均含量", "(样1-含量 + 样2-含量) / 2", "%"],
    ["RD", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", "%"],
  ].map(([name, formula, unit]) => diammoniumMethodField(name, "calculated", formula, { unit }));
  return {
    name: "甘草酸二铵中间体含量",
    source: "dedicated_layout",
    fields: [...fillable, ...calculated],
  };
}

function diammoniumContentMethodGroup(stageKey) {
  if (["packaging", "finished"].includes(stageKey)) {
    const group = diammoniumIntermediateContentMethodGroup();
    const removed = new Set(["投料量", "批量", "理论粒重"]);
    const replacementFields = [
      diammoniumMethodField("20粒总毛重", "fillable", "", { unit: "g" }),
      diammoniumMethodField("20粒总皮重", "fillable", "", { unit: "g" }),
      diammoniumMethodField("平均粒重", "calculated", "(20粒总毛重 - 20粒总皮重) / 20", { unit: "g/粒" }),
    ];
    group.fields = [
      ...replacementFields,
      ...arr(group.fields)
        .filter((field) => !removed.has(str(rec(field).name)))
        .map((field) => {
          const item = { ...rec(field) };
          if (typeof item.formula === "string") item.formula = item.formula.replaceAll("理论粒重", "平均粒重");
          return item;
        }),
    ];
    return stageDiammoniumContentObject(group, stageKey);
  }
  if (["intermediate", "packaging", "finished"].includes(stageKey)) {
    return stageDiammoniumContentObject(diammoniumIntermediateContentMethodGroup(), stageKey);
  }
  return diammoniumIntermediateContentMethodGroup();
}

const SPECIAL_HPLC_CONTENT_PRODUCTS = new Set(["atenolol", "azithromycin", "clarithromycin", "hydrochlorothiazide", "isosorbide_dinitrate", "levofloxacin", "simvastatin", "spironolactone", "terazosin", "verapamil"]);

function specialHplcContentApplies(productKey, stageKey, testKeyValue) {
  return testKeyValue === "content"
    && SPECIAL_HPLC_CONTENT_PRODUCTS.has(productKey)
    && ["intermediate", "packaging", "finished"].includes(stageKey);
}

function specialHplcContentContext(productKey, stageKey) {
  const labels = {
    azithromycin: "阿奇霉素胶囊",
    atenolol: "阿替洛尔片",
    clarithromycin: "克拉霉素胶囊",
    hydrochlorothiazide: "氢氯噻嗪片",
    isosorbide_dinitrate: "硝酸异山梨酯片",
    levofloxacin: "盐酸左氧氟沙星胶囊",
    simvastatin: "辛伐他汀片",
    spironolactone: "螺内酯片",
    terazosin: "盐酸特拉唑嗪胶囊",
    verapamil: "盐酸维拉帕米片",
  };
  const unitLabel = ["azithromycin", "clarithromycin", "levofloxacin", "terazosin"].includes(productKey) ? "粒" : "片";
  const sampleWeightUnit = ["atenolol", "azithromycin", "levofloxacin", "terazosin", "verapamil"].includes(productKey) ? "g" : "mg";
  const formulaText = productKey === "azithromycin"
    ? "含量（%）=[（A样×5×对照%×粒重）/（m样×A对×0.25×1000）]×100%"
    : productKey === "atenolol"
    ? "含量（%）=[（A样×2×对照%×片重）/（m样×A对×25）]×100%"
    : productKey === "clarithromycin"
    ? "含量（%）=[（A样×2×对照%×粒重）/（m样×A对×0.25）]×100%"
    : productKey === "isosorbide_dinitrate" && stageKey === "packaging"
    ? "含量（%）=[（A样×对照%×片重×1000）/（m样×A对×2×5）]×100%"
    : productKey === "isosorbide_dinitrate"
    ? "含量（%）=[（A样×对照%×片重）/（m样×A对×0.005×2）]×100%"
    : productKey === "levofloxacin"
    ? "含量（%）=[（A样×10×对照%×粒重）/（m样×A对×规格×1000）]×100%"
    : productKey === "verapamil"
    ? "含量（%）=[（A样×10×对照%×片重）/（m样×A对×规格）]×100%"
    : productKey === "simvastatin"
      ? "含量（%）=[（A样×对照%×片重）/（m样×A对×0.01）]×100%"
      : productKey === "spironolactone"
        ? "含量（%）=[（A样×对照%×片重）/（m样×A对×0.02）]×100%"
        : productKey === "terazosin"
          ? "含量（%）=[（A样×0.914×对照%×粒重）/（m样×A对×5×2）]×100%"
          : "含量（%）=[（A样×2×对照%×片重×1000）/（m样×A对×25）]×100%";
  const systemSuitabilityRows = {
    atenolol: ["阿替洛尔峰与相邻杂质峰的分离度应不小于1.5。", "理论塔板数按阿替洛尔峰计算不低于2000。"],
    clarithromycin: ["克拉霉素峰与相邻杂质峰的分离度应不小于1.5。", "克拉霉素峰拖尾因子不得过2.0。"],
    isosorbide_dinitrate: ["理论板数按硝酸异山梨酯峰计算不低于5000。", "硝酸异山梨酯峰与相邻杂质峰之间的分离度应不小于1.5。"],
    simvastatin: ["辛伐他汀峰与洛伐他汀峰之间的分离度应大于3.0。", "辛伐他汀峰理论板数≥2000。"],
    spironolactone: ["螺内酯峰与相邻杂质峰的分离度应不小于1.5。", "螺内酯峰理论塔板数≥3000。"],
    terazosin: ["特拉唑嗪峰与相邻杂质峰的分离度应不小于1.5。", "特拉唑嗪峰理论板数≥3000。"],
  }[productKey] || [];
  return {
    productKey,
    stageKey,
    displayName: `${labels[productKey] || productKey}含量`,
    unitLabel,
    sampleWeightUnit,
    formulaText,
    systemSuitabilityRows,
  };
}

function specialHplcContentFieldKey(ctx, name) {
  return `${ctx.stageKey}/content/${ctx.productKey}_hplc_content/${str(name).replace(/[\\/]/g, "_")}`;
}

function hcInput(ctx, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: specialHplcContentFieldKey(ctx, field) });
}

function lineBreakPart() {
  return { type: "br" };
}

function specialHplcContentTable(ctx, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `${ctx.displayName}${label}`,
    sourceTemplateId: `dedicated/${ctx.productKey}_${ctx.stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function specialHplcContentMeasurementMethodBlock(ctx) {
  if (ctx.productKey === "isosorbide_dinitrate" && ctx.stageKey === "packaging") {
    return {
      type: "paragraph",
      label: "硝酸异山梨酯片含量测定法",
      sourceTemplateId: `dedicated/${ctx.productKey}_${ctx.stageKey}_content`,
      parts: [
        textPart("测定法：", { bold: true }),
        textPart("精密量取上述两种溶液"),
        hcInput(ctx, "进样体积"),
        textPart("μl"),
        textPart("（20μl）"),
        textPart("，分别注入液相色谱仪，记录色谱图；按外标法以峰面积计算。即得。"),
      ],
      order: 139,
    };
  }
  return null;
}

function specialHplcContentTitleBlock(title, sectionSuffix, order = 140) {
  return {
    type: "title",
    title,
    text: title,
    sectionSuffix,
    sectionRef: "operation",
    order,
  };
}

function specialHplcContentWeighingTable(ctx) {
  const isIntermediate = ctx.stageKey === "intermediate";
  const unitWeightLabel = `平均${ctx.unitLabel}重`;
  const averageExpression = ctx.productKey === "azithromycin" && isIntermediate
    ? [
        textPart("投料量（Kg）/[批量（万粒）×10]="),
        hcInput(ctx, "投料量"),
        textPart(" / ["),
        hcInput(ctx, "批量"),
        textPart("×10] = "),
        hcInput(ctx, unitWeightLabel, { readonlyDisplay: true }),
        textPart(" g/粒"),
      ]
    : (((ctx.productKey === "atenolol" || ctx.productKey === "clarithromycin" || ctx.productKey === "verapamil" || ctx.productKey === "isosorbide_dinitrate") && ctx.stageKey === "packaging") || ctx.productKey === "azithromycin")
      ? [
          hcInput(ctx, `20${ctx.unitLabel}总重`),
          textPart(" ÷ 20 = "),
          hcInput(ctx, unitWeightLabel, { readonlyDisplay: true }),
          textPart(` g/${ctx.unitLabel}`),
        ]
      : isIntermediate
    ? [
        textPart("投料量（Kg）/[批量（万"),
        textPart(ctx.unitLabel),
        textPart("）×10]="),
        hcInput(ctx, "投料量"),
        textPart(" / ["),
        hcInput(ctx, "批量"),
        textPart("×10] = "),
        hcInput(ctx, unitWeightLabel, { readonlyDisplay: true }),
        textPart(` g/${ctx.unitLabel}`),
      ]
    : [
        textPart("("),
        hcInput(ctx, "总毛重"),
        textPart(" - "),
        hcInput(ctx, "总皮重"),
        textPart(") ÷ 20 = "),
        hcInput(ctx, unitWeightLabel, { readonlyDisplay: true }),
        textPart(` g/${ctx.unitLabel}`),
      ];
  if (ctx.productKey === "azithromycin") {
    if (!isIntermediate) {
      return specialHplcContentTable(ctx, "称重", ["14%", "17%", "11%", "58%"], [
        [
          contentCell([textPart("对照含量"), lineBreakPart(), hcInput(ctx, "对照含量"), textPart("%")], { rowspan: 2 }),
          contentCell([textPart("对照称样"), lineBreakPart(), textPart("（mg）")], { rowspan: 2 }),
          contentCell("对照 1"),
          contentCell([textPart("m1="), hcInput(ctx, "对照1-毛重"), textPart(" - "), hcInput(ctx, "对照1-皮重"), textPart(" = "), hcInput(ctx, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
        ],
        [
          contentCell("对照 2"),
          contentCell([textPart("m2="), hcInput(ctx, "对照2-毛重"), textPart(" - "), hcInput(ctx, "对照2-皮重"), textPart(" = "), hcInput(ctx, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
        ],
        [
          contentCell([textPart("样品称样"), lineBreakPart(), textPart("（g）")], { rowspan: 3 }),
          contentCell(`${ctx.unitLabel}重（g）`),
          contentCell(averageExpression, { colspan: 2 }),
        ],
        [
          contentCell("样 1"),
          contentCell([textPart("m1="), hcInput(ctx, "样1-毛重"), textPart(" - "), hcInput(ctx, "样1-皮重"), textPart(" = "), hcInput(ctx, "样1-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
        ],
        [
          contentCell("样 2"),
          contentCell([textPart("m2="), hcInput(ctx, "样2-毛重"), textPart(" - "), hcInput(ctx, "样2-皮重"), textPart(" = "), hcInput(ctx, "样2-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
        ],
      ], 140);
    }
    return specialHplcContentTable(ctx, "称重", ["21%", "17%", "12%", "50%"], [
      [
        contentCell([textPart("系统适用性"), lineBreakPart(), textPart("对照含量"), hcInput(ctx, "系统适用性对照含量"), textPart("%")]),
        contentCell("对照称样（mg）", { rowspan: 3 }),
        contentCell("对照"),
        contentCell([textPart("m="), hcInput(ctx, "系统适用性对照-毛重"), textPart(" - "), hcInput(ctx, "系统适用性对照-皮重"), textPart(" = "), hcInput(ctx, "系统适用性对照-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell([textPart("对照含量"), hcInput(ctx, "对照含量"), textPart("%")], { rowspan: 2 }),
        contentCell("对照1"),
        contentCell([textPart("m1="), hcInput(ctx, "对照1-毛重"), textPart(" - "), hcInput(ctx, "对照1-皮重"), textPart(" = "), hcInput(ctx, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell("对照2"),
        contentCell([textPart("m2="), hcInput(ctx, "对照2-毛重"), textPart(" - "), hcInput(ctx, "对照2-皮重"), textPart(" = "), hcInput(ctx, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell("样品称样（g）", { rowspan: 3 }),
        contentCell(ctx.stageKey === "intermediate" ? "理论粒重（g）" : `${ctx.unitLabel}重（g）`),
        contentCell(averageExpression, { colspan: 2 }),
      ],
      [
        contentCell("样1"),
        contentCell([textPart("m1="), hcInput(ctx, "样1-毛重"), textPart(" - "), hcInput(ctx, "样1-皮重"), textPart(" = "), hcInput(ctx, "样1-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
      ],
      [
        contentCell("样2"),
        contentCell([textPart("m2="), hcInput(ctx, "样2-毛重"), textPart(" - "), hcInput(ctx, "样2-皮重"), textPart(" = "), hcInput(ctx, "样2-净重", { readonlyDisplay: true }), textPart(" g")], { colspan: 2 }),
      ],
    ], 140);
  }
  if (ctx.productKey === "simvastatin") {
    const systemSuitabilityMassPrefix = ctx.stageKey === "intermediate" ? "m=" : "m1=";
    const systemSuitabilityMassCell = (prefix) => contentCell([
      textPart(systemSuitabilityMassPrefix),
      hcInput(ctx, `${prefix}-毛重`),
      textPart(" - "),
      hcInput(ctx, `${prefix}-皮重`),
      textPart(" = "),
      hcInput(ctx, `${prefix}-净重`, { readonlyDisplay: true }),
      textPart(" mg"),
    ]);
    return specialHplcContentTable(ctx, "称重", ["18%", "16%", "12%", "54%"], [
      [
        contentCell([textPart("对照含量："), hcInput(ctx, "系统适用性辛伐他汀对照含量"), textPart("%")]),
        contentCell("辛伐他汀对照"),
        contentCell([textPart("系统适用性")], { rowspan: 2 }),
        systemSuitabilityMassCell("系统适用性辛伐他汀对照"),
      ],
      [
        contentCell([textPart("对照含量："), hcInput(ctx, "系统适用性洛伐他汀对照含量"), textPart("%")]),
        contentCell("洛伐他汀对照"),
        systemSuitabilityMassCell("系统适用性洛伐他汀对照"),
      ],
      [
        contentCell([textPart("对照含量："), lineBreakPart(), hcInput(ctx, "对照含量"), textPart("%")], { rowspan: 2 }),
        contentCell("对照称样（mg）", { rowspan: 2 }),
        contentCell("对照 1"),
        contentCell([textPart("m1="), hcInput(ctx, "对照1-毛重"), textPart(" - "), hcInput(ctx, "对照1-皮重"), textPart(" = "), hcInput(ctx, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell("对照 2"),
        contentCell([textPart("m2="), hcInput(ctx, "对照2-毛重"), textPart(" - "), hcInput(ctx, "对照2-皮重"), textPart(" = "), hcInput(ctx, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell(`样品称样（${ctx.sampleWeightUnit}）`, { rowspan: 3 }),
        contentCell(ctx.stageKey === "intermediate" ? `理论${ctx.unitLabel}重（g）` : `${ctx.unitLabel}重（g）`),
        contentCell(averageExpression, { colspan: 2 }),
      ],
      [
        contentCell("样1"),
        contentCell([hcInput(ctx, "样1-毛重"), textPart(" - "), hcInput(ctx, "样1-皮重"), textPart(" = "), hcInput(ctx, "样1-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { colspan: 2 }),
      ],
      [
        contentCell("样2"),
        contentCell([hcInput(ctx, "样2-毛重"), textPart(" - "), hcInput(ctx, "样2-皮重"), textPart(" = "), hcInput(ctx, "样2-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { colspan: 2 }),
      ],
    ], 140);
  }
  return specialHplcContentTable(ctx, "称重", ["18%", "18%", "18%", "46%"], [
    [
      contentCell([textPart("对照含量"), lineBreakPart(), hcInput(ctx, "对照含量"), textPart("%")], { rowspan: 2 }),
      contentCell("对照称样（mg）", { rowspan: 2 }),
      contentCell("对照1"),
      contentCell([textPart("m1="), hcInput(ctx, "对照1-毛重"), textPart(" - "), hcInput(ctx, "对照1-皮重"), textPart(" = "), hcInput(ctx, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
    ],
    [
      contentCell("对照2"),
      contentCell([textPart("m2="), hcInput(ctx, "对照2-毛重"), textPart(" - "), hcInput(ctx, "对照2-皮重"), textPart(" = "), hcInput(ctx, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
    ],
    [
      contentCell(`样品称样（${ctx.sampleWeightUnit}）`, { rowspan: 3 }),
      contentCell(ctx.stageKey === "intermediate" ? `理论${ctx.unitLabel}重（g）` : `${ctx.unitLabel}重（g）`),
      contentCell(averageExpression, { colspan: 2 }),
    ],
    [
      contentCell("样1"),
      contentCell([hcInput(ctx, "样1-毛重"), textPart(" - "), hcInput(ctx, "样1-皮重"), textPart(" = "), hcInput(ctx, "样1-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { colspan: 2 }),
    ],
    [
      contentCell("样2"),
      contentCell([hcInput(ctx, "样2-毛重"), textPart(" - "), hcInput(ctx, "样2-皮重"), textPart(" = "), hcInput(ctx, "样2-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { colspan: 2 }),
    ],
  ], 140);
}

function specialHplcContentMeasurementBlocks(ctx) {
  return [
    specialHplcContentTable(ctx, "测定与计算", ["18%", "16%", "16%", "14%", "14%", "11%", "11%"], [
      ...(ctx.systemSuitabilityRows.length ? [
        [contentCell("系统适用性", { rowspan: ctx.systemSuitabilityRows.length + 1 }), contentCell("项目", { colspan: 4 }), contentCell("是否符合规定", { colspan: 2 })],
        ...ctx.systemSuitabilityRows.map((text, index) => [
          contentCell(text, { colspan: 4 }),
          contentCell([{ type: "radio", fieldKey: specialHplcContentFieldKey(ctx, `系统适用性${index + 1}`), options: ["是", "否"] }], { colspan: 2 }),
        ]),
      ] : []),
      [contentCell("对照品计算", { colspan: 7, bold: true, align: "center" })],
      [contentCell("名称"), contentCell("峰面积（Ar）", { colspan: 2 }), contentCell("Ar/mg"), contentCell("平均（Ar/mg）", { colspan: 2 }), contentCell("RSD≤2.0%")],
      [contentCell([textPart("对照1："), hcInput(ctx, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")], { rowspan: 3 }), contentCell([hcInput(ctx, "对照1-峰面积1")], { colspan: 2 }), contentCell([hcInput(ctx, "对照1-单位峰面积1", { readonlyDisplay: true })]), contentCell([hcInput(ctx, "对照平均单位峰面积", { readonlyDisplay: true })], { colspan: 2, rowspan: 5 }), contentCell([hcInput(ctx, "对照RSD", { readonlyDisplay: true }), textPart("%")], { rowspan: 5 })],
      [contentCell([hcInput(ctx, "对照1-峰面积2")], { colspan: 2 }), contentCell([hcInput(ctx, "对照1-单位峰面积2", { readonlyDisplay: true })])],
      [contentCell([hcInput(ctx, "对照1-峰面积3")], { colspan: 2 }), contentCell([hcInput(ctx, "对照1-单位峰面积3", { readonlyDisplay: true })])],
      [contentCell([textPart("对照2："), hcInput(ctx, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")], { rowspan: 2 }), contentCell([hcInput(ctx, "对照2-峰面积1")], { colspan: 2 }), contentCell([hcInput(ctx, "对照2-单位峰面积1", { readonlyDisplay: true })])],
      [contentCell([hcInput(ctx, "对照2-峰面积2")], { colspan: 2 }), contentCell([hcInput(ctx, "对照2-单位峰面积2", { readonlyDisplay: true })])],
      [contentCell("供试品计算", { colspan: 7, bold: true, align: "left" })],
      [contentCell("计算公式", { rowspan: 2 }), contentCell("含量（CX）=（CR×AX）/AR", { colspan: 6, align: "left" })],
      [contentCell(ctx.formulaText, { colspan: 6, align: "left" })],
      [contentCell("名称"), contentCell("峰面积（Ar）"), contentCell("平均（Ar）"), contentCell("RD≤2.0%"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("RD≤2.0%")],
      [contentCell([textPart("供试品样1："), hcInput(ctx, "样1-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { rowspan: 2 }), contentCell([hcInput(ctx, "样1-峰面积1")]), contentCell([hcInput(ctx, "样1-平均峰面积", { readonlyDisplay: true })], { rowspan: 2 }), contentCell([hcInput(ctx, "样1-RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([hcInput(ctx, "样1-含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([hcInput(ctx, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 4 }), contentCell([hcInput(ctx, "RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 4 })],
      [contentCell([hcInput(ctx, "样1-峰面积2")])],
      [contentCell([textPart("供试品样2："), hcInput(ctx, "样2-净重", { readonlyDisplay: true }), textPart(` ${ctx.sampleWeightUnit}`)], { rowspan: 2 }), contentCell([hcInput(ctx, "样2-峰面积1")]), contentCell([hcInput(ctx, "样2-平均峰面积", { readonlyDisplay: true })], { rowspan: 2 }), contentCell([hcInput(ctx, "样2-RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([hcInput(ctx, "样2-含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
      [contentCell([hcInput(ctx, "样2-峰面积2")])],
    ], 150),
  ];
}

function specialHplcContentLayoutBlocks(productKey, stageKey) {
  const ctx = specialHplcContentContext(productKey, stageKey);
  return [
    specialHplcContentWeighingTable(ctx),
    ...specialHplcContentMeasurementBlocks(ctx),
  ];
}

function azithromycinFinishedContentReferenceBlocks() {
  const ctx = specialHplcContentContext("azithromycin", "finished");
  return [
    {
      type: "paragraph",
      label: "阿奇霉素成品含量待包装品引用",
      sourceTemplateId: "dedicated/azithromycin_finished_content_reference",
      parts: [
        textPart("检验数据及计算过程见待包装品（二）2.3.5.2项下。"),
      ],
      order: 145,
    },
    specialHplcContentTable(ctx, "待包装品引用汇总", ["29%", "35.5%", "35.5%"], [
      [contentCell("样品含量（%）"), contentCell("平均含量（%）"), contentCell("RD 应≤2.0%")],
      [
        contentCell([textPart("样1："), hcInput(ctx, "样1-含量", { readonlyDisplay: true }), textPart("%")], { align: "left" }),
        contentCell([textPart("X="), hcInput(ctx, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
        contentCell([textPart("RD="), hcInput(ctx, "RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell([textPart("样2："), hcInput(ctx, "样2-含量", { readonlyDisplay: true }), textPart("%")], { align: "left" }),
      ],
    ], 146),
  ];
}

function normalizeAzithromycinFinishedContentCopiedLayoutBlocks(blocks) {
  const referenceBlocks = azithromycinFinishedContentReferenceBlocks();
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const title = str(data.title || data.text);
    const label = str(data.label);
    return (
      (str(data.type) === "title" && /^(称重|测定与计算)$/.test(title))
      || label === "阿奇霉素含量测定法"
      || label === "阿奇霉素胶囊含量称重"
      || label === "阿奇霉素胶囊含量测定与计算"
      || label === "阿奇霉素胶囊含量对照品计算"
      || label === "阿奇霉素胶囊含量供试品计算"
    );
  };
  const output = [];
  for (const block of arr(blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) output.splice(Math.max(1, output.length - 1), 0, ...referenceBlocks);
  return output;
}

const SIMPLE_FINISHED_CONTENT_REFERENCE_SUMMARY_FILES = new Set([
  "items/allopurinol_finished_content.json",
  "items/atenolol_finished_content.json",
  "items/clarithromycin_finished_content.json",
  "items/diammonium_glycyrrhizinate_finished_content.json",
  "items/hydrochlorothiazide_finished_content.json",
  "items/isosorbide_dinitrate_finished_content.json",
  "items/levofloxacin_finished_content.json",
  "items/pantoprazole_finished_content.json",
  "items/simvastatin_finished_content.json",
  "items/spironolactone_finished_content.json",
  "items/terazosin_finished_content.json",
  "items/verapamil_finished_content.json",
]);

function methodFieldFor(test, name) {
  for (const group of arr(rec(test).method_groups)) {
    for (const field of arr(rec(group).fields)) {
      const data = rec(field);
      if (str(data.name) === name) return data;
    }
  }
  return {};
}

function copiedSummaryInput(test, field, options = {}) {
  const methodField = methodFieldFor(test, field);
  return inputPart(field, {
    ...options,
    fieldKey: str(methodField.field_key) || undefined,
    readonlyDisplay: true,
  });
}

function finishedContentReferencePhrase(test) {
  const phrase = str(arr(rec(test).packaging_reference_phrases)[0]);
  return phrase || "检验数据及计算过程见待包装品项下。";
}

function finishedContentReferenceSummaryBlocks(test) {
  const isSimvastatinFinishedContent = str(rec(test).file) === "items/simvastatin_finished_content.json";
  const summaryHeader = isSimvastatinFinishedContent
    ? ["含量（%）", "平均（%）", "RD≤2.0%"]
    : ["样品含量（%）", "平均含量（%）", "RD 应≤2.0%"];
  const sampleLabels = isSimvastatinFinishedContent ? ["1、", "2、"] : ["样 1：", "样 2："];
  return [
    {
      type: "paragraph",
      label: "成品含量待包装品引用",
      sourceTemplateId: "dedicated/finished_content_reference_summary",
      parts: [textPart(finishedContentReferencePhrase(test))],
      order: 145,
    },
    {
      type: "table",
      label: "成品含量待包装品引用汇总",
      sourceTemplateId: "dedicated/finished_content_reference_summary",
      compactTable: true,
      columnWidths: ["29%", "35.5%", "35.5%"],
      rows: [
        summaryHeader.map((text) => contentCell(text)),
        [
          contentCell([textPart(sampleLabels[0]), copiedSummaryInput(test, "样1-含量"), textPart("%")], { align: "left" }),
          contentCell([textPart("X="), copiedSummaryInput(test, "平均含量"), textPart("%")], { rowspan: 2 }),
          contentCell([textPart("RD="), copiedSummaryInput(test, "RD"), textPart("%")], { rowspan: 2 }),
        ],
        [
          contentCell([textPart(sampleLabels[1]), copiedSummaryInput(test, "样2-含量"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeSimpleFinishedContentReferenceLayoutBlocks(test) {
  const referenceBlocks = finishedContentReferenceSummaryBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const title = str(data.title || data.text);
    const label = str(data.label);
    if (str(data.type) === "title" && /^(称重|称样|测定与计算|计算)$/.test(title)) return true;
    if (str(data.type) === "sectioned_operation_steps") return true;
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && /(?:含量|测定|称重|称样|计算|吸光度|系统适用性|对照品|供试品)/.test(label)) return true;
    if (str(data.type) === "paragraph" && /含量测定法$/.test(label)) return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function berberineFinishedContentReferenceSummaryBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "鞣酸小檗碱片成品含量待包装品引用",
      sourceTemplateId: "dedicated/berberine_tannate_finished_content_reference_summary",
      parts: [textPart(finishedContentReferencePhrase(test))],
      order: 145,
    },
    {
      type: "table",
      label: "鞣酸小檗碱片成品含量待包装品引用汇总",
      sourceTemplateId: "dedicated/berberine_tannate_finished_content_reference_summary",
      compactTable: true,
      columnWidths: ["15%", "16%", "16%", "16%", "19%", "18%"],
      rows: [
        [
          contentCell("名称"),
          contentCell("称重"),
          contentCell("样品 OD"),
          contentCell("含量（%）"),
          contentCell("平均（%）"),
          contentCell("RD≤2.0%"),
        ],
        [
          contentCell("供试品样 1"),
          contentCell([copiedSummaryInput(test, "样1-净重"), textPart("mg")]),
          contentCell([copiedSummaryInput(test, "样1-OD")]),
          contentCell([copiedSummaryInput(test, "样1-含量"), textPart("%")]),
          contentCell([copiedSummaryInput(test, "平均含量"), textPart("%")], { rowspan: 2 }),
          contentCell([copiedSummaryInput(test, "RD"), textPart("%")], { rowspan: 2 }),
        ],
        [
          contentCell("供试品样 2"),
          contentCell([copiedSummaryInput(test, "样2-净重"), textPart("mg")]),
          contentCell([copiedSummaryInput(test, "样2-OD")]),
          contentCell([copiedSummaryInput(test, "样2-含量"), textPart("%")]),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeBerberineFinishedContentReferenceLayoutBlocks(test) {
  const referenceBlocks = berberineFinishedContentReferenceSummaryBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const title = str(data.title || data.text);
    const label = str(data.label);
    if (str(data.type) === "title" && /^(称重|测定与计算)$/.test(title)) return true;
    if (str(data.type) === "sectioned_operation_steps") return true;
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && /鞣酸小檗碱片成品含量(?:称重|测定与计算|对照品计算|供试品计算|结果计算)/.test(label)) return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function berberineIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "berberine_tannate" && stageKey === "finished" && testKeyValue === "identification";
}

function berberineIdentificationFieldKey(name) {
  return `finished/identification/berberine_tannate/${str(name).replace(/[\\/]/g, "_")}`;
}

function berberineIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: berberineIdentificationFieldKey(name), width: str(options.width) || "4.5em" });
}

function berberineIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function berberineIdentificationOperationDetailBlock() {
  return {
    type: "paragraph",
    label: "鞣酸小檗碱片成品鉴别反应",
    sourceTemplateId: "dedicated/berberine_tannate_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      berberineIdentificationHeading("4.1"),
      textPart(" 取滤液"),
      berberineIdentificationInput("2.2.4.1-滤液体积", { width: "4em" }),
      textPart("ml（1ml），滴加三氯化铁试液"),
      berberineIdentificationInput("2.2.4.1-三氯化铁试液体积", { width: "4em" }),
      textPart("ml（0.5ml），溶液即呈"),
      berberineIdentificationInput("2.2.4.1-呈色结果", { width: "8em" }),
      textPart("（褐绿色）。"),
      { type: "br" },
      berberineIdentificationHeading("4.2"),
      textPart(" 取滤液"),
      berberineIdentificationInput("2.2.4.2-滤液体积", { width: "4em" }),
      textPart("ml（1ml），滴加碘化钾试液"),
      berberineIdentificationInput("2.2.4.2-碘化钾试液体积", { width: "4em" }),
      textPart("ml（0.5ml），即生成"),
      berberineIdentificationInput("2.2.4.2-沉淀结果", { width: "8em" }),
      textPart("（黄色沉淀）。"),
      { type: "br" },
      berberineIdentificationHeading("4.3"),
      textPart(" 取滤液"),
      berberineIdentificationInput("2.2.4.3-滤液体积", { width: "4em" }),
      textPart("ml（2ml），加盐酸"),
      berberineIdentificationInput("2.2.4.3-盐酸体积", { width: "4em" }),
      textPart("ml（2ml），滴加1%过氧化氢试液"),
      berberineIdentificationInput("2.2.4.3-过氧化氢试液体积", { width: "4em" }),
      textPart("ml（0.5ml），放置，溶液呈"),
      berberineIdentificationInput("2.2.4.3-呈色结果", { width: "8em" }),
      textPart("（红色）。"),
    ],
  };
}

function berberineIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = berberineIdentificationOperationDetailBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isMisclassifiedReactionHeading = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[123]$/.test(str(rec(part).sectionSuffix)));
    if (isMisclassifiedReactionHeading) continue;
    output.push(block);
    if (!inserted && str(data.label) === "md_operation_method") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function berberineIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-滤液体积", "number", "ml"],
    ["2.2.4.1-三氯化铁试液体积", "number", "ml"],
    ["2.2.4.1-呈色结果", "text", ""],
    ["2.2.4.2-滤液体积", "number", "ml"],
    ["2.2.4.2-碘化钾试液体积", "number", "ml"],
    ["2.2.4.2-沉淀结果", "text", ""],
    ["2.2.4.3-滤液体积", "number", "ml"],
    ["2.2.4.3-盐酸体积", "number", "ml"],
    ["2.2.4.3-过氧化氢试液体积", "number", "ml"],
    ["2.2.4.3-呈色结果", "text", ""],
  ];
  return {
    name: "鞣酸小檗碱片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, berberineIdentificationFieldKey(name), "fillable", "", {
      group: "鞣酸小檗碱片成品鉴别",
      type,
      unit,
    })),
  };
}

function compoundRutinIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "compound_rutin" && stageKey === "finished" && testKeyValue === "identification";
}

function compoundRutinIdentificationFieldKey(name) {
  return `finished/identification/compound_rutin/${str(name).replace(/[\\/]/g, "_")}`;
}

function compoundRutinIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: compoundRutinIdentificationFieldKey(name), width: str(options.width) || "4.5em" });
}

function compoundRutinIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function compoundRutinIdentificationOperationBlock() {
  return {
    type: "paragraph",
    label: "复方芦丁片成品鉴别反应",
    sourceTemplateId: "dedicated/compound_rutin_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      compoundRutinIdentificationHeading("4.1"),
      textPart(" ①取本品细粉"),
      compoundRutinIdentificationInput("2.2.4.1-①取样量"),
      textPart("g（0.1g），加氢氧化钠试液"),
      compoundRutinIdentificationInput("2.2.4.1-氢氧化钠试液体积", { width: "4em" }),
      textPart("ml（5ml），溶液显"),
      compoundRutinIdentificationInput("2.2.4.1-①显色结果", { width: "8em" }),
      textPart("。"),
      { type: "br" },
      textPart("②取本品细粉"),
      compoundRutinIdentificationInput("2.2.4.1-②取样量"),
      textPart("g（0.1g），加乙醇"),
      compoundRutinIdentificationInput("2.2.4.1-乙醇体积", { width: "4em" }),
      textPart("ml（15ml），微热使芦丁溶解，溶液分成二份；一份中加盐酸"),
      compoundRutinIdentificationInput("2.2.4.1-盐酸体积", { width: "4em" }),
      textPart("ml（1ml）与金属锌"),
      compoundRutinIdentificationInput("2.2.4.1-金属锌粒数", { width: "4em" }),
      textPart("粒（3粒），渐显"),
      compoundRutinIdentificationInput("2.2.4.1-②显色结果", { width: "8em" }),
      textPart("；另一份中加三氯化铁试液"),
      compoundRutinIdentificationInput("2.2.4.1-三氯化铁试液滴数", { width: "4em" }),
      textPart("滴（1滴），显"),
      compoundRutinIdentificationInput("2.2.4.1-③显色结果", { width: "8em" }),
      textPart("。"),
      { type: "br" },
      compoundRutinIdentificationHeading("4.2"),
      textPart(" 取本品细粉"),
      compoundRutinIdentificationInput("2.2.4.2-取样量", { width: "4em" }),
      textPart("mg（约相当于维生素20mg），加水"),
      compoundRutinIdentificationInput("2.2.4.2-水体积", { width: "4em" }),
      textPart("ml（5ml）使维生素C溶解后，滤过，滤液中加碱性酒石酸铜试液"),
      compoundRutinIdentificationInput("2.2.4.2-碱性酒石酸铜试液体积", { width: "4em" }),
      textPart("ml（1ml），加热，即产生"),
      compoundRutinIdentificationInput("2.2.4.2-反应结果", { width: "8em" }),
      textPart("。"),
    ],
  };
}

function compoundRutinIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = compoundRutinIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isMisclassifiedReactionHeading = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[12]$/.test(str(rec(part).sectionSuffix)));
    if (isMisclassifiedReactionHeading) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function compoundRutinIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-①取样量", "number", "g"],
    ["2.2.4.1-氢氧化钠试液体积", "number", "ml"],
    ["2.2.4.1-①显色结果", "text", ""],
    ["2.2.4.1-②取样量", "number", "g"],
    ["2.2.4.1-乙醇体积", "number", "ml"],
    ["2.2.4.1-盐酸体积", "number", "ml"],
    ["2.2.4.1-金属锌粒数", "number", "粒"],
    ["2.2.4.1-②显色结果", "text", ""],
    ["2.2.4.1-三氯化铁试液滴数", "number", "滴"],
    ["2.2.4.1-③显色结果", "text", ""],
    ["2.2.4.2-取样量", "number", "mg"],
    ["2.2.4.2-水体积", "number", "ml"],
    ["2.2.4.2-碱性酒石酸铜试液体积", "number", "ml"],
    ["2.2.4.2-反应结果", "text", ""],
  ];
  return {
    name: "复方芦丁片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, compoundRutinIdentificationFieldKey(name), "fillable", "", {
      group: "复方芦丁片成品鉴别",
      type,
      unit,
    })),
  };
}

function verapamilIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "verapamil" && stageKey === "finished" && testKeyValue === "identification";
}

function pantoprazoleIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "pantoprazole" && stageKey === "finished" && testKeyValue === "identification";
}

function pantoprazoleIdentificationFieldKey(name) {
  return `finished/identification/pantoprazole/${str(name).replace(/[\\/]/g, "_")}`;
}

function pantoprazoleIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: pantoprazoleIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function pantoprazoleIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function pantoprazoleIdentificationOperationBlock() {
  return {
    type: "paragraph",
    label: "泮托拉唑钠肠溶片成品鉴别反应",
    sourceTemplateId: "dedicated/pantoprazole_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      pantoprazoleIdentificationHeading("4.1"),
      textPart(" 取本品，除去薄膜衣，研细，取细粉"),
      pantoprazoleIdentificationInput("2.2.4.1-取样量", { width: "5.5em" }),
      textPart("（约相当于泮托拉唑10mg），加水"),
      pantoprazoleIdentificationInput("2.2.4.1-水体积", { width: "4em" }),
      textPart("ml（20ml），振摇使泮托拉唑钠溶解，滤过，取滤液"),
      pantoprazoleIdentificationInput("2.2.4.1-滤液体积", { width: "4em" }),
      textPart("ml（2ml），加稀盐酸"),
      pantoprazoleIdentificationInput("2.2.4.1-稀盐酸滴数", { width: "4em" }),
      textPart("滴（5滴），滴加硅钨酸试液，即产生"),
      pantoprazoleIdentificationInput("2.2.4.1-反应结果", { width: "8em" }),
      textPart("。"),
      { type: "br" },
      pantoprazoleIdentificationHeading("4.2"),
      textPart(" 取含量测定项下的溶液，照分光光度法（通则0401）在"),
      pantoprazoleIdentificationInput("2.2.4.2-最大吸收波长", { width: "4em" }),
      textPart("nm（292nm±2nm）的波长处有最大吸收，在"),
      pantoprazoleIdentificationInput("2.2.4.2-最小吸收波长", { width: "4em" }),
      textPart("nm（250nm±2nm）的波长处有最小吸收。"),
    ],
  };
}

function pantoprazoleIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = pantoprazoleIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[12]$/.test(str(rec(part).sectionSuffix)));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function pantoprazoleIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-取样量", "number", "mg"],
    ["2.2.4.1-水体积", "number", "ml"],
    ["2.2.4.1-滤液体积", "number", "ml"],
    ["2.2.4.1-稀盐酸滴数", "number", "滴"],
    ["2.2.4.1-反应结果", "text", ""],
    ["2.2.4.2-最大吸收波长", "number", "nm"],
    ["2.2.4.2-最小吸收波长", "number", "nm"],
  ];
  return {
    name: "泮托拉唑钠肠溶片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, pantoprazoleIdentificationFieldKey(name), "fillable", "", {
      group: "泮托拉唑钠肠溶片成品鉴别",
      type,
      unit,
    })),
  };
}

function methimazoleIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "methimazole" && stageKey === "finished" && testKeyValue === "identification";
}

function methimazoleIdentificationFieldKey(name) {
  return `finished/identification/methimazole/${str(name).replace(/[\\/]/g, "_")}`;
}

function methimazoleIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: methimazoleIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function methimazoleIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function methimazoleIdentificationOperationBlock() {
  return {
    type: "paragraph",
    label: "甲巯咪唑片成品鉴别反应",
    sourceTemplateId: "dedicated/methimazole_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      methimazoleIdentificationHeading("4.1"),
      textPart(" 取本品"),
      methimazoleIdentificationInput("2.2.4.1-取样片数", { width: "4em" }),
      textPart("片（2片），加热乙醇"),
      methimazoleIdentificationInput("2.2.4.1-乙醇体积", { width: "4em" }),
      textPart("ml（10ml），研磨"),
      methimazoleIdentificationInput("2.2.4.1-研磨时间", { width: "4em" }),
      textPart("分钟（10分钟），滤过，滤液置水浴上蒸干，加水"),
      methimazoleIdentificationInput("2.2.4.1-水体积", { width: "4em" }),
      textPart("ml（5ml）溶解，量取"),
      methimazoleIdentificationInput("2.2.4.1-量取体积", { width: "4em" }),
      textPart("ml（1ml）置10ml试管中，加氢氧化钠试液"),
      methimazoleIdentificationInput("2.2.4.1-氢氧化钠试液体积", { width: "4em" }),
      textPart("ml（1ml），摇匀，滴加亚硝基铁氰化钠试液"),
      methimazoleIdentificationInput("2.2.4.1-亚硝基铁氰化钠试液滴数", { width: "4em" }),
      textPart("滴（3滴），即显"),
      methimazoleIdentificationInput("2.2.4.1-初始显色", { width: "5em" }),
      textPart("色（黄色）；"),
      methimazoleIdentificationInput("2.2.4.1-转色时间", { width: "4em" }),
      textPart("分钟（1～5分钟）后，转为"),
      methimazoleIdentificationInput("2.2.4.1-转色结果", { width: "6em" }),
      textPart("（黄绿色或绿色）；再加醋酸"),
      methimazoleIdentificationInput("2.2.4.1-醋酸体积", { width: "4em" }),
      textPart("ml（1ml），即呈"),
      methimazoleIdentificationInput("2.2.4.1-最终呈色", { width: "5em" }),
      textPart("（蓝色）。"),
      { type: "br" },
      methimazoleIdentificationHeading("4.2"),
      textPart(" 取含量均匀度项下的供试品溶液，照紫外-可见分光光度法（通则0401）测定，在"),
      methimazoleIdentificationInput("2.2.4.2-最大吸收波长", { width: "4em" }),
      textPart("nm（252nm±2nm）的波长处有最大吸收。"),
    ],
  };
}

function methimazoleIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = methimazoleIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[12]$/.test(str(rec(part).sectionSuffix)));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function methimazoleIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-取样片数", "number", "片"],
    ["2.2.4.1-乙醇体积", "number", "ml"],
    ["2.2.4.1-研磨时间", "number", "分钟"],
    ["2.2.4.1-水体积", "number", "ml"],
    ["2.2.4.1-量取体积", "number", "ml"],
    ["2.2.4.1-氢氧化钠试液体积", "number", "ml"],
    ["2.2.4.1-亚硝基铁氰化钠试液滴数", "number", "滴"],
    ["2.2.4.1-初始显色", "text", ""],
    ["2.2.4.1-转色时间", "number", "分钟"],
    ["2.2.4.1-转色结果", "text", ""],
    ["2.2.4.1-醋酸体积", "number", "ml"],
    ["2.2.4.1-最终呈色", "text", ""],
    ["2.2.4.2-最大吸收波长", "number", "nm"],
  ];
  return {
    name: "甲巯咪唑片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, methimazoleIdentificationFieldKey(name), "fillable", "", {
      group: "甲巯咪唑片成品鉴别",
      type,
      unit,
    })),
  };
}

function levofloxacinIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "levofloxacin" && stageKey === "finished" && testKeyValue === "identification";
}

function levofloxacinIdentificationFieldKey(name) {
  return `finished/identification/levofloxacin/${str(name).replace(/[\\/]/g, "_")}`;
}

function levofloxacinIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: levofloxacinIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function levofloxacinIdentificationHeading(sectionSuffix) {
  return textPart(`2.1.${sectionSuffix}`, { bold: true });
}

function levofloxacinIdentificationOperationBlocks() {
  const input = levofloxacinIdentificationInput;
  return [
    {
      type: "paragraph",
      label: "盐酸左氧氟沙星胶囊成品鉴别操作方法",
      sourceTemplateId: "dedicated/levofloxacin_finished_identification",
      order: 136,
      moduleOrder: 15,
      parts: [
        levofloxacinIdentificationHeading("5.1"),
        textPart(" 取本品的内容物适量"),
        input("2.1.5.1-内容物取样量", { width: "4.6em" }),
        textPart("mg（约相当于左氧氟沙星10mg），置干燥具塞试管中，加丙二酸"),
        input("2.1.5.1-丙二酸取样量", { width: "4.6em" }),
        textPart("mg（约10mg）与醋酐"),
        input("2.1.5.1-醋酐体积", { width: "4.2em" }),
        textPart("ml（0.5ml），在水浴中加热5～10分钟，溶液显"),
        input("2.1.5.1-显色结果", { width: "6em" }),
        textPart("（红棕色）。"),
        { type: "br" },
        levofloxacinIdentificationHeading("5.2"),
        textPart(" 色谱条件：用十八烷基硅烷键合硅胶为填充剂；色谱柱：C18×"),
        input("2.1.5.2-色谱柱长度", { width: "4.4em" }),
        textPart("mm×4.6mm；以硫酸铜D－苯丙氨酸溶液（取D-苯丙氨酸1.32g与硫酸铜1g，加水1000ml溶解后，用氢氧化钠试液调节PH值至3.5）－甲醇（82:18）为流动相；柱温为40℃；检测波长为"),
        input("2.1.5.2-检测波长", { width: "4.4em" }),
        textPart("nm（294nm）；进样体积20μl。"),
        { type: "br" },
        textPart("供试品溶液：精密称取本品"),
        input("2.1.5.2-供试品称取量", { width: "4.6em" }),
        textPart("mg（约相当于左氧氟沙星10mg）置"),
        input("2.1.5.2-供试品量瓶1", { width: "4.2em" }),
        textPart("ml（100ml）量瓶中，加流动相溶解并稀释至刻度，摇匀，制成每1ml中约含左氧氟沙星0.1mg的溶液，滤过，再精密量取续滤液"),
        input("2.1.5.2-供试品续滤液体积", { width: "4.2em" }),
        textPart("ml（5ml）置"),
        input("2.1.5.2-供试品量瓶2", { width: "4.2em" }),
        textPart("ml（50ml）量瓶中，加流动相溶解并稀释至刻度，摇匀，制成每1ml中约含左氧氟沙星0.01mg的溶液，作为供试品溶液。"),
        { type: "br" },
        textPart("对照品溶液：精密称取氧氟沙星对照品"),
        input("2.1.5.2-对照品称取量", { width: "4.6em" }),
        textPart("mg（约10mg）置"),
        input("2.1.5.2-对照品量瓶1", { width: "4.2em" }),
        textPart("ml（100ml）量瓶中，用0.1mol/L盐酸溶液溶解并稀释至刻度，摇匀，再精密量取"),
        input("2.1.5.2-对照品移取量", { width: "4.2em" }),
        textPart("ml（2ml）置"),
        input("2.1.5.2-对照品量瓶2", { width: "4.2em" }),
        textPart("ml（10ml）量瓶中，用0.1mol/L盐酸溶液稀释至刻度，摇匀，作为对照品溶液。"),
        { type: "br" },
        textPart("测定法：精密量取对照品溶液、供试品溶液，分别注入液相色谱仪，记录色谱图。"),
      ],
    },
    levofloxacinIdentificationMeasurementTable(),
    {
      type: "paragraph",
      label: "盐酸左氧氟沙星胶囊成品氯化物鉴别",
      sourceTemplateId: "dedicated/levofloxacin_finished_identification",
      order: 152,
      moduleOrder: 15,
      parts: [
        levofloxacinIdentificationHeading("5.3"),
        textPart(" 取本品内容物"),
        input("2.1.5.3-内容物取样量", { width: "4.6em" }),
        textPart("g（约含左氧氟沙星0.1g）置"),
        input("2.1.5.3-量瓶体积", { width: "4.2em" }),
        textPart("ml（20ml）量瓶中，加水适量振摇使溶解，并用水稀释至刻度，滤过；取续滤液"),
        input("2.1.5.3-续滤液体积", { width: "4.2em" }),
        textPart("ml（5ml）置10ml试管中，加稀硝酸"),
        input("2.1.5.3-稀硝酸滴数", { width: "4.2em" }),
        textPart("滴（3～5滴）使成酸性，加硝酸银试液"),
        input("2.1.5.3-硝酸银试液体积", { width: "4.2em" }),
        textPart("ml（0.5ml），即生成"),
        input("2.1.5.3-沉淀结果", { width: "7em" }),
        textPart("（白色凝乳状沉淀）；离心，分离，取沉淀加氨试液"),
        input("2.1.5.3-氨试液体积", { width: "4.2em" }),
        textPart("ml即"),
        input("2.1.5.3-溶解结果", { width: "6em" }),
        textPart("（溶解），再加稀硝酸"),
        input("2.1.5.3-稀硝酸体积", { width: "4.2em" }),
        textPart("ml（0.5ml）酸化后"),
        input("2.1.5.3-复沉淀结果", { width: "7em" }),
        textPart("（沉淀复生成）。"),
      ],
    },
  ];
}

function levofloxacinIdentificationMeasurementTable() {
  const input = levofloxacinIdentificationInput;
  return {
    type: "table",
    label: "盐酸左氧氟沙星胶囊成品鉴别称样与测定结果",
    sourceTemplateId: "dedicated/levofloxacin_finished_identification",
    compactTable: true,
    columnWidths: ["22%", "28%", "50%"],
    rows: [
      [contentCell("称样", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("氧氟沙星对照品（mg）"),
        contentCell([
          textPart("m="),
          input("2.1.5.2-对照品毛重"),
          textPart(" - "),
          input("2.1.5.2-对照品皮重"),
          textPart(" = "),
          input("2.1.5.2-对照品净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("供试品（mg）"),
        contentCell([
          textPart("m="),
          input("2.1.5.2-供试品毛重"),
          textPart(" - "),
          input("2.1.5.2-供试品皮重"),
          textPart(" = "),
          input("2.1.5.2-供试品净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 2 }),
      ],
      [contentCell("测定结果与计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("结果", { rowspan: 3 }),
        contentCell("对照溶液主峰中左氧氟沙星（后）保留时间 T:"),
        contentCell([input("2.1.5.2-对照保留时间", { width: "6em" })]),
      ],
      [
        contentCell("供试品溶液主峰的保留时间 T:"),
        contentCell([input("2.1.5.2-供试品保留时间", { width: "6em" })]),
      ],
      [
        contentCell([
          textPart("供试品溶液主峰的保留时间与对照品溶液主峰中左氧氟沙星（后）的保留时间"),
          input("2.1.5.2-保留时间一致结果", { width: "6em" }),
          textPart("。"),
        ], { colspan: 2, align: "left" }),
      ],
    ],
    order: 145,
  };
}

function levofloxacinIdentificationLayoutBlocks(layoutBlocks) {
  const dedicatedBlocks = levofloxacinIdentificationOperationBlocks();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name || rec(part).defaultValue)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && (arr(data.parts).some((part) => {
        const partData = rec(part);
        return str(partData.type) === "section_heading" && /^5\.[123]$/.test(str(partData.sectionSuffix));
      }) || /色谱条件|左氧氟沙星|丙二酸|氧氟沙星对照品/.test(partsText));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(...dedicatedBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, ...dedicatedBlocks);
  }
  return output;
}

function levofloxacinIdentificationMethodGroup() {
  const fields = [];
  const add = (name, attr = "fillable", formula = "", extra = {}) => fields.push(methodField(
    name,
    levofloxacinIdentificationFieldKey(name),
    attr,
    formula,
    { group: "盐酸左氧氟沙星胶囊成品鉴别", ...extra },
  ));
  [
    ["2.1.5.1-内容物取样量", "number", "mg"],
    ["2.1.5.1-丙二酸取样量", "number", "mg"],
    ["2.1.5.1-醋酐体积", "number", "ml"],
    ["2.1.5.1-显色结果", "text", ""],
    ["2.1.5.2-色谱柱长度", "number", "mm"],
    ["2.1.5.2-检测波长", "number", "nm"],
    ["2.1.5.2-供试品称取量", "number", "mg"],
    ["2.1.5.2-供试品量瓶1", "number", "ml"],
    ["2.1.5.2-供试品续滤液体积", "number", "ml"],
    ["2.1.5.2-供试品量瓶2", "number", "ml"],
    ["2.1.5.2-对照品称取量", "number", "mg"],
    ["2.1.5.2-对照品量瓶1", "number", "ml"],
    ["2.1.5.2-对照品移取量", "number", "ml"],
    ["2.1.5.2-对照品量瓶2", "number", "ml"],
    ["2.1.5.2-对照品毛重", "number", "mg"],
    ["2.1.5.2-对照品皮重", "number", "mg"],
    ["2.1.5.2-供试品毛重", "number", "mg"],
    ["2.1.5.2-供试品皮重", "number", "mg"],
    ["2.1.5.2-对照保留时间", "number", ""],
    ["2.1.5.2-供试品保留时间", "number", ""],
    ["2.1.5.2-保留时间一致结果", "text", ""],
    ["2.1.5.3-内容物取样量", "number", "g"],
    ["2.1.5.3-量瓶体积", "number", "ml"],
    ["2.1.5.3-续滤液体积", "number", "ml"],
    ["2.1.5.3-稀硝酸滴数", "number", "滴"],
    ["2.1.5.3-硝酸银试液体积", "number", "ml"],
    ["2.1.5.3-沉淀结果", "text", ""],
    ["2.1.5.3-氨试液体积", "number", "ml"],
    ["2.1.5.3-溶解结果", "text", ""],
    ["2.1.5.3-稀硝酸体积", "number", "ml"],
    ["2.1.5.3-复沉淀结果", "text", ""],
  ].forEach(([name, type, unit]) => add(name, "fillable", "", { type, unit }));
  add("2.1.5.2-对照品净重", "calculated", "2.1.5.2-对照品毛重 - 2.1.5.2-对照品皮重", { unit: "mg" });
  add("2.1.5.2-供试品净重", "calculated", "2.1.5.2-供试品毛重 - 2.1.5.2-供试品皮重", { unit: "mg" });
  return {
    name: "盐酸左氧氟沙星胶囊成品鉴别",
    source: "dedicated_layout",
    fields,
  };
}

function simvastatinIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "simvastatin" && stageKey === "finished" && testKeyValue === "identification";
}

function simvastatinIdentificationFieldKey(name) {
  return `finished/identification/simvastatin/${str(name).replace(/[\\/]/g, "_")}`;
}

function simvastatinIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: simvastatinIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function simvastatinIdentificationOperationBlock() {
  const input = simvastatinIdentificationInput;
  return {
    type: "paragraph",
    label: "辛伐他汀片成品鉴别操作方法",
    sourceTemplateId: "dedicated/simvastatin_finished_identification",
    order: 136,
    moduleOrder: 20,
    parts: [
      textPart("2.2.5.1", { bold: true }),
      textPart(" 在含量测定项下记录的色谱图中，供试品溶液主峰的保留时间与对照品溶液主峰的保留时间（一致）。"),
      { type: "br" },
      textPart("2.2.5.2", { bold: true }),
      textPart(" 取含量项下细粉"),
      input("2.2.5.2-取样量", { width: "4.6em" }),
      textPart("mg(约相当于辛伐他汀10mg)置"),
      input("2.2.5.2-量瓶1", { width: "4.4em" }),
      textPart("ml(100ml)量瓶中，加溶剂Ⅰ适量,振摇使辛伐他汀溶解并稀释至刻度，摇匀，滤过，再精密量取续滤液"),
      input("2.2.5.2-续滤液体积", { width: "4.4em" }),
      textPart("ml（5ml）置"),
      input("2.2.5.2-量瓶2", { width: "4.4em" }),
      textPart("ml（50ml）量瓶中制成1ml中约含辛伐他汀10μg的溶液，照紫外-分光光度法（通则0401）测定，在"),
      input("2.2.5.2-波长1", { width: "4.2em" }),
      textPart("nm（231±2nm）、"),
      input("2.2.5.2-波长2", { width: "4.2em" }),
      textPart("nm（238±2nm）与"),
      input("2.2.5.2-波长3", { width: "4.2em" }),
      textPart("nm（247±2nm）的波长处有最大吸收。"),
    ],
  };
}

function simvastatinIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = simvastatinIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name || rec(part).defaultValue)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && (arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^5\.[12]$/.test(str(rec(part).sectionSuffix)))
        || /辛伐他汀|溶剂Ⅰ|231±2nm/.test(partsText));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function simvastatinIdentificationMethodGroup() {
  const fields = [
    ["2.2.5.2-取样量", "number", "mg"],
    ["2.2.5.2-量瓶1", "number", "ml"],
    ["2.2.5.2-续滤液体积", "number", "ml"],
    ["2.2.5.2-量瓶2", "number", "ml"],
    ["2.2.5.2-波长1", "number", "nm"],
    ["2.2.5.2-波长2", "number", "nm"],
    ["2.2.5.2-波长3", "number", "nm"],
  ];
  return {
    name: "辛伐他汀片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, simvastatinIdentificationFieldKey(name), "fillable", "", {
      group: "辛伐他汀片成品鉴别",
      type,
      unit,
    })),
  };
}

function spironolactoneIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "spironolactone" && stageKey === "finished" && testKeyValue === "identification";
}

function spironolactoneIdentificationFieldKey(name) {
  return `finished/identification/spironolactone/${str(name).replace(/[\\/]/g, "_")}`;
}

function spironolactoneIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: spironolactoneIdentificationFieldKey(name), width: str(options.width) || "5.6em" });
}

function spironolactoneIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = {
    type: "paragraph",
    label: "螺内酯片成品鉴别操作方法",
    sourceTemplateId: "dedicated/spironolactone_finished_identification",
    order: 136,
    moduleOrder: 20,
    parts: [
      textPart("在含量测定项下记录的色谱图中,供试品溶液主峰的保留时间应与对照品溶液主峰的保留时间"),
      spironolactoneIdentificationInput("保留时间一致结果"),
      textPart("。"),
    ],
  };
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && /含量测定项下记录的色谱图|螺内酯.*鉴别/.test(partsText);
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function normalizeIsosorbideFinishedIdentificationBlocks(layoutBlocks) {
  const detailBlock = {
    type: "paragraph",
    label: "硝酸异山梨酯片成品鉴别操作方法",
    sourceTemplateId: "dedicated/isosorbide_dinitrate_finished_identification",
    order: 136,
    moduleOrder: 20,
    parts: [
      textPart("在含量测定项下记录的色谱图中，供试品溶液主峰的保留时间应与对照品溶液主峰的保留时间（一致）。"),
    ],
  };
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).field || rec(part).name)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && /含量测定项下记录的色谱图.*保留时间.*一致/.test(partsText);
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function spironolactoneIdentificationMethodGroup() {
  return {
    name: "螺内酯片成品鉴别",
    source: "dedicated_layout",
    fields: [
      methodField("保留时间一致结果", spironolactoneIdentificationFieldKey("保留时间一致结果"), "fillable", "", {
        group: "螺内酯片成品鉴别",
        type: "text",
      }),
    ],
  };
}

function terazosinIdentificationApplies(productKey, stageKey, testKeyValue) {
  return productKey === "terazosin" && stageKey === "finished" && testKeyValue === "identification";
}

function terazosinIdentificationFieldKey(name) {
  return `finished/identification/terazosin/${str(name).replace(/[\\/]/g, "_")}`;
}

function terazosinIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: terazosinIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function terazosinIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function terazosinIdentificationOperationBlock() {
  return {
    type: "paragraph",
    label: "盐酸特拉唑嗪胶囊成品鉴别反应",
    sourceTemplateId: "dedicated/terazosin_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      terazosinIdentificationHeading("4.1"),
      textPart(" 在含量测定项下所记录的色谱图中，供试品溶液主峰的保留时间应与对照品溶液主峰的保留时间"),
      terazosinIdentificationInput("2.2.4.1-保留时间一致结果", { width: "5.6em" }),
      textPart("。"),
      { type: "br" },
      terazosinIdentificationHeading("4.2"),
      textPart(" 取本品细粉"),
      terazosinIdentificationInput("2.2.4.2-UV称样", { width: "4.4em" }),
      textPart("g（约相当于特拉唑嗪4mg）置"),
      terazosinIdentificationInput("2.2.4.2-UV量瓶1", { width: "4.4em" }),
      textPart("ml（100ml）量瓶中，加盐酸（9→1000）溶解并稀释至刻度，再精密吸取"),
      terazosinIdentificationInput("2.2.4.2-UV移取量", { width: "4.4em" }),
      textPart("ml（5ml）置"),
      terazosinIdentificationInput("2.2.4.2-UV量瓶2", { width: "4.4em" }),
      textPart("ml（50ml）量瓶中制成1ml中含特拉唑嗪4μg的溶液，滤过，滤液照紫外-可见分光光度法测定（通则0401），在"),
      terazosinIdentificationInput("2.2.4.2-最大吸收波长", { width: "4.4em" }),
      textPart("nm（246nm±2nm）波长处有最大吸收。"),
      { type: "br" },
      terazosinIdentificationHeading("4.3"),
      textPart(" 取本品细粉"),
      terazosinIdentificationInput("2.2.4.3-氯化物称样", { width: "4.4em" }),
      textPart("g（约相当于特拉唑嗪20mg）至"),
      terazosinIdentificationInput("2.2.4.3-氯化物量瓶", { width: "4.4em" }),
      textPart("ml（20ml）量瓶中，加水10ml振摇使盐酸特拉唑嗪溶解，滤过。取滤液2ml，加稀硝酸0.1ml使成酸性后，滴加硝酸银试液5滴，即生成"),
      terazosinIdentificationInput("2.2.4.3-硝酸银反应现象", { width: "7em" }),
      textPart("，分离，沉淀加氨试液"),
      terazosinIdentificationInput("2.2.4.3-氨试液量", { width: "4.4em" }),
      textPart("ml（2ml）即溶解，再加稀硝酸"),
      terazosinIdentificationInput("2.2.4.3-复沉淀稀硝酸滴数", { width: "4.4em" }),
      textPart("滴，"),
      terazosinIdentificationInput("2.2.4.3-复沉淀现象", { width: "6em" }),
      textPart("（沉淀）复生成。"),
    ],
  };
}

function terazosinIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = terazosinIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const partsText = arr(data.parts).map((part) => str(rec(part).text || rec(part).name || rec(part).defaultValue)).join("");
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && (arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[123]$/.test(str(rec(part).sectionSuffix)))
        || /chemical_sample|solution_source|compare_source|化学反应|UV鉴别|保留时间比对/.test(partsText));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function terazosinIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-保留时间一致结果", "text", ""],
    ["2.2.4.2-UV称样", "number", "g"],
    ["2.2.4.2-UV量瓶1", "number", "ml"],
    ["2.2.4.2-UV移取量", "number", "ml"],
    ["2.2.4.2-UV量瓶2", "number", "ml"],
    ["2.2.4.2-最大吸收波长", "number", "nm"],
    ["2.2.4.3-氯化物称样", "number", "g"],
    ["2.2.4.3-氯化物量瓶", "number", "ml"],
    ["2.2.4.3-硝酸银反应现象", "text", ""],
    ["2.2.4.3-氨试液量", "number", "ml"],
    ["2.2.4.3-复沉淀稀硝酸滴数", "number", "滴"],
    ["2.2.4.3-复沉淀现象", "text", ""],
  ];
  return {
    name: "盐酸特拉唑嗪胶囊成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, terazosinIdentificationFieldKey(name), "fillable", "", {
      group: "盐酸特拉唑嗪胶囊成品鉴别",
      type,
      unit,
    })),
  };
}

function verapamilIdentificationFieldKey(name) {
  return `finished/identification/verapamil/${str(name).replace(/[\\/]/g, "_")}`;
}

function verapamilIdentificationInput(name, options = {}) {
  return inputPart(name, { ...options, fieldKey: verapamilIdentificationFieldKey(name), width: str(options.width) || "4.8em" });
}

function verapamilIdentificationHeading(sectionSuffix) {
  return textPart(`2.2.${sectionSuffix}`, { bold: true });
}

function verapamilIdentificationOperationBlock() {
  return {
    type: "paragraph",
    label: "盐酸维拉帕米片成品鉴别反应",
    sourceTemplateId: "dedicated/verapamil_finished_identification",
    order: 136,
    moduleOrder: 15,
    parts: [
      verapamilIdentificationHeading("4.1"),
      textPart(" 取本品的细粉适量"),
      verapamilIdentificationInput("2.2.4.1-取样量", { width: "5.5em" }),
      textPart("g（约相当于盐酸维拉帕米1g）加水至20ml使溶解，取2ml加硫氰酸铬铵试液"),
      verapamilIdentificationInput("2.2.4.1-硫氰酸铬铵试液滴数", { width: "4em" }),
      textPart("滴（5滴），即生成"),
      verapamilIdentificationInput("2.2.4.1-沉淀结果", { width: "8em" }),
      textPart("（淡红色的沉淀）。"),
      { type: "br" },
      verapamilIdentificationHeading("4.2"),
      textPart(" 取本品内容物"),
      verapamilIdentificationInput("2.2.4.2-取样量", { width: "5.5em" }),
      textPart("g（约相当于盐酸维拉帕米0.1g）置"),
      verapamilIdentificationInput("2.2.4.2-量瓶体积", { width: "4em" }),
      textPart("ml（20ml）量瓶中，加水5ml，振摇使溶解，并用水稀释至刻度，滤过；取续滤液"),
      verapamilIdentificationInput("2.2.4.2-续滤液体积", { width: "4em" }),
      textPart("ml（5ml）置10ml试管中，加稀硝酸"),
      verapamilIdentificationInput("2.2.4.2-稀硝酸滴数", { width: "4em" }),
      textPart("滴（3～5滴）使成酸性，加硝酸银试液"),
      verapamilIdentificationInput("2.2.4.2-硝酸银试液体积", { width: "4em" }),
      textPart("ml（0.5ml），即生成"),
      verapamilIdentificationInput("2.2.4.2-沉淀结果", { width: "8em" }),
      textPart("（白色凝乳状沉淀）；离心，分离，取沉淀加氨试液"),
      verapamilIdentificationInput("2.2.4.2-氨试液体积", { width: "4em" }),
      textPart("ml即"),
      verapamilIdentificationInput("2.2.4.2-溶解结果", { width: "6em" }),
      textPart("（溶解），再加稀硝酸"),
      verapamilIdentificationInput("2.2.4.2-稀硝酸体积", { width: "4em" }),
      textPart("ml（0.5ml）酸化后"),
      verapamilIdentificationInput("2.2.4.2-复沉淀结果", { width: "8em" }),
      textPart("（沉淀复生成）。"),
      { type: "br" },
      verapamilIdentificationHeading("4.3"),
      textPart(" 在含量测定项下记录的色谱图中，供试品溶液主峰的保留时间应与对照品溶液主峰的保留时间"),
      verapamilIdentificationInput("2.2.4.3-保留时间结果", { width: "6em" }),
      textPart("（一致）。"),
    ],
  };
}

function verapamilIdentificationLayoutBlocks(layoutBlocks) {
  const detailBlock = verapamilIdentificationOperationBlock();
  const output = [];
  let inserted = false;
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const isOriginalIdentificationParagraph = str(data.type) === "paragraph"
      && arr(data.parts).some((part) => str(rec(part).type) === "section_heading" && /^4\.[123]$/.test(str(rec(part).sectionSuffix)));
    if (isOriginalIdentificationParagraph) continue;
    output.push(block);
    if (!inserted && str(data.type) === "title" && str(data.title || data.text) === "操作方法") {
      output.push(detailBlock);
      inserted = true;
    }
  }
  if (!inserted) {
    const insertAt = postMethodBlockIndex(output);
    output.splice(insertAt >= 0 ? insertAt : output.length, 0, detailBlock);
  }
  return output;
}

function verapamilIdentificationMethodGroup() {
  const fields = [
    ["2.2.4.1-取样量", "number", "g"],
    ["2.2.4.1-硫氰酸铬铵试液滴数", "number", "滴"],
    ["2.2.4.1-沉淀结果", "text", ""],
    ["2.2.4.2-取样量", "number", "g"],
    ["2.2.4.2-量瓶体积", "number", "ml"],
    ["2.2.4.2-续滤液体积", "number", "ml"],
    ["2.2.4.2-稀硝酸滴数", "number", "滴"],
    ["2.2.4.2-硝酸银试液体积", "number", "ml"],
    ["2.2.4.2-沉淀结果", "text", ""],
    ["2.2.4.2-氨试液体积", "number", "ml"],
    ["2.2.4.2-溶解结果", "text", ""],
    ["2.2.4.2-稀硝酸体积", "number", "ml"],
    ["2.2.4.2-复沉淀结果", "text", ""],
    ["2.2.4.3-保留时间结果", "text", ""],
  ];
  return {
    name: "盐酸维拉帕米片成品鉴别",
    source: "dedicated_layout",
    fields: fields.map(([name, type, unit]) => methodField(name, verapamilIdentificationFieldKey(name), "fillable", "", {
      group: "盐酸维拉帕米片成品鉴别",
      type,
      unit,
    })),
  };
}

function compoundRutinFinishedSummaryTable(test, vitamin = false) {
  const prefix = vitamin ? "维C" : "芦丁";
  const rdLabel = vitamin ? "RD≤0.8%" : "RD≤2.0%";
  const columns = vitamin
    ? ["20%", "20%", "20%", "20%", "20%"]
    : ["15%", "16%", "16%", "16%", "19%", "18%"];
  const rows = vitamin
    ? [
        [
          contentCell("名称"),
          contentCell("称重"),
          contentCell("含量（%）"),
          contentCell("平均（%）"),
          contentCell(rdLabel),
        ],
        [
          contentCell("供试品样 1"),
          contentCell([copiedSummaryInput(test, "维C样1-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "维C样1-含量"), textPart("%")]),
          contentCell([copiedSummaryInput(test, "维C平均含量"), textPart("%")], { rowspan: 2 }),
          contentCell([copiedSummaryInput(test, "维C RD"), textPart("%")], { rowspan: 2 }),
        ],
        [
          contentCell("供试品样 2"),
          contentCell([copiedSummaryInput(test, "维C样2-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "维C样2-含量"), textPart("%")]),
        ],
      ]
    : [
        [
          contentCell("名称"),
          contentCell("称重"),
          contentCell("样品 OD"),
          contentCell("含量（%）"),
          contentCell("平均（%）"),
          contentCell(rdLabel),
        ],
        [
          contentCell("供试品样 1"),
          contentCell([copiedSummaryInput(test, "芦丁样1-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "芦丁样1-OD")]),
          contentCell([copiedSummaryInput(test, "芦丁样1-含量"), textPart("%")]),
          contentCell([copiedSummaryInput(test, "芦丁平均含量"), textPart("%")], { rowspan: 2 }),
          contentCell([copiedSummaryInput(test, "芦丁RD"), textPart("%")], { rowspan: 2 }),
        ],
        [
          contentCell("供试品样 2"),
          contentCell([copiedSummaryInput(test, "芦丁样2-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "芦丁样2-OD")]),
          contentCell([copiedSummaryInput(test, "芦丁样2-含量"), textPart("%")]),
        ],
      ];
  return {
    type: "table",
    label: `复方芦丁片成品含量${prefix}待包装品引用汇总`,
    sourceTemplateId: "dedicated/compound_rutin_finished_content_reference_summary",
    compactTable: true,
    columnWidths: columns,
    rows,
    order: vitamin ? 148 : 146,
  };
}

function compoundRutinFinishedReferenceParagraph(text, order, label) {
  return {
    type: "paragraph",
    label,
    sourceTemplateId: "dedicated/compound_rutin_finished_content_reference_summary",
    parts: [textPart(text)],
    order,
  };
}

function compoundRutinFinishedOperationParagraph(baseBlock, parts, sectionSuffix, heading, order, label) {
  const nextParts = [
    { type: "section_heading", text: heading, sectionSuffix, bold: true },
    { type: "br" },
    ...parts.map((part) => {
      const item = { ...rec(part) };
      if (str(item.text) === "芦丁含量：") {
        item.text = "对照品溶液制备：";
        item.bold = true;
      }
      if (["供试品溶液制备：", "测定法：", "计算："].includes(str(item.text))) item.bold = true;
      return item;
    }),
  ];
  return {
    ...rec(baseBlock),
    label,
    sourceTemplateId: "original_docx_pdf",
    sourceSection: `2.6.${sectionSuffix}`,
    parts: nextParts,
    order,
  };
}

function normalizeCompoundRutinFinishedContentReferenceLayoutBlocks(test) {
  let inserted = false;
  const output = [];
  const shouldDrop = (block) => {
    const data = rec(block);
    const title = str(data.title || data.text);
    const label = str(data.label);
    if (str(data.type) === "title" && /^(称重|测定与计算)$/.test(title)) return true;
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && /复方芦丁片成品含量/.test(label)) return true;
    return false;
  };
  for (const block of arr(rec(test).layout_blocks)) {
    const data = rec(block);
    if (shouldDrop(block)) continue;
    if (!inserted && str(data.type) === "paragraph" && Number(data.order) === 136) {
      const parts = arr(data.parts);
      const vitaminIndex = parts.findIndex((part) => str(rec(part).text) === "维生素C含量：");
      if (vitaminIndex > 0) {
        output.push(compoundRutinFinishedOperationParagraph(data, parts.slice(0, vitaminIndex), "5.1", "芦丁含量", 136, "复方芦丁片成品芦丁含量操作方法"));
        output.push(compoundRutinFinishedReferenceParagraph("检验数据及计算过程见待包装品（二）2.4.5.1.2 项下", 145, "复方芦丁片成品芦丁含量待包装品引用"));
        output.push(compoundRutinFinishedSummaryTable(test, false));
        output.push(compoundRutinFinishedOperationParagraph(data, parts.slice(vitaminIndex + 1), "5.2", "维生素 C 含量", 147, "复方芦丁片成品维生素C含量操作方法"));
        output.push(compoundRutinFinishedReferenceParagraph("检验数据及计算过程见待包装品（二）2.4.5.2.2 项下", 147.5, "复方芦丁片成品维生素C含量待包装品引用"));
        output.push(compoundRutinFinishedSummaryTable(test, true));
        inserted = true;
        continue;
      }
    }
    if (inserted && str(data.type) === "paragraph" && Number(data.order) === 137) continue;
    output.push(block);
  }
  if (!inserted) {
    const referenceBlocks = [
      compoundRutinFinishedReferenceParagraph("检验数据及计算过程见待包装品（二）2.4.5.1.2 项下", 145, "复方芦丁片成品芦丁含量待包装品引用"),
      compoundRutinFinishedSummaryTable(test, false),
      compoundRutinFinishedReferenceParagraph("检验数据及计算过程见待包装品（二）2.4.5.2.2 项下", 147.5, "复方芦丁片成品维生素C含量待包装品引用"),
      compoundRutinFinishedSummaryTable(test, true),
    ];
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function methimazoleFinishedContentReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "甲巯咪唑片成品含量待包装品引用",
      sourceTemplateId: "dedicated/methimazole_finished_content_reference_summary",
      parts: [textPart(finishedContentReferencePhrase(test))],
      order: 145,
    },
    {
      type: "table",
      label: "甲巯咪唑片成品含量待包装品引用汇总",
      sourceTemplateId: "dedicated/methimazole_finished_content_reference_summary",
      compactTable: true,
      columnWidths: ["20%", "20%", "20%", "20%", "20%"],
      rows: [
        [
          contentCell("名称"),
          contentCell("称重"),
          contentCell("含量（%）"),
          contentCell("平均（%）"),
          contentCell("RD≤0.8%"),
        ],
        [
          contentCell("供试品样 1"),
          contentCell([copiedSummaryInput(test, "样1-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "样1-含量"), textPart("%")]),
          contentCell([copiedSummaryInput(test, "平均含量"), textPart("%")], { rowspan: 2 }),
          contentCell([copiedSummaryInput(test, "RD"), textPart("%")], { rowspan: 2 }),
        ],
        [
          contentCell("供试品样 2"),
          contentCell([copiedSummaryInput(test, "样2-净重"), textPart("g")]),
          contentCell([copiedSummaryInput(test, "样2-含量"), textPart("%")]),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeMethimazoleFinishedContentReferenceLayoutBlocks(test) {
  const referenceBlocks = methimazoleFinishedContentReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const title = str(data.title || data.text);
    const label = str(data.label);
    if (str(data.type) === "title" && /^(称重|测定与计算)$/.test(title)) return true;
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && /甲巯咪唑片成品含量(?:称重|供试品计算|测定记录表|测定与计算)/.test(label)) return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).type) === "paragraph" && Number(rec(block).order) === 136) {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function allopurinolFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "别嘌醇片成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/allopurinol_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "别嘌醇片成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/allopurinol_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["23%", "25.666%", "25.667%", "25.667%"],
      rows: [
        [
          contentCell("溶出量", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeAllopurinolFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = allopurinolFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "别嘌醇片溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function atenololFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "阿替洛尔片成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/atenolol_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "阿替洛尔片成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/atenolol_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["27%", "24.333%", "24.333%", "24.334%"],
      rows: [
        [
          contentCell("供试品溶出度", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeAtenololFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = atenololFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "阿替洛尔片溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function azithromycinFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "阿奇霉素胶囊成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/azithromycin_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "阿奇霉素胶囊成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/azithromycin_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell("溶出度", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeAzithromycinFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = azithromycinFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "阿奇霉素胶囊溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function clarithromycinFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "克拉霉素胶囊成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/clarithromycin_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "克拉霉素胶囊成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/clarithromycin_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["28%", "24%", "24%", "24%"],
      rows: [
        [
          contentCell("供试品溶出量（%）", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeClarithromycinFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = clarithromycinFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "克拉霉素胶囊溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function diammoniumFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "甘草酸二铵胶囊成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/diammonium_finished_dissolution_reference_summary",
      parts: [textPart(finishedContentReferencePhrase(test))],
      order: 145,
    },
    {
      type: "table",
      label: "甘草酸二铵胶囊成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/diammonium_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell("供试品溶出度", { rowspan: 2 }),
          contentCell([textPart("样 1="), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2="), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3="), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4="), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5="), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6="), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeDiammoniumFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = diammoniumFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "title" && str(data.title || data.text) === "测定与计算") return true;
    if (str(data.type) === "table" && /^甘草酸二铵成品溶出度(?:测定与计算|对照品计算|吸光度|计算公式|结果)$/.test(label)) return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function hydrochlorothiazideFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "氢氯噻嗪片成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/hydrochlorothiazide_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "氢氯噻嗪片成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/hydrochlorothiazide_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell("供试品溶出量", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeHydrochlorothiazideFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = hydrochlorothiazideFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "氢氯噻嗪片溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function isosorbideFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "硝酸异山梨酯片成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/isosorbide_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "硝酸异山梨酯片成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/isosorbide_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["26%", "24.666%", "24.667%", "24.667%"],
      rows: [
        [
          contentCell("供试品溶出量（%）", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeIsosorbideFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = isosorbideFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "硝酸异山梨酯片溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function levofloxacinFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "盐酸左氧氟沙星胶囊成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/levofloxacin_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "盐酸左氧氟沙星胶囊成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/levofloxacin_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell("溶出度", { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeLevofloxacinFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = levofloxacinFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "盐酸左氧氟沙星胶囊溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function simvastatinFinishedDissolutionReferenceBlocks(test) {
  return [
    {
      type: "paragraph",
      label: "辛伐他汀片成品溶出度待包装品引用",
      sourceTemplateId: "dedicated/simvastatin_finished_dissolution_reference_summary",
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: "辛伐他汀片成品溶出度待包装品引用结果",
      sourceTemplateId: "dedicated/simvastatin_finished_dissolution_reference_summary",
      compactTable: true,
      columnWidths: ["16.667%", "16.666%", "16.667%", "16.667%", "16.666%", "16.667%"],
      rows: [
        [contentCell("供试品峰面积", { colspan: 6 })],
        [
          contentCell([textPart("AR1："), copiedSummaryInput(test, "样1-峰面积")], { align: "left" }),
          contentCell([textPart("AR2："), copiedSummaryInput(test, "样2-峰面积")], { align: "left" }),
          contentCell([textPart("AR3："), copiedSummaryInput(test, "样3-峰面积")], { align: "left" }),
          contentCell([textPart("AR4："), copiedSummaryInput(test, "样4-峰面积")], { align: "left" }),
          contentCell([textPart("AR5："), copiedSummaryInput(test, "样5-峰面积")], { align: "left" }),
          contentCell([textPart("AR6："), copiedSummaryInput(test, "样6-峰面积")], { align: "left" }),
        ],
        [contentCell("供试品溶出量（%）", { colspan: 6 })],
        [
          contentCell([textPart("CX1："), copiedSummaryInput(test, "样1-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("CX2："), copiedSummaryInput(test, "样2-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("CX3："), copiedSummaryInput(test, "样3-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("CX4："), copiedSummaryInput(test, "样4-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("CX5："), copiedSummaryInput(test, "样5-溶出度"), textPart("%")], { align: "left" }),
          contentCell([textPart("CX6："), copiedSummaryInput(test, "样6-溶出度"), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeSimvastatinFinishedDissolutionReferenceLayoutBlocks(test) {
  const referenceBlocks = simvastatinFinishedDissolutionReferenceBlocks(test);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === "辛伐他汀片溶出度测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function pantoprazoleFinishedReleaseReferenceBlocks(test, { labelPrefix, sourceTemplateId, leftHeader, fieldSuffix }) {
  return [
    {
      type: "paragraph",
      label: `${labelPrefix}待包装品引用`,
      sourceTemplateId,
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: `${labelPrefix}待包装品引用结果`,
      sourceTemplateId,
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell(leftHeader, { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, `样1-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, `样2-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, `样3-${fieldSuffix}`), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, `样4-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, `样5-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, `样6-${fieldSuffix}`), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizePantoprazoleFinishedReleaseReferenceLayoutBlocks(test, options) {
  const referenceBlocks = pantoprazoleFinishedReleaseReferenceBlocks(test, options);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === options.dropLabel) return true;
    if (str(data.type) === "title" && title === "测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function simpleFinishedDissolutionReferenceBlocks(test, { labelPrefix, sourceTemplateId, leftHeader, fieldSuffix = "溶出度" }) {
  return [
    {
      type: "paragraph",
      label: `${labelPrefix}待包装品引用`,
      sourceTemplateId,
      parts: [
        textPart("测定与计算：", { bold: true }),
        lineBreakPart(),
        textPart(finishedContentReferencePhrase(test)),
      ],
      order: 145,
    },
    {
      type: "table",
      label: `${labelPrefix}待包装品引用结果`,
      sourceTemplateId,
      compactTable: true,
      columnWidths: ["24%", "25.333%", "25.333%", "25.334%"],
      rows: [
        [
          contentCell(leftHeader, { rowspan: 3 }),
          contentCell("结果", { colspan: 3 }),
        ],
        [
          contentCell([textPart("样 1："), copiedSummaryInput(test, `样1-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 2："), copiedSummaryInput(test, `样2-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 3："), copiedSummaryInput(test, `样3-${fieldSuffix}`), textPart("%")], { align: "left" }),
        ],
        [
          contentCell([textPart("样 4："), copiedSummaryInput(test, `样4-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 5："), copiedSummaryInput(test, `样5-${fieldSuffix}`), textPart("%")], { align: "left" }),
          contentCell([textPart("样 6："), copiedSummaryInput(test, `样6-${fieldSuffix}`), textPart("%")], { align: "left" }),
        ],
      ],
      order: 146,
    },
  ];
}

function normalizeSimpleFinishedDissolutionReferenceLayoutBlocks(test, options) {
  const referenceBlocks = simpleFinishedDissolutionReferenceBlocks(test, options);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (str(data.type) === "table" && label === options.dropLabel) return true;
    if (str(data.type) === "title" && title === "测定与计算") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function finishedContentUniformityReferenceBlocks(test, { labelPrefix, sourceTemplateId, compact = false }) {
  const paragraph = {
    type: "paragraph",
    label: `${labelPrefix}待包装品引用`,
    sourceTemplateId,
    parts: [
      textPart("测定与计算：", { bold: true }),
      lineBreakPart(),
      textPart(finishedContentReferencePhrase(test)),
    ],
    order: 145,
  };
  if (compact) {
    return [
      paragraph,
      {
        type: "table",
        label: `${labelPrefix}待包装品引用结果`,
        sourceTemplateId,
        compactTable: true,
        columnWidths: ["16%", "16%", "16%", "16%", "16%", "20%"],
        rows: [
          [contentCell("样品均匀度", { colspan: 6 })],
          [
            contentCell([textPart("样 1："), copiedSummaryInput(test, "样1-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 2："), copiedSummaryInput(test, "样2-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 3："), copiedSummaryInput(test, "样3-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 4："), copiedSummaryInput(test, "样4-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 5："), copiedSummaryInput(test, "样5-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("平均："), copiedSummaryInput(test, "平均含量"), textPart("%")], { rowspan: 2 }),
          ],
          [
            contentCell([textPart("样 6："), copiedSummaryInput(test, "样6-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 7："), copiedSummaryInput(test, "样7-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 8："), copiedSummaryInput(test, "样8-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 9："), copiedSummaryInput(test, "样9-含量"), textPart("%")], { align: "left" }),
            contentCell([textPart("样 10："), copiedSummaryInput(test, "样10-含量"), textPart("%")], { align: "left" }),
          ],
          [
            contentCell("A＋2.2S ≤13.0", { colspan: 3 }),
            contentCell([textPart("A＋2.2S="), copiedSummaryInput(test, "A＋2.2S")], { colspan: 3 }),
          ],
        ],
        order: 146,
      },
    ];
  }
  const rows = [[
    contentCell("样品含量（%）"),
    contentCell("平均含量（%）"),
    contentCell("A＋2.2S ≤13.0"),
  ]];
  for (let index = 1; index <= 10; index += 1) {
    const row = [
      contentCell([textPart(`样 ${index}：`), copiedSummaryInput(test, `样${index}-含量`), textPart("%")], { align: "left" }),
    ];
    if (index === 1) {
      row.push(contentCell([textPart("X="), copiedSummaryInput(test, "平均含量"), textPart("%")], { rowspan: 10 }));
      row.push(contentCell([textPart("A＋2.2S="), copiedSummaryInput(test, "A＋2.2S")], { rowspan: 10 }));
    }
    rows.push(row);
  }
  return [
    paragraph,
    {
      type: "table",
      label: `${labelPrefix}待包装品引用结果`,
      sourceTemplateId,
      compactTable: true,
      columnWidths: ["36%", "32%", "32%"],
      rows,
      order: 146,
    },
  ];
}

function normalizeFinishedContentUniformityReferenceLayoutBlocks(test, options) {
  const referenceBlocks = finishedContentUniformityReferenceBlocks(test, options);
  let inserted = false;
  const shouldDrop = (block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    if (label === "project_header_dates" || label === "test_signature_footer") return false;
    if (type === "table" && options.dropPatterns.some((pattern) => pattern.test(label))) return true;
    if (type === "title" && /^(对照称样|称重|测定与计算)$/.test(title)) return true;
    if (type === "paragraph" && (label === "paragraph" || !label)) return true;
    if (type === "structured_operation_method" || label === "structured_operation_method") return true;
    return false;
  };
  const output = [];
  for (const block of arr(rec(test).layout_blocks)) {
    if (shouldDrop(block)) continue;
    output.push(block);
    if (!inserted && str(rec(block).label) === "md_operation_method") {
      output.push(...referenceBlocks);
      inserted = true;
    }
  }
  if (!inserted) {
    const standardIndex = output.findIndex((block) => ["standard_text", "abnormal_handling", "cleanup_checklist", "conclusion"].includes(str(rec(block).type)));
    output.splice(standardIndex >= 0 ? standardIndex : Math.max(1, output.length - 1), 0, ...referenceBlocks);
  }
  return output;
}

function specialHplcContentMethodField(ctx, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: ctx.displayName,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: specialHplcContentFieldKey(ctx, name),
  });
}

function specialHplcContentMethodGroup(productKey, stageKey) {
  const ctx = specialHplcContentContext(productKey, stageKey);
  const fields = [];
  const add = (...args) => fields.push(specialHplcContentMethodField(ctx, ...args));
  const unitWeight = `平均${ctx.unitLabel}重`;
  if (ctx.productKey === "azithromycin") {
    add("进样体积", "fillable", "", { unit: "μl", defaultValue: 50 });
    if (ctx.stageKey === "intermediate") {
      add("系统适用性对照含量", "fillable", "", { unit: "%" });
      add("系统适用性对照-毛重", "fillable", "", { unit: "mg" });
      add("系统适用性对照-皮重", "fillable", "", { unit: "mg" });
      add("系统适用性对照-净重", "calculated", "系统适用性对照-毛重 - 系统适用性对照-皮重", { unit: "mg" });
    }
  }
  if (ctx.productKey === "simvastatin") {
    for (const prefix of ["系统适用性辛伐他汀对照", "系统适用性洛伐他汀对照"]) {
      add(`${prefix}含量`, "fillable", "", { unit: "%" });
      add(`${prefix}-毛重`, "fillable", "", { unit: "mg" });
      add(`${prefix}-皮重`, "fillable", "", { unit: "mg" });
      add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "mg" });
    }
  }
  add("对照含量", "fillable", "", { unit: "%" });
  ctx.systemSuitabilityRows.forEach((_, index) => add(`系统适用性${index + 1}`, "fillable", "", { type: "radio" }));
  for (const prefix of ["对照1", "对照2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-皮重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "mg" });
  }
  if (
    ((ctx.productKey === "atenolol" || ctx.productKey === "clarithromycin" || ctx.productKey === "isosorbide_dinitrate" || ctx.productKey === "verapamil") && ctx.stageKey === "packaging")
    || (ctx.productKey === "azithromycin" && ["packaging", "finished"].includes(ctx.stageKey))
  ) {
    add(`20${ctx.unitLabel}总重`, "fillable", "", { unit: "g" });
    add(unitWeight, "calculated", `20${ctx.unitLabel}总重 / 20`, { unit: `g/${ctx.unitLabel}` });
  } else if (ctx.stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: `万${ctx.unitLabel}` });
    add(unitWeight, "calculated", "投料量 / (批量 * 10)", { unit: `g/${ctx.unitLabel}` });
  } else {
    add("总毛重", "fillable", "", { unit: "g" });
    add("总皮重", "fillable", "", { unit: "g" });
    add("总净重", "calculated", "总毛重 - 总皮重", { unit: "g" });
    add(unitWeight, "calculated", "总净重 / 20", { unit: `g/${ctx.unitLabel}` });
  }
  for (const prefix of ["样1", "样2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: ctx.sampleWeightUnit });
    add(`${prefix}-皮重`, "fillable", "", { unit: ctx.sampleWeightUnit });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: ctx.sampleWeightUnit });
  }
  const referenceUnitFields = [];
  for (const [prefix, count] of [["对照1", 3], ["对照2", 2]]) {
    for (let index = 1; index <= count; index += 1) {
      const peak = `${prefix}-峰面积${index}`;
      const unit = `${prefix}-单位峰面积${index}`;
      add(peak);
      add(unit, "calculated", `${peak} / ${prefix}-净重`);
      referenceUnitFields.push(unit);
    }
  }
  add("对照平均单位峰面积", "calculated", `(${referenceUnitFields.join(" + ")}) / ${referenceUnitFields.length}`);
  add("对照RSD", "calculated", `SQRT((${referenceUnitFields.map((field) => `(${field} - 对照平均单位峰面积)^2`).join(" + ")}) / ${referenceUnitFields.length - 1}) / 对照平均单位峰面积 * 100`, { unit: "%" });
  if (ctx.productKey === "levofloxacin") add("规格", "prefilled", "", { defaultValue: 0.1 });
  if (ctx.productKey === "verapamil") add("规格", "prefilled", "", { unit: "g", defaultValue: 0.04 });
  for (const prefix of ["样1", "样2"]) {
    add(`${prefix}-峰面积1`);
    add(`${prefix}-峰面积2`);
    add(`${prefix}-平均峰面积`, "calculated", `(${prefix}-峰面积1 + ${prefix}-峰面积2) / 2`);
    add(`${prefix}-RD`, "calculated", `ABS(${prefix}-峰面积1 - ${prefix}-峰面积2) / ${prefix}-平均峰面积 * 100`, { unit: "%" });
    const contentFormula = ctx.productKey === "azithromycin"
      ? `${prefix}-平均峰面积 * 5 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 0.25 * 1000)`
      : ctx.productKey === "atenolol"
        ? `${prefix}-平均峰面积 * 2 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 25)`
      : ctx.productKey === "clarithromycin"
        ? `${prefix}-平均峰面积 * 2 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 0.25)`
      : ctx.productKey === "isosorbide_dinitrate" && ctx.stageKey === "packaging"
        ? `${prefix}-平均峰面积 * 对照含量 * ${unitWeight} * 1000 * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 2 * 5)`
      : ctx.productKey === "isosorbide_dinitrate"
        ? `${prefix}-平均峰面积 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 0.005 * 2)`
      : ctx.productKey === "levofloxacin"
      ? `${prefix}-平均峰面积 * 10 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 规格 * 1000)`
      : ctx.productKey === "verapamil"
      ? `${prefix}-平均峰面积 * 10 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 规格)`
      : ctx.productKey === "simvastatin"
        ? `${prefix}-平均峰面积 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 0.01)`
        : ctx.productKey === "spironolactone"
          ? `${prefix}-平均峰面积 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 0.02)`
          : ctx.productKey === "terazosin"
            ? `${prefix}-平均峰面积 * 0.914 * 对照含量 * ${unitWeight} * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 5 * 2)`
            : `${prefix}-平均峰面积 * 2 * 对照含量 * ${unitWeight} * 1000 * 100 / (${prefix}-净重 * 对照平均单位峰面积 * 25)`;
    add(`${prefix}-含量`, "calculated", contentFormula, { unit: "%" });
  }
  add("平均含量", "calculated", "(样1-含量 + 样2-含量) / 2", { unit: "%" });
  add("RD", "calculated", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", { unit: "%" });
  return {
    name: ctx.displayName,
    source: "dedicated_layout",
    fields,
  };
}

function methimazoleContentDisplayName(stageKey) {
  return `甲巯咪唑片${stageLabels[stageKey] ?? stageKey}含量`;
}

function methimazoleContentFieldKey(stageKey, name) {
  return `${stageKey}/content/methimazole_titration/${str(name).replace(/[\\/]/g, "_")}`;
}

function methInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: methimazoleContentFieldKey(stageKey, field) });
}

function methimazoleContentTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `${methimazoleContentDisplayName(stageKey)}${label}`,
    sourceTemplateId: `dedicated/methimazole_${stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function methimazoleContentLayoutBlocks(stageKey) {
  const unitWeightName = stageKey === "intermediate" ? "理论片重" : "平均片重";
  const unitWeightExpression = stageKey === "intermediate"
    ? [
        textPart("投料量（Kg）/[批量（万片）×10]="),
        methInput(stageKey, "投料量"),
        textPart(" / "),
        methInput(stageKey, "批量"),
        textPart(" = "),
        methInput(stageKey, unitWeightName, { readonlyDisplay: true }),
        textPart(" g/片"),
      ]
    : [
        textPart("20片总重："),
        methInput(stageKey, "20片总重"),
        textPart(" ÷ 20 = "),
        methInput(stageKey, unitWeightName, { readonlyDisplay: true }),
        textPart(" g/片"),
      ];
  return [
    methimazoleContentTable(stageKey, "称重", ["18%", "18%", "64%"], [
      [
        contentCell("样品称样（g）"),
        contentCell(`${unitWeightName}（g）`),
        contentCell(unitWeightExpression),
      ],
      [
        contentCell(""),
        contentCell("样1"),
        contentCell([methInput(stageKey, "样1-毛重"), textPart(" - "), methInput(stageKey, "样1-皮重"), textPart(" = "), methInput(stageKey, "样1-净重", { readonlyDisplay: true }), textPart(" g")]),
      ],
      [
        contentCell(""),
        contentCell("样2"),
        contentCell([methInput(stageKey, "样2-毛重"), textPart(" - "), methInput(stageKey, "样2-皮重"), textPart(" = "), methInput(stageKey, "样2-净重", { readonlyDisplay: true }), textPart(" g")]),
      ],
    ], 140),
    methimazoleContentTable(stageKey, "测定与计算", ["18%", "18%", "22%", "14%", "14%", "14%"], [
      [contentCell("供试品计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("计算公式"), contentCell("含量=[（C×V×0.01142×片重×2）/（m×0.1×0.005）]×100%", { colspan: 5, align: "left" })],
      [contentCell("滴定液"), contentCell([textPart("C="), methInput(stageKey, "滴定液浓度"), textPart(" mol/L")], { colspan: 5, align: "left" })],
      [contentCell("名称"), contentCell("称重"), contentCell("消耗氢氧化钠滴定液ml"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("RD≤0.8%")],
      [contentCell("供试品样1"), contentCell([methInput(stageKey, "样1-净重", { readonlyDisplay: true }), textPart(" g")]), contentCell([methInput(stageKey, "样1-消耗氢氧化钠滴定液"), textPart(" ml")]), contentCell([methInput(stageKey, "样1-含量", { readonlyDisplay: true }), textPart("%")]), contentCell([methInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }), contentCell([methInput(stageKey, "RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
      [contentCell("供试品样2"), contentCell([methInput(stageKey, "样2-净重", { readonlyDisplay: true }), textPart(" g")]), contentCell([methInput(stageKey, "样2-消耗氢氧化钠滴定液"), textPart(" ml")]), contentCell([methInput(stageKey, "样2-含量", { readonlyDisplay: true }), textPart("%")])],
    ], 151),
  ];
}

function methimazoleMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: methimazoleContentDisplayName(stageKey),
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: methimazoleContentFieldKey(stageKey, name),
  });
}

function methimazoleContentMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(methimazoleMethodField(stageKey, ...args));
  const unitWeightName = stageKey === "intermediate" ? "理论片重" : "平均片重";
  if (stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: "万片" });
    add(unitWeightName, "calculated", "投料量 / (批量 * 10)", { unit: "g/片" });
  } else {
    add("20片总重", "fillable", "", { unit: "g" });
    add(unitWeightName, "calculated", "20片总重 / 20", { unit: "g/片" });
  }
  for (const prefix of ["样1", "样2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: "g" });
    add(`${prefix}-皮重`, "fillable", "", { unit: "g" });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "g" });
    add(`${prefix}-消耗氢氧化钠滴定液`, "fillable", "", { unit: "ml" });
    add(`${prefix}-含量`, "calculated", `滴定液浓度 * ${prefix}-消耗氢氧化钠滴定液 * 0.01142 * ${unitWeightName} * 2 * 100 / (${prefix}-净重 * 0.1 * 0.005)`, { unit: "%" });
  }
  add("滴定液浓度", "fillable", "", { unit: "mol/L" });
  add("平均含量", "calculated", "(样1-含量 + 样2-含量) / 2", { unit: "%" });
  add("RD", "calculated", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", { unit: "%" });
  return {
    name: methimazoleContentDisplayName(stageKey),
    source: "dedicated_layout",
    fields,
  };
}

function methimazoleUniformityApplies(productKey, stageKey, testKeyValue) {
  return productKey === "methimazole" && testKeyValue === "content_uniformity" && ["packaging", "finished"].includes(stageKey);
}

function methimazoleUniformityDisplayName(stageKey) {
  return `甲巯咪唑片${stageLabels[stageKey] ?? stageKey}含量均匀度`;
}

function methimazoleUniformityFieldKey(stageKey, name) {
  return `${stageKey}/content_uniformity/methimazole_uv_uniformity/${str(name).replace(/[\\/]/g, "_")}`;
}

function methUniInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: methimazoleUniformityFieldKey(stageKey, field) });
}

function methimazoleUniformityTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `${methimazoleUniformityDisplayName(stageKey)}${label}`,
    sourceTemplateId: `dedicated/methimazole_${stageKey}_content_uniformity`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function methimazoleUniformityLayoutBlocks(stageKey) {
  const sampleRows = [];
  for (let index = 1; index <= 10; index += 1) {
    sampleRows.push([
      contentCell(String(index)),
      contentCell([methUniInput(stageKey, `样${index}-OD`)]),
      contentCell([methUniInput(stageKey, `样${index}-含量`, { readonlyDisplay: true }), textPart("%")]),
      ...(index === 1 ? [
        contentCell([textPart("X="), methUniInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 10 }),
        contentCell([textPart("A＋2.2S="), methUniInput(stageKey, "A＋2.2S", { readonlyDisplay: true })], { rowspan: 10 }),
      ] : []),
    ]);
  }
  return [
    methimazoleUniformityTable(stageKey, "称重", ["30%", "24%", "46%"], [
      [
        contentCell([textPart("对照含量"), methUniInput(stageKey, "对照含量"), textPart("%")], { rowspan: 2 }),
        contentCell("对照称样1（mg）"),
        contentCell([textPart("m="), methUniInput(stageKey, "对照1-毛重"), textPart(" - "), methUniInput(stageKey, "对照1-皮重"), textPart(" = "), methUniInput(stageKey, "对照1-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
      [
        contentCell("对照称样2（mg）"),
        contentCell([textPart("m="), methUniInput(stageKey, "对照2-毛重"), textPart(" - "), methUniInput(stageKey, "对照2-皮重"), textPart(" = "), methUniInput(stageKey, "对照2-净重", { readonlyDisplay: true }), textPart(" mg")]),
      ],
    ], 140),
    methimazoleUniformityTable(stageKey, "对照品计算", ["12%", "22%", "18%", "16%", "16%", "16%"], [
      [contentCell("对照品计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("吸光度", { rowspan: 5 }), contentCell([textPart("波长："), methUniInput(stageKey, "检测波长"), textPart(" nm")], { colspan: 5, align: "left" })],
      [contentCell([textPart("空白 OD:"), methUniInput(stageKey, "空白OD")], { colspan: 2, align: "left" }), contentCell([textPart("空白溶剂 OD:"), methUniInput(stageKey, "空白溶剂OD")], { colspan: 3, align: "left" })],
      [contentCell("名称"), contentCell("OD"), contentCell("OD/mg"), contentCell("平均（OD/mg）"), contentCell("RD≤2.0%")],
      [contentCell([textPart("对照1："), methUniInput(stageKey, "对照1-净重", { readonlyDisplay: true }), textPart("mg")]), contentCell([methUniInput(stageKey, "对照1-OD")]), contentCell([methUniInput(stageKey, "对照1-OD/mg", { readonlyDisplay: true })]), contentCell([methUniInput(stageKey, "对照平均OD/mg", { readonlyDisplay: true })], { rowspan: 2 }), contentCell([methUniInput(stageKey, "对照RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 })],
      [contentCell([textPart("对照2："), methUniInput(stageKey, "对照2-净重", { readonlyDisplay: true }), textPart("mg")]), contentCell([methUniInput(stageKey, "对照2-OD")]), contentCell([methUniInput(stageKey, "对照2-OD/mg", { readonlyDisplay: true })])],
    ], 151),
    methimazoleUniformityTable(stageKey, "供试品计算", ["12%", "24%", "20%", "18%", "26%"], [
      [contentCell("供试品计算", { colspan: 5, bold: true, align: "left" })],
      [contentCell("计算公式", { rowspan: 2 }), contentCell("含量=CX×A×OD", { colspan: 4, align: "left" })],
      [contentCell("含量（%）=[（OD样-OD空白）×2×对照%/OD×5×5]×100%", { colspan: 4, align: "left" })],
      [contentCell("样品号"), contentCell("样品OD"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("A＋2.2S≤13.0")],
      ...sampleRows,
    ], 152),
  ];
}

function methimazoleUniformityMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: methimazoleUniformityDisplayName(stageKey),
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: methimazoleUniformityFieldKey(stageKey, name),
  });
}

function methimazoleUniformityMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(methimazoleUniformityMethodField(stageKey, ...args));
  add("对照含量", "fillable", "", { unit: "%" });
  for (const prefix of ["对照1", "对照2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-皮重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "mg" });
  }
  add("检测波长", "fillable", "", { unit: "nm" });
  add("空白OD");
  add("空白溶剂OD");
  for (const prefix of ["对照1", "对照2"]) {
    add(`${prefix}-OD`);
    add(`${prefix}-OD/mg`, "calculated", `(${prefix}-OD - 空白溶剂OD) / ${prefix}-净重`);
  }
  add("对照平均OD/mg", "calculated", "(对照1-OD/mg + 对照2-OD/mg) / 2");
  add("对照RD", "calculated", "ABS(对照1-OD/mg - 对照2-OD/mg) / 对照平均OD/mg * 100", { unit: "%" });
  for (let index = 1; index <= 10; index += 1) {
    add(`样${index}-OD`);
    add(`样${index}-含量`, "calculated", `(样${index}-OD - 空白OD) * 2 * 对照含量 * 100 / (对照平均OD/mg * 5 * 5)`, { unit: "%" });
  }
  const sampleContents = Array.from({ length: 10 }, (_, index) => `样${index + 1}-含量`);
  add("平均含量", "calculated", `(${sampleContents.join(" + ")}) / 10`, { unit: "%" });
  add("A＋2.2S", "calculated", `平均含量 + 2.2 * SQRT((${sampleContents.map((field) => `(${field} - 平均含量)^2`).join(" + ")}) / 9)`);
  return {
    name: methimazoleUniformityDisplayName(stageKey),
    source: "dedicated_layout",
    fields,
  };
}

function variationFieldKey(stageKey, testKeyValue, name) {
  return `${stageKey}/${testKeyValue}/variation/${str(name).replace(/[\\/]/g, "_")}`;
}

function variationMethodField(stageKey, testKeyValue, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: testKeyValue === "fill_variation" ? "装量差异" : "重量差异",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: variationFieldKey(stageKey, testKeyValue, name),
  });
}

function variationInput(stageKey, testKeyValue, name, options = {}) {
  return inputPart(name, { ...options, fieldKey: variationFieldKey(stageKey, testKeyValue, name) });
}

function variationReadonly(stageKey, testKeyValue, name, formulaText, dependencyNames, options = {}) {
  return {
    ...variationInput(stageKey, testKeyValue, name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: arr(dependencyNames).map((dep) => variationFieldKey(stageKey, testKeyValue, dep)),
  };
}

function variation20TabletTable(stageKey, testKeyValue, standardParams = {}) {
  const limit = Number(rec(standardParams).limit);
  const limitValue = Number.isFinite(limit) ? limit : 7;
  const sampleRows = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20],
  ];
  const sampleCell = (index, extra = {}) => contentCell([
    textPart(`${index}:`),
    variationInput(stageKey, testKeyValue, `片${index}-重`, { width: "5em" }),
    textPart(" g"),
  ], { align: "left", ...extra });
  return {
    type: "table",
    label: "20片重量差异",
    sourceTemplateId: "dedicated/variation_20_tablets_true_source",
    compactTable: true,
    columnWidths: ["19%", "16.2%", "16.2%", "16.2%", "16.2%", "8.1%", "8.1%"],
    rows: [
      [
        contentCell("20片总重（g）"),
        contentCell([
          variationInput(stageKey, testKeyValue, "20片总毛重"),
          textPart(" - "),
          variationInput(stageKey, testKeyValue, "20片总皮重"),
          textPart(" = "),
          variationReadonly(
            stageKey,
            testKeyValue,
            "20片总净重",
            "20片总净重 = 20片总毛重 - 20片总皮重",
            ["20片总毛重", "20片总皮重"],
          ),
          textPart(" g"),
        ], { colspan: 3 }),
        contentCell("片重"),
        contentCell("上限:"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "片重上限",
            "片重上限 = 平均片重 × (1 + 重量差异限度 / 100)",
            ["平均片重", "重量差异限度"],
          ),
          textPart(" g"),
        ]),
      ],
      [
        contentCell("平均片重（g）"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "20片总净重",
            "20片总净重 = 20片总毛重 - 20片总皮重",
            ["20片总毛重", "20片总皮重"],
          ),
          textPart(" ÷ 20 = "),
          variationReadonly(
            stageKey,
            testKeyValue,
            "平均片重",
            "平均片重 = 20片总净重 / 20",
            ["20片总净重"],
          ),
          textPart(" g/片"),
        ], { colspan: 3 }),
        contentCell(`±${limitValue.toFixed(1)}%`),
        contentCell("下限:"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "片重下限",
            "片重下限 = 平均片重 × (1 - 重量差异限度 / 100)",
            ["平均片重", "重量差异限度"],
          ),
          textPart(" g"),
        ]),
      ],
      ...sampleRows.map((row, rowIndex) => [
        ...(rowIndex === 0 ? [contentCell("平均片重（g）", { rowspan: 4 })] : []),
        ...row.map((index, cellIndex) => sampleCell(index, cellIndex === 4 ? { colspan: 2 } : {})),
      ]),
    ],
  };
}

function variation20CapsuleTable(stageKey, testKeyValue, standardParams = {}, label = "20粒装量差异", options = {}) {
  const limit = Number(rec(standardParams).limit);
  const limitValue = Number.isFinite(limit) ? limit : 7;
  const sampleRows = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20],
  ];
  const limitField = testKeyValue === "fill_variation" ? "装量差异限度" : "重量差异限度";
  const sampleCell = (index, extra = {}) => contentCell([
    textPart(`${index}:`),
    variationInput(stageKey, testKeyValue, `粒${index}-重`, { width: "5em" }),
    textPart(" g"),
  ], { align: "left", ...extra });
  return {
    type: "table",
    label,
    sourceTemplateId: "dedicated/variation_20_capsules_true_source",
    compactTable: true,
    columnWidths: ["19%", "16.2%", "16.2%", "16.2%", "16.2%", "8.1%", "8.1%"],
    rows: [
      [
        contentCell("20粒总重（g）"),
        contentCell([
          variationInput(stageKey, testKeyValue, "20粒总毛重"),
          textPart(" - "),
          variationInput(stageKey, testKeyValue, "20粒总皮重"),
          textPart(" = "),
          variationReadonly(
            stageKey,
            testKeyValue,
            "20粒总净重",
            "20粒总净重 = 20粒总毛重 - 20粒总皮重",
            ["20粒总毛重", "20粒总皮重"],
          ),
          textPart(" g"),
        ], { colspan: 3 }),
        contentCell("粒重"),
        contentCell("上限:"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "粒重上限",
            `粒重上限 = 平均粒重 × (1 + ${limitField} / 100)`,
            ["平均粒重", limitField],
          ),
          textPart(" g"),
        ]),
      ],
      [
        contentCell("平均粒重（g）"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "20粒总净重",
            "20粒总净重 = 20粒总毛重 - 20粒总皮重",
            ["20粒总毛重", "20粒总皮重"],
          ),
          textPart(" ÷ 20 = "),
          variationReadonly(
            stageKey,
            testKeyValue,
            "平均粒重",
            "平均粒重 = 20粒总净重 / 20",
            ["20粒总净重"],
          ),
          textPart(" g/粒"),
        ], { colspan: 3 }),
        contentCell(`±${limitValue.toFixed(1)}%`),
        contentCell("下限:"),
        contentCell([
          variationReadonly(
            stageKey,
            testKeyValue,
            "粒重下限",
            `粒重下限 = 平均粒重 × (1 - ${limitField} / 100)`,
            ["平均粒重", limitField],
          ),
          textPart(" g"),
        ]),
      ],
      ...sampleRows.map((row, rowIndex) => [
        ...(rowIndex === 0 ? [contentCell(str(options.detailWeightLabel, "粒重（g）"), { rowspan: 4 })] : []),
        ...row.map((index, cellIndex) => sampleCell(index, cellIndex === 4 ? { colspan: 2 } : {})),
      ]),
    ],
  };
}

function normalizeVariationLayoutBlocks(layoutBlocks, productKey, stageKey, testKeyValue, test = {}) {
  if (!["weight_variation", "fill_variation"].includes(testKeyValue)) return layoutBlocks;
  const capsuleOptions = productKey === "levofloxacin" ? { detailWeightLabel: "平均粒重（g）" } : {};
  return arr(layoutBlocks).map((block) => {
    const data = rec(block);
    if (str(data.type) === "table" && str(data.label) === "20片重量差异") {
      return variation20TabletTable(stageKey, testKeyValue, rec(test["标准规定参数"]));
    }
    if (str(data.type) === "table" && str(data.label) === "20粒装量差异") {
      return variation20CapsuleTable(stageKey, testKeyValue, rec(test["标准规定参数"]), "20粒装量差异", capsuleOptions);
    }
    if (str(data.type) === "table" && str(data.label) === "20粒重量差异") {
      return variation20CapsuleTable(stageKey, testKeyValue, rec(test["标准规定参数"]), "20粒重量差异", capsuleOptions);
    }
    return block;
  });
}

function finishedVariationOperationText(test, phrase) {
  const operationSection = arr(test.sections).find((section) => /操作方法/.test(str(rec(section).title)));
  let text = str(operationSection?.text)
    .replace(/^#{1,6}\s*\d+(?:\.\d+)*\s*操作方法\s*/m, "")
    .replace(/\s+/g, " ")
    .trim();
  text = plainTextFromMd(text).replace(/\s+/g, " ").trim();
  text = text.replace(/检验数据见待包装品(?:（二）)?\s*$/u, "").trim();
  const referencePhrase = str(phrase).trim();
  if (!text) return referencePhrase;
  if (referencePhrase && !text.includes(referencePhrase)) return `${text}\n${referencePhrase}`;
  return text;
}

function normalizeFinishedVariationReferenceLayoutBlocks(layoutBlocks, test) {
  const phrase = str(arr(test.packaging_reference_phrases)[0]);
  const sourceOperationText = finishedVariationOperationText(test, phrase);
  let hasReferencePhrase = false;
  let insertedReferencePhrase = false;
  const output = [];
  for (const block of arr(layoutBlocks)) {
    const data = rec(block);
    const type = str(data.type);
    const label = str(data.label);
    if (type === "table" && ["20片重量差异", "20粒装量差异", "20粒重量差异"].includes(label)) continue;
    if (phrase) {
      const blockText = `${str(data.text)} ${str(data.rawText)} ${arr(data.parts).map((part) => str(rec(part).text)).join(" ")}`;
      if (blockText.includes(phrase)) hasReferencePhrase = true;
      if (type === "operation_text") {
        const nextText = sourceOperationText || `${str(data.text).trim()}${str(data.text).trim() ? "\n" : ""}${phrase}`;
        output.push({
          ...data,
          text: nextText,
          parts: mdInlineLayoutParts(nextText, `finished/${str(test.key)}/variation_reference_operation`),
        });
        insertedReferencePhrase = true;
        continue;
      }
    }
    output.push(block);
  }
  if (phrase && !hasReferencePhrase && !insertedReferencePhrase) {
    const insertAt = output.findIndex((block) => str(rec(block).type) === "title" && str(rec(block).title || rec(block).text) === "操作方法");
    output.splice(insertAt >= 0 ? insertAt + 1 : Math.max(1, output.length - 1), 0, {
      type: "paragraph",
      label: "成品差异待包装品引用",
      sourceTemplateId: "dedicated/finished_variation_reference",
      parts: [textPart(phrase)],
      order: 136,
      moduleOrder: 15,
    });
  }
  return output;
}

function variationMethodGroup(stageKey, testKeyValue, standardParams = {}) {
  const limit = Number(rec(standardParams).limit);
  const limitValue = Number.isFinite(limit) ? String(limit) : "";
  const fields = [];
  const add = (...args) => fields.push(variationMethodField(stageKey, testKeyValue, ...args));
  for (const unit of ["片", "粒"]) {
    add(`20${unit}总毛重`, "fillable", "", { unit: "g" });
    add(`20${unit}总皮重`, "fillable", "", { unit: "g" });
    add(`20${unit}总净重`, "calculated", `20${unit}总毛重 - 20${unit}总皮重`, { unit: "g" });
    add(`平均${unit}重`, "calculated", `20${unit}总净重 / 20`, { unit: `g/${unit}` });
    const limitField = unit === "片" ? "重量差异限度" : testKeyValue === "fill_variation" ? "装量差异限度" : "重量差异限度";
    add(limitField, "calculated", limitValue, { unit: "%" });
    if (unit === "片") {
      add("片重上限", "calculated", `平均片重 * (1 + ${limitField} / 100)`, { unit: "g" });
      add("片重下限", "calculated", `平均片重 * (1 - ${limitField} / 100)`, { unit: "g" });
    } else {
      add("粒重上限", "calculated", `平均粒重 * (1 + ${limitField} / 100)`, { unit: "g" });
      add("粒重下限", "calculated", `平均粒重 * (1 - ${limitField} / 100)`, { unit: "g" });
    }
    for (let index = 1; index <= 20; index += 1) add(`${unit}${index}-重`, "fillable", "", { unit: "g" });
  }
  if (testKeyValue === "fill_variation") {
    add("20粒囊壳总重", "calculated", Array.from({ length: 20 }, (_, index) => `粒${index + 1}-囊壳重`).join(" + "), { unit: "g" });
    add("平均装量", "calculated", "(20粒总净重 - 20粒囊壳总重) / 20", { unit: "g/粒" });
    for (let index = 1; index <= 20; index += 1) {
      add(`粒${index}-总重`, "fillable", "", { unit: "g" });
      add(`粒${index}-囊壳重`, "fillable", "", { unit: "g" });
      add(`粒${index}-装量`, "calculated", `粒${index}-总重 - 粒${index}-囊壳重`, { unit: "g" });
    }
  }
  return {
    name: testKeyValue === "fill_variation" ? "装量差异" : "重量差异",
    source: "dedicated_layout",
    fields,
  };
}

function diammoniumDissolutionMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "甘草酸二铵待包装品溶出度",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: diammoniumDissolutionFieldKey(name),
  });
}

function diammoniumPackagingDissolutionMethodGroup() {
  const fillable = [
    ["对照含量", "%", "number"],
    ["对照毛重", "mg", "number"],
    ["对照皮重", "mg", "number"],
    ["样品波长", "nm", "text"],
    ["空白OD", "", "number"],
    ["空白溶剂OD", "", "number"],
    ["对照OD", "", "number"],
    ["样1-OD", "", "number"],
    ["样2-OD", "", "number"],
    ["样3-OD", "", "number"],
    ["样4-OD", "", "number"],
    ["样5-OD", "", "number"],
    ["样6-OD", "", "number"],
  ].map(([name, unit, type]) => diammoniumDissolutionMethodField(name, "fillable", "", { unit, type }));
  const sampleFormula = (index) => `(样${index}-OD - 空白OD) * 1.898 * 对照含量 * 对照净重 * 100 / ((对照OD - 空白OD) * 25)`;
  const calculated = [
    ["对照净重", "对照毛重 - 对照皮重", "mg"],
    ["样1-溶出度", sampleFormula(1), "%"],
    ["样2-溶出度", sampleFormula(2), "%"],
    ["样3-溶出度", sampleFormula(3), "%"],
    ["样4-溶出度", sampleFormula(4), "%"],
    ["样5-溶出度", sampleFormula(5), "%"],
    ["样6-溶出度", sampleFormula(6), "%"],
    ["平均溶出度", "(样1-溶出度 + 样2-溶出度 + 样3-溶出度 + 样4-溶出度 + 样5-溶出度 + 样6-溶出度) / 6", "%"],
  ].map(([name, formula, unit]) => diammoniumDissolutionMethodField(name, "calculated", formula, { unit }));
  return {
    name: "甘草酸二铵待包装品溶出度",
    source: "dedicated_layout",
    fields: [...fillable, ...calculated],
  };
}

const SPECIAL_DISSOLUTION_PRODUCTS = new Set([
  "allopurinol",
  "atenolol",
  "azithromycin",
  "clarithromycin",
  "hydrochlorothiazide",
  "isosorbide_dinitrate",
  "levofloxacin",
  "pantoprazole",
  "simvastatin",
  "spironolactone",
  "terazosin",
  "verapamil",
]);

function specialDissolutionApplies(productKey, stageKey, testKeyValue) {
  if (!SPECIAL_DISSOLUTION_PRODUCTS.has(productKey)) return false;
  if (!["packaging", "finished"].includes(stageKey)) return false;
  if (productKey === "pantoprazole") return testKeyValue === "acid_release" || testKeyValue === "dissolution";
  return testKeyValue === "dissolution";
}

function specialDissolutionPrefix(productKey, stageKey, testKeyValue) {
  return `${stageKey}/${testKeyValue}/${productKey}_uv`;
}

function specialDissolutionFieldKey(productKey, stageKey, testKeyValue, name) {
  return `${specialDissolutionPrefix(productKey, stageKey, testKeyValue)}/${str(name).replace(/[\\/]/g, "_")}`;
}

function sduInput(ctx, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: specialDissolutionFieldKey(ctx.productKey, ctx.stageKey, ctx.testKeyValue, field) });
}

function specialDissolutionTable(ctx, label, columnWidths, rows, order, extra = {}) {
  return {
    type: "table",
    label: `${ctx.displayName}${label}`,
    sourceTemplateId: `dedicated/${ctx.productKey}_${ctx.stageKey}_${ctx.testKeyValue}`,
    compactTable: true,
    columnWidths,
    rowHeights: extra.rowHeights,
    rows,
    order,
  };
}

function specialDissolutionTitleTable(ctx) {
  return specialDissolutionTable(ctx, "测定与计算", ["100%"], [
    [contentCell("测定与计算", { bold: true, align: "left" })],
  ], 151);
}

function specialDissolutionBpcBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("测定与计算", { colspan: 5, bold: true, align: "left" })],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")], { colspan: 2, align: "left" }),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2, align: "left" }),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算", { rowspan: 2, colspan: 2 }),
        contentCell("含量=CX×A×OD", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×100]×100%/（571×0.1）", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionAtenololBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("测定与计算", { colspan: 5, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空）×M对重×5×对%]×100%/[（OD对-OD空）×2×25]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionAzithromycinBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [contentCell("测定与计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("", { colspan: 6 })],
      [contentCell("对照品计算", { colspan: 6 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 5 }),
      ],
      [
        contentCell("峰面积（Ar）", { rowspan: 2 }),
        contentCell("Ar1"),
        contentCell("Ar2"),
        contentCell("平均（Ar）", { colspan: 2 }),
        contentCell("RD≤2.0%"),
      ],
      [
        contentCell([sduInput(ctx, "对照1-峰面积")]),
        contentCell([sduInput(ctx, "对照2-峰面积")]),
        contentCell([sduInput(ctx, "对照平均峰面积", { readonlyDisplay: true })], { colspan: 2 }),
        contentCell([sduInput(ctx, "对照RD", { readonlyDisplay: true }), textPart("%")]),
      ],
      [contentCell("供试品计算", { colspan: 6, align: "left" })],
      [
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 5, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（A样×m对×18×对照%）/（A对×0.25×1000）]×100%", { colspan: 5, align: "left" }),
      ],
      [contentCell("供试品峰面积", { colspan: 6 })],
      [
        contentCell([textPart("AR1:"), sduInput(ctx, "样1-峰面积")]),
        contentCell([textPart("AR2:"), sduInput(ctx, "样2-峰面积")]),
        contentCell([textPart("AR3:"), sduInput(ctx, "样3-峰面积")]),
        contentCell([textPart("AR4:"), sduInput(ctx, "样4-峰面积")]),
        contentCell([textPart("AR5:"), sduInput(ctx, "样5-峰面积")]),
        contentCell([textPart("AR6:"), sduInput(ctx, "样6-峰面积")]),
      ],
      [contentCell("供试品溶出量（%）", { colspan: 6 })],
      [
        contentCell([textPart("CX1:"), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX2:"), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX3:"), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX4:"), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX5:"), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX6:"), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151, { rowHeights: [undefined, "180px"] }),
  ];
}

function specialDissolutionClarithromycinBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [contentCell("测定与计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 6 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 5 }),
      ],
      [
        contentCell("峰面积（Ar）", { rowspan: 2 }),
        contentCell("Ar1"),
        contentCell("Ar2"),
        contentCell("平均（Ar）", { colspan: 2 }),
        contentCell("RD≤2.0%"),
      ],
      [
        contentCell([sduInput(ctx, "对照1-峰面积")]),
        contentCell([sduInput(ctx, "对照2-峰面积")]),
        contentCell([sduInput(ctx, "对照平均峰面积", { readonlyDisplay: true })], { colspan: 2 }),
        contentCell([sduInput(ctx, "对照RD", { readonlyDisplay: true }), textPart("%")]),
      ],
      [contentCell("供试品计算", { colspan: 6 })],
      [
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 5, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（A样×m对×18×对照%）/（A对×0.25×1000）]×100%", { colspan: 5, align: "left" }),
      ],
      [contentCell("供试品峰面积", { colspan: 6 })],
      [
        contentCell([textPart("AR1:"), sduInput(ctx, "样1-峰面积")]),
        contentCell([textPart("AR2:"), sduInput(ctx, "样2-峰面积")]),
        contentCell([textPart("AR3:"), sduInput(ctx, "样3-峰面积")]),
        contentCell([textPart("AR4:"), sduInput(ctx, "样4-峰面积")]),
        contentCell([textPart("AR5:"), sduInput(ctx, "样5-峰面积")]),
        contentCell([textPart("AR6:"), sduInput(ctx, "样6-峰面积")]),
      ],
      [contentCell("供试品溶出量（%）", { colspan: 6 })],
      [
        contentCell([textPart("CX1:"), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX2:"), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX3:"), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX4:"), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX5:"), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX6:"), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionIsosorbideBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [contentCell("测定与计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 6 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 5 }),
      ],
      [
        contentCell("峰面积（Ar）", { rowspan: 2 }),
        contentCell("Ar1"),
        contentCell("Ar2"),
        contentCell("平均（Ar）", { colspan: 2 }),
        contentCell("RD≤2.0%"),
      ],
      [
        contentCell([sduInput(ctx, "对照1-峰面积")]),
        contentCell([sduInput(ctx, "对照2-峰面积")]),
        contentCell([sduInput(ctx, "对照平均峰面积", { readonlyDisplay: true })], { colspan: 2 }),
        contentCell([sduInput(ctx, "对照RD", { readonlyDisplay: true }), textPart("%")]),
      ],
      [contentCell("供试品计算", { colspan: 6 })],
      [
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 5, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（A样×对照%×对照称重）/（A对×2×5）]×100%", { colspan: 5, align: "left" }),
      ],
      [contentCell("供试品峰面积", { colspan: 6 })],
      [
        contentCell([textPart("AR1:"), sduInput(ctx, "样1-峰面积")]),
        contentCell([textPart("AR2:"), sduInput(ctx, "样2-峰面积")]),
        contentCell([textPart("AR3:"), sduInput(ctx, "样3-峰面积")]),
        contentCell([textPart("AR4:"), sduInput(ctx, "样4-峰面积")]),
        contentCell([textPart("AR5:"), sduInput(ctx, "样5-峰面积")]),
        contentCell([textPart("AR6:"), sduInput(ctx, "样6-峰面积")]),
      ],
      [contentCell("供试品溶出量（%）", { colspan: 6 })],
      [
        contentCell([textPart("CX1:"), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX2:"), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX3:"), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX4:"), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX5:"), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX6:"), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionHydrochlorothiazideBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("测定与计算", { colspan: 5, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell([textPart("计算"), lineBreakPart(), textPart("公式")], { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×m对×对%×9]×100%/[（OD对-OD空白）×4×25]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出量", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionLevofloxacinBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("测定与计算", { colspan: 5, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=（OD样×M对重×对%×9）×100%/（OD对×0.1×1000）", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionPantoprazoleBlocks(ctx) {
  const resultName = specialDissolutionResultName(ctx.productKey, ctx.testKeyValue);
  const resultField = (index) => `样${index}-${resultName}`;
  const resultLabel = ctx.testKeyValue === "acid_release" ? "供试品溶出度" : "供试品释放度";
  return [
    {
      type: "title",
      title: "测定与计算",
      text: "测定与计算",
      sectionRef: "operation",
      order: 150,
    },
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×m对×对%×0.9458×9]×100%/[（OD对-OD空白）×4×40]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell(resultLabel, { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, resultField(1), { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, resultField(2), { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, resultField(3), { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, resultField(4), { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, resultField(5), { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, resultField(6), { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionSimvastatinBlocks(ctx) {
  return [
    specialDissolutionTable(ctx, "测定与计算", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [contentCell("测定与计算", { colspan: 6, bold: true, align: "left" })],
      [contentCell("对照品计算", { colspan: 6 })],
      [
        contentCell([textPart("含量对照："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 5 }),
      ],
      [
        contentCell("峰面积（Ar）", { rowspan: 2 }),
        contentCell("Ar1"),
        contentCell("Ar2"),
        contentCell("平均（Ar）", { colspan: 2 }),
        contentCell("RD≤2.0%"),
      ],
      [
        contentCell([sduInput(ctx, "对照1-峰面积")]),
        contentCell([sduInput(ctx, "对照2-峰面积")]),
        contentCell([sduInput(ctx, "对照平均峰面积", { readonlyDisplay: true })], { colspan: 2 }),
        contentCell([sduInput(ctx, "对照RD", { readonlyDisplay: true }), textPart("%")]),
      ],
      [contentCell("供试品计算", { colspan: 6 })],
      [
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 5, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（A样×m对×9×对照%）/（A对×10×10）]×100%", { colspan: 5, align: "left" }),
      ],
      [contentCell("供试品峰面积", { colspan: 6 })],
      [
        contentCell([textPart("AR1:"), sduInput(ctx, "样1-峰面积")]),
        contentCell([textPart("AR2:"), sduInput(ctx, "样2-峰面积")]),
        contentCell([textPart("AR3:"), sduInput(ctx, "样3-峰面积")]),
        contentCell([textPart("AR4:"), sduInput(ctx, "样4-峰面积")]),
        contentCell([textPart("AR5:"), sduInput(ctx, "样5-峰面积")]),
        contentCell([textPart("AR6:"), sduInput(ctx, "样6-峰面积")]),
      ],
      [contentCell("供试品溶出量（%）", { colspan: 6 })],
      [
        contentCell([textPart("CX1:"), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX2:"), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX3:"), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX4:"), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX5:"), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("CX6:"), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionSpironolactoneBlocks(ctx) {
  return [
    {
      type: "title",
      title: "测定与计算",
      text: "测定与计算",
      sectionRef: "operation",
      order: 150,
    },
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空白）×M对照×对%×2]×100%/[（OD对-OD空白）×20]", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("溶出量", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionTerazosinBlocks(ctx) {
  return [
    {
      type: "title",
      title: "测定与计算",
      text: "测定与计算",
      sectionRef: "operation",
      order: 150,
    },
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "20%", "20%", "20%", "20%"], [
      [
        contentCell([textPart("对照含量："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell("称样"),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 4 }),
      ],
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 5, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), sduInput(ctx, "空白OD")]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("空白胶囊:"), sduInput(ctx, "空白胶囊OD")]),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")], { colspan: 2 }),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")], { colspan: 2 }),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
      [
        contentCell("计算", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×ODX）/ODR", { colspan: 4, align: "left" }),
      ],
      [
        contentCell("含量（%）=[（OD样-OD空胶）×0.914×m对×对照%]×100%/（OD对×5×2）", { colspan: 4, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell(""),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell(""),
      ],
    ], 151),
  ];
}

function specialDissolutionVerapamilBlocks(ctx) {
  const deltaInput = (prefix) => sduInput(ctx, `${prefix}-△A`, { readonlyDisplay: true });
  const absorbanceRows = (wavelength) => ([
    [
      contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
      contentCell([textPart(`△${wavelength}：`), sduInput(ctx, `检测波长${wavelength}`)], { colspan: 4, align: "left" }),
    ],
    [
      contentCell([textPart("空白 OD:"), sduInput(ctx, `空白${wavelength}OD`)]),
      contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, `空白溶剂${wavelength}OD`)], { colspan: 2 }),
      contentCell([textPart("对照 OD:"), sduInput(ctx, `对照${wavelength}OD`)]),
    ],
    [
      contentCell([textPart("供试品"), lineBreakPart(), textPart("（OD）")], { rowspan: 2 }),
      contentCell([textPart("样 1:"), sduInput(ctx, `样1-${wavelength}OD`)]),
      contentCell([textPart("样 2:"), sduInput(ctx, `样2-${wavelength}OD`)]),
      contentCell([textPart("样 3:"), sduInput(ctx, `样3-${wavelength}OD`)]),
    ],
    [
      contentCell([textPart("样 4:"), sduInput(ctx, `样4-${wavelength}OD`)]),
      contentCell([textPart("样 5:"), sduInput(ctx, `样5-${wavelength}OD`)]),
      contentCell([textPart("样 6:"), sduInput(ctx, `样6-${wavelength}OD`)]),
    ],
  ]);
  const deltaRow = (label, prefix) => [
    contentCell(`△A ${label}：`, { colspan: 2 }),
    contentCell([
      textPart("△278nm－△300nm="),
      deltaInput(prefix),
    ], { colspan: 3, align: "left" }),
  ];
  return [
    {
      type: "title",
      title: "测定与计算",
      text: "测定与计算",
      sectionRef: "operation",
      order: 150,
    },
    specialDissolutionTable(ctx, "测定与计算", ["10%", "10%", "26.66%", "26.67%", "26.67%"], [
      [contentCell("对照品计算", { colspan: 5 })],
      [
        contentCell([textPart("对照："), sduInput(ctx, "对照含量"), textPart("%")], { colspan: 2 }),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ], { colspan: 3 }),
      ],
      ...absorbanceRows("278nm"),
      ...absorbanceRows("300nm"),
      deltaRow("对照", "对照"),
      ...Array.from({ length: 6 }, (_, index) => deltaRow(`样 ${index + 1}`, `样${index + 1}`)),
      [
        contentCell("计算公式", { rowspan: 2, colspan: 2 }),
        contentCell("含量（CX）=（CR×AX）/AR", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("含量（%）=（OD样×M对重×对%×9×2）×100%/（OD对×40×5）", { colspan: 3, align: "left" }),
      ],
      [
        contentCell("供试品溶出度", { rowspan: 2, colspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function specialDissolutionReferenceBlocks(ctx) {
  const resultName = specialDissolutionResultName(ctx.productKey, ctx.testKeyValue);
  const sampleResultField = (index) => `样${index}-${resultName}`;
  const readonlyResult = ctx.calculatedResults === true;
  const blankLabel = ctx.productKey === "terazosin" ? "空白胶囊 OD:" : "空白 OD:";
  const blankField = ctx.productKey === "terazosin" ? "空白胶囊OD" : "空白OD";
  return [
    specialDissolutionTitleTable(ctx),
    specialDissolutionTable(ctx, "对照品计算", ["24%", "76%"], [
      [contentCell("对照品计算", { colspan: 2, bold: true, align: "left" })],
      [
        contentCell([textPart("对照含量："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ]),
      ],
    ], 152),
    specialDissolutionTable(ctx, "吸光度", ["8%", "10%", "27.33%", "27.33%", "27.34%"], [
      [
        contentCell("吸\n\n光\n\n度", { rowspan: 4 }),
        contentCell([textPart("波长："), sduInput(ctx, "检测波长"), textPart("nm")], { colspan: 4, align: "left" }),
      ],
      [
        contentCell([textPart(blankLabel), sduInput(ctx, blankField)]),
        contentCell([textPart("空白溶剂 OD:"), sduInput(ctx, "空白溶剂OD")], { colspan: 2 }),
        contentCell([textPart("对照 OD:"), sduInput(ctx, "对照OD")]),
      ],
      [
        contentCell("供试品"),
        contentCell([textPart("样 1:"), sduInput(ctx, "样1-OD")]),
        contentCell([textPart("样 2:"), sduInput(ctx, "样2-OD")]),
        contentCell([textPart("样 3:"), sduInput(ctx, "样3-OD")]),
      ],
      [
        contentCell("(OD)"),
        contentCell([textPart("样 4:"), sduInput(ctx, "样4-OD")]),
        contentCell([textPart("样 5:"), sduInput(ctx, "样5-OD")]),
        contentCell([textPart("样 6:"), sduInput(ctx, "样6-OD")]),
      ],
    ], 153),
    specialDissolutionTable(ctx, "计算公式", ["18%", "82%"], [
      [contentCell("计算公式", { rowspan: 2 }), contentCell("含量=CX×A×OD", { align: "left" })],
      [contentCell(ctx.formulaText || "按标准规定计算每片（粒）结果。", { align: "left" })],
    ], 154),
    specialDissolutionTable(ctx, "结果", ["18%", "27.33%", "27.33%", "27.34%"], [
      [
        contentCell(`供试品${resultName}`, { rowspan: 2 }),
        contentCell([textPart("样 1="), sduInput(ctx, sampleResultField(1), { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("样 2="), sduInput(ctx, sampleResultField(2), { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("样 3="), sduInput(ctx, sampleResultField(3), { readonlyDisplay: readonlyResult }), textPart("%")]),
      ],
      [
        contentCell([textPart("样 4="), sduInput(ctx, sampleResultField(4), { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("样 5="), sduInput(ctx, sampleResultField(5), { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("样 6="), sduInput(ctx, sampleResultField(6), { readonlyDisplay: readonlyResult }), textPart("%")]),
      ],
    ], 155),
  ];
}

function specialDissolutionHplcBlocks(ctx) {
  const readonlyResult = ctx.calculatedResults === true;
  return [
    specialDissolutionTitleTable(ctx),
    specialDissolutionTable(ctx, "对照品计算", ["24%", "76%"], [
      [contentCell("对照品计算", { colspan: 2, bold: true, align: "left" })],
      [
        contentCell([textPart("对照含量："), sduInput(ctx, "对照含量"), textPart("%")]),
        contentCell([
          textPart("m="),
          sduInput(ctx, "对照毛重"),
          textPart(" - "),
          sduInput(ctx, "对照皮重"),
          textPart(" = "),
          sduInput(ctx, "对照净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ]),
      ],
    ], 152),
    specialDissolutionTable(ctx, "对照峰面积", ["20%", "20%", "20%", "20%", "20%"], [
      [
        contentCell("峰面积（Ar）"),
        contentCell([textPart("Ar1:"), sduInput(ctx, "对照1-峰面积")]),
        contentCell([textPart("Ar2:"), sduInput(ctx, "对照2-峰面积")]),
        contentCell([textPart("平均（Ar）:"), sduInput(ctx, "对照平均峰面积", { readonlyDisplay: true })]),
        contentCell([textPart("RD≤2.0%:"), sduInput(ctx, "对照RD", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 153),
    specialDissolutionTable(ctx, "供试品计算", ["18%", "82%"], [
      [contentCell("供试品计算", { colspan: 2, bold: true, align: "left" })],
      [contentCell("计算公式", { rowspan: 2 }), contentCell("含量（CX）=（CR×AX）/AR", { align: "left" })],
      [contentCell(ctx.formulaText || "按外标法以峰面积计算每粒（片）的溶出量。", { align: "left" })],
    ], 154),
    specialDissolutionTable(ctx, "供试品峰面积", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [
        contentCell([textPart("AR1:"), sduInput(ctx, "样1-峰面积")]),
        contentCell([textPart("AR2:"), sduInput(ctx, "样2-峰面积")]),
        contentCell([textPart("AR3:"), sduInput(ctx, "样3-峰面积")]),
        contentCell([textPart("AR4:"), sduInput(ctx, "样4-峰面积")]),
        contentCell([textPart("AR5:"), sduInput(ctx, "样5-峰面积")]),
        contentCell([textPart("AR6:"), sduInput(ctx, "样6-峰面积")]),
      ],
    ], 155),
    specialDissolutionTable(ctx, "结果", ["16.66%", "16.66%", "16.66%", "16.66%", "16.66%", "16.7%"], [
      [
        contentCell([textPart("CX1:"), sduInput(ctx, "样1-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("CX2:"), sduInput(ctx, "样2-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("CX3:"), sduInput(ctx, "样3-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("CX4:"), sduInput(ctx, "样4-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("CX5:"), sduInput(ctx, "样5-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
        contentCell([textPart("CX6:"), sduInput(ctx, "样6-溶出度", { readonlyDisplay: readonlyResult }), textPart("%")]),
      ],
    ], 156),
  ];
}

function specialDissolutionDoubleUvBlocks(ctx) {
  const deltaField = (prefix) => `${prefix}-△A`;
  return [
    specialDissolutionTitleTable(ctx),
    ...specialDissolutionReferenceBlocks({ ...ctx, formulaText: "含量（%）=（△A样×M对重×对%×9×2）×100%/（△A对×40×5）" }).filter((block) => /对照品计算/.test(str(block.label))),
    specialDissolutionTable(ctx, "278nm吸光度", ["8%", "10%", "27.33%", "27.33%", "27.34%"], [
      [contentCell("吸\n\n光\n\n度", { rowspan: 4 }), contentCell("△278nm", { colspan: 4, align: "left" })],
      [contentCell([textPart("空白OD:"), sduInput(ctx, "空白278nmOD")]), contentCell([textPart("空白溶剂OD:"), sduInput(ctx, "空白溶剂278nmOD")], { colspan: 2 }), contentCell([textPart("对照OD:"), sduInput(ctx, "对照278nmOD")])],
      [contentCell("供试品（OD）"), contentCell([textPart("样1:"), sduInput(ctx, "样1-278nmOD")]), contentCell([textPart("样2:"), sduInput(ctx, "样2-278nmOD")]), contentCell([textPart("样3:"), sduInput(ctx, "样3-278nmOD")])],
      [contentCell(""), contentCell([textPart("样4:"), sduInput(ctx, "样4-278nmOD")]), contentCell([textPart("样5:"), sduInput(ctx, "样5-278nmOD")]), contentCell([textPart("样6:"), sduInput(ctx, "样6-278nmOD")])],
    ], 153),
    specialDissolutionTable(ctx, "300nm吸光度", ["8%", "10%", "27.33%", "27.33%", "27.34%"], [
      [contentCell("吸\n\n光\n\n度", { rowspan: 4 }), contentCell("△300nm", { colspan: 4, align: "left" })],
      [contentCell([textPart("空白OD:"), sduInput(ctx, "空白300nmOD")]), contentCell([textPart("空白溶剂OD:"), sduInput(ctx, "空白溶剂300nmOD")], { colspan: 2 }), contentCell([textPart("对照OD:"), sduInput(ctx, "对照300nmOD")])],
      [contentCell("供试品（OD）"), contentCell([textPart("样1:"), sduInput(ctx, "样1-300nmOD")]), contentCell([textPart("样2:"), sduInput(ctx, "样2-300nmOD")]), contentCell([textPart("样3:"), sduInput(ctx, "样3-300nmOD")])],
      [contentCell(""), contentCell([textPart("样4:"), sduInput(ctx, "样4-300nmOD")]), contentCell([textPart("样5:"), sduInput(ctx, "样5-300nmOD")]), contentCell([textPart("样6:"), sduInput(ctx, "样6-300nmOD")])],
    ], 154),
    specialDissolutionTable(ctx, "吸光度差值", ["50%", "50%"], [
      [contentCell([textPart("△A对照：△278nm－△300nm="), sduInput(ctx, deltaField("对照"), { readonlyDisplay: true })]), contentCell("")],
      ...Array.from({ length: 6 }, (_, index) => [
        contentCell([textPart(`△A样${index + 1}：△278nm－△300nm=`), sduInput(ctx, deltaField(`样${index + 1}`), { readonlyDisplay: true })]),
        contentCell(index === 0 ? " " : ""),
      ]),
    ], 155),
    specialDissolutionTable(ctx, "计算公式", ["18%", "82%"], [
      [contentCell("计算公式", { rowspan: 2 }), contentCell("含量（CX）=（CR×AX）/AR", { align: "left" })],
      [contentCell("含量（%）=（△A样×M对重×对%×9×2）×100%/（△A对×40×5）", { align: "left" })],
    ], 156),
    specialDissolutionTable(ctx, "结果", ["18%", "27.33%", "27.33%", "27.34%"], [
      [contentCell("供试品溶出度", { rowspan: 2 }), contentCell([textPart("样1="), sduInput(ctx, "样1-溶出度", { readonlyDisplay: true }), textPart("%")]), contentCell([textPart("样2="), sduInput(ctx, "样2-溶出度", { readonlyDisplay: true }), textPart("%")]), contentCell([textPart("样3="), sduInput(ctx, "样3-溶出度", { readonlyDisplay: true }), textPart("%")])],
      [contentCell([textPart("样4="), sduInput(ctx, "样4-溶出度", { readonlyDisplay: true }), textPart("%")]), contentCell([textPart("样5="), sduInput(ctx, "样5-溶出度", { readonlyDisplay: true }), textPart("%")]), contentCell([textPart("样6="), sduInput(ctx, "样6-溶出度", { readonlyDisplay: true }), textPart("%")])],
    ], 157),
  ];
}

function specialDissolutionContext(productKey, stageKey, testKeyValue) {
  const productLabels = {
    allopurinol: "别嘌醇片",
    atenolol: "阿替洛尔片",
    azithromycin: "阿奇霉素胶囊",
    clarithromycin: "克拉霉素胶囊",
    hydrochlorothiazide: "氢氯噻嗪片",
    isosorbide_dinitrate: "硝酸异山梨酯片",
    levofloxacin: "盐酸左氧氟沙星胶囊",
    pantoprazole: "泮托拉唑钠肠溶片",
    simvastatin: "辛伐他汀片",
    spironolactone: "螺内酯片",
    terazosin: "盐酸特拉唑嗪胶囊",
    verapamil: "盐酸维拉帕米片",
  };
  const ctx = {
    productKey,
    stageKey,
    testKeyValue,
    displayName: `${productLabels[productKey] || productKey}${specialDissolutionResultName(productKey, testKeyValue)}`,
    calculatedResults: false,
    formulaText: "",
    measurementKind: "uv",
  };
  if (productKey === "allopurinol") {
    ctx.calculatedResults = true;
    ctx.formulaText = "含量（%）=[（OD样-OD空白）×100]×100%/（571×0.1）";
  } else if (productKey === "atenolol") {
    ctx.calculatedResults = true;
    ctx.formulaText = "含量（%）=[（OD样-OD空）×M对重×5×对%]×100%/[（OD对-OD空）×2×25]";
  } else if (productKey === "azithromycin") {
    ctx.calculatedResults = true;
    ctx.measurementKind = "hplc";
    ctx.formulaText = "含量（%）=[（A样×m对×18×对照%）/（A对×0.25×1000）]×100%";
  } else if (productKey === "clarithromycin") {
    ctx.calculatedResults = true;
    ctx.measurementKind = "hplc";
    ctx.formulaText = "含量（%）=[（A样×m对×18×对照%）/（A对×0.25×1000）]×100%";
  } else if (productKey === "hydrochlorothiazide") {
    ctx.calculatedResults = true;
    ctx.formulaText = "含量（%）=[（OD样-OD空白）×m对×对%×9]×100%/[（OD对-OD空白）×4×25]";
  } else if (productKey === "isosorbide_dinitrate") {
    ctx.calculatedResults = true;
    ctx.measurementKind = "hplc";
    ctx.formulaText = "含量（%）=[（A样×对照%×对照称重）/（A对×2×5）]×100%";
  } else if (productKey === "levofloxacin") {
    ctx.calculatedResults = true;
    ctx.formulaText = "含量（%）=（OD样×M对重×对%×9）×100%/（OD对×0.1×1000）";
  } else if (productKey === "pantoprazole") {
    ctx.calculatedResults = true;
    ctx.formulaText = "释放度（%）=（OD样-OD空白）×对照净重×对照含量×0.9458×9/[（OD对-OD空白）×4×40]";
  } else if (productKey === "simvastatin") {
    ctx.calculatedResults = true;
    ctx.measurementKind = "hplc";
    ctx.formulaText = "含量（%）=[（A样×m对×9×对照%）/（A对×10×10）]×100%";
  } else if (productKey === "spironolactone") {
    ctx.calculatedResults = true;
    ctx.formulaText = "含量（%）=[（OD样-OD空白）×M对照×对%×2]×100%/[（OD对-OD空白）×20]";
  } else if (productKey === "terazosin") {
    ctx.calculatedResults = true;
    ctx.formulaText = "溶出度（%）=（OD样-空白胶囊OD）×0.914×对照净重×对照含量×100/（对照OD×5×2）";
  } else if (productKey === "verapamil") {
    ctx.calculatedResults = true;
    ctx.measurementKind = "double_uv";
    ctx.formulaText = "含量（%）=（△A样×M对重×对%×9×2）×100%/（△A对×40×5）";
  }
  return ctx;
}

function specialDissolutionResultName(productKey, testKeyValue) {
  if (testKeyValue === "acid_release") return "酸中释放度";
  if (productKey === "pantoprazole") return "释放度";
  return "溶出度";
}

function specialDissolutionLayoutBlocks(productKey, stageKey, testKeyValue) {
  const ctx = specialDissolutionContext(productKey, stageKey, testKeyValue);
  if (productKey === "allopurinol") return specialDissolutionBpcBlocks(ctx);
  if (productKey === "atenolol") return specialDissolutionAtenololBlocks(ctx);
  if (productKey === "azithromycin") return specialDissolutionAzithromycinBlocks(ctx);
  if (productKey === "clarithromycin") return specialDissolutionClarithromycinBlocks(ctx);
  if (productKey === "isosorbide_dinitrate") return specialDissolutionIsosorbideBlocks(ctx);
  if (productKey === "hydrochlorothiazide") return specialDissolutionHydrochlorothiazideBlocks(ctx);
  if (productKey === "levofloxacin") return specialDissolutionLevofloxacinBlocks(ctx);
  if (productKey === "pantoprazole") return specialDissolutionPantoprazoleBlocks(ctx);
  if (productKey === "simvastatin") return specialDissolutionSimvastatinBlocks(ctx);
  if (productKey === "spironolactone") return specialDissolutionSpironolactoneBlocks(ctx);
  if (productKey === "terazosin") return specialDissolutionTerazosinBlocks(ctx);
  if (productKey === "verapamil") return specialDissolutionVerapamilBlocks(ctx);
  if (ctx.measurementKind === "hplc") return specialDissolutionHplcBlocks(ctx);
  if (ctx.measurementKind === "double_uv") return specialDissolutionDoubleUvBlocks(ctx);
  return specialDissolutionReferenceBlocks(ctx);
}

function specialDissolutionMethodField(ctx, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: ctx.displayName,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: specialDissolutionFieldKey(ctx.productKey, ctx.stageKey, ctx.testKeyValue, name),
  });
}

function specialDissolutionMethodGroup(productKey, stageKey, testKeyValue) {
  const ctx = specialDissolutionContext(productKey, stageKey, testKeyValue);
  const resultName = specialDissolutionResultName(productKey, testKeyValue);
  const fields = [];
  const add = (...args) => fields.push(specialDissolutionMethodField(ctx, ...args));
  if (["azithromycin", "clarithromycin", "isosorbide_dinitrate", "simvastatin"].includes(productKey)) {
    add("对照含量", "fillable", "", { unit: "%" });
    add("对照毛重", "fillable", "", { unit: "mg" });
    add("对照皮重", "fillable", "", { unit: "mg" });
    add("对照净重", "calculated", "对照毛重 - 对照皮重", { unit: "mg" });
    add("对照1-峰面积");
    add("对照2-峰面积");
    add("对照平均峰面积", "calculated", "(对照1-峰面积 + 对照2-峰面积) / 2");
    add("对照RD", "calculated", "ABS(对照1-峰面积 - 对照2-峰面积) / 对照平均峰面积 * 100", { unit: "%" });
    for (let index = 1; index <= 6; index += 1) {
      add(`样${index}-峰面积`);
      if (productKey === "azithromycin") {
        add(`样${index}-溶出度`, "calculated", `样${index}-峰面积 * 对照净重 * 18 * 对照含量 * 100 / (对照平均峰面积 * 0.25 * 1000)`, { unit: "%" });
      } else if (productKey === "simvastatin") {
        add(`样${index}-溶出度`, "calculated", `样${index}-峰面积 * 对照净重 * 9 * 对照含量 * 100 / (对照平均峰面积 * 10 * 10)`, { unit: "%" });
      } else if (productKey === "isosorbide_dinitrate") {
        add(`样${index}-溶出度`, "calculated", `样${index}-峰面积 * 对照含量 * 对照净重 * 100 / (对照平均峰面积 * 2 * 5)`, { unit: "%" });
      } else if (productKey === "clarithromycin") {
        add(`样${index}-溶出度`, "calculated", `样${index}-峰面积 * 对照净重 * 18 * 对照含量 * 100 / (对照平均峰面积 * 0.25 * 1000)`, { unit: "%" });
      } else {
        add(`样${index}-溶出度`, "fillable", "", { unit: "%" });
      }
    }
  } else if (productKey === "verapamil") {
    add("检测波长", "prefilled", "", { unit: "nm", type: "text", defaultValue: "278nm±2nm / 300nm±2nm" });
    add("检测波长278nm", "prefilled", "", { unit: "nm", type: "text", defaultValue: "278nm±2nm" });
    add("检测波长300nm", "prefilled", "", { unit: "nm", type: "text", defaultValue: "300nm±2nm" });
    add("对照含量", "fillable", "", { unit: "%" });
    add("对照毛重", "fillable", "", { unit: "mg" });
    add("对照皮重", "fillable", "", { unit: "mg" });
    add("对照净重", "calculated", "对照毛重 - 对照皮重", { unit: "mg" });
    for (const wavelength of ["278nm", "300nm"]) {
      add(`空白${wavelength}OD`);
      add(`空白溶剂${wavelength}OD`);
      add(`对照${wavelength}OD`);
      for (let index = 1; index <= 6; index += 1) add(`样${index}-${wavelength}OD`);
    }
    add("对照-△A", "calculated", "对照278nmOD - 对照300nmOD");
    for (let index = 1; index <= 6; index += 1) {
      add(`样${index}-△A`, "calculated", `样${index}-278nmOD - 样${index}-300nmOD`);
      add(`样${index}-溶出度`, "calculated", `样${index}-△A * 对照净重 * 对照含量 * 9 * 2 * 100 / (对照-△A * 40 * 5)`, { unit: "%" });
    }
  } else if (productKey === "allopurinol") {
    add("检测波长", "fillable", "", { unit: "nm" });
    add("空白OD");
    add("空白溶剂OD");
    for (let index = 1; index <= 6; index += 1) {
      add(`样${index}-OD`);
      add(`样${index}-溶出度`, "calculated", `(样${index}-OD - 空白OD) * 100 * 100 / (571 * 0.1)`, { unit: "%" });
    }
  } else {
    add("检测波长", "fillable", "", { unit: "nm", type: "text" });
    add("对照含量", "fillable", "", { unit: "%" });
    add("对照毛重", "fillable", "", { unit: "mg" });
    add("对照皮重", "fillable", "", { unit: "mg" });
    add("对照净重", "calculated", "对照毛重 - 对照皮重", { unit: "mg" });
    if (productKey === "terazosin") {
      add("空白OD");
      add("空白溶剂OD");
      add("空白胶囊OD");
    } else {
      add("空白OD");
      add("空白溶剂OD");
    }
    add("对照OD");
    for (let index = 1; index <= 6; index += 1) {
      add(`样${index}-OD`);
      const resultField = `样${index}-${resultName}`;
      if (productKey === "hydrochlorothiazide") {
        add(resultField, "calculated", `(样${index}-OD - 空白OD) * 对照净重 * 对照含量 * 9 * 100 / ((对照OD - 空白OD) * 4 * 25)`, { unit: "%" });
      } else if (productKey === "atenolol") {
        add(resultField, "calculated", `(样${index}-OD - 空白OD) * 对照净重 * 5 * 对照含量 * 100 / ((对照OD - 空白OD) * 2 * 25)`, { unit: "%" });
      } else if (productKey === "levofloxacin") {
        add(resultField, "calculated", `样${index}-OD * 对照净重 * 对照含量 * 9 * 100 / (对照OD * 0.1 * 1000)`, { unit: "%" });
      } else if (productKey === "pantoprazole") {
        add(resultField, "calculated", `(样${index}-OD - 空白OD) * 对照净重 * 对照含量 * 0.9458 * 9 / ((对照OD - 空白OD) * 4 * 40)`, { unit: "%" });
      } else if (productKey === "spironolactone") {
        add(resultField, "calculated", `(样${index}-OD - 空白OD) * 对照净重 * 对照含量 * 2 * 100 / ((对照OD - 空白OD) * 20)`, { unit: "%" });
      } else if (productKey === "terazosin") {
        add(resultField, "calculated", `(样${index}-OD - 空白胶囊OD) * 0.914 * 对照净重 * 对照含量 * 100 / (对照OD * 5 * 2)`, { unit: "%" });
      } else {
        add(resultField, "fillable", "", { unit: "%" });
      }
    }
  }
  const resultFields = Array.from({ length: 6 }, (_, index) => `样${index + 1}-${resultName}`);
  add(`平均${resultName}`, "calculated", `(${resultFields.join(" + ")}) / 6`, { unit: "%" });
  add("结论-结果", "calculated", `平均${resultName}`, { unit: "%" });
  return {
    name: ctx.displayName,
    source: "dedicated_layout",
    fields,
  };
}

function pantoprazoleContentMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: `泮托拉唑钠肠溶片${diammoniumStageLabel(stageKey)}含量`,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: pantoprazoleContentFieldKey(stageKey, name),
  });
}

function pantoprazoleContentMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(pantoprazoleContentMethodField(stageKey, ...args));
  add("对照含量", "fillable", "", { unit: "%" });
  for (const index of [1, 2]) {
    add(`对照${index}-毛重`, "fillable", "", { unit: "mg" });
    add(`对照${index}-皮重`, "fillable", "", { unit: "mg" });
    add(`对照${index}-净重`, "calculated", `对照${index}-毛重 - 对照${index}-皮重`, { unit: "mg" });
  }
  if (stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: "万片" });
    add("理论片重", "calculated", "投料量 / (批量 * 10)", { unit: "g/片" });
  } else {
    add("20片总净重", "fillable", "", { unit: "g" });
    add("平均片重", "calculated", "20片总净重 / 20", { unit: "g/片" });
  }
  for (const index of [1, 2]) {
    add(`样${index}-毛重`, "fillable", "", { unit: "mg" });
    add(`样${index}-皮重`, "fillable", "", { unit: "mg" });
    add(`样${index}-净重`, "calculated", `样${index}-毛重 - 样${index}-皮重`, { unit: "mg" });
  }
  add("检测波长", "fillable", "", { unit: "nm", type: "text" });
  add("空白OD");
  add("空白溶剂OD");
  add("对照1-OD");
  add("对照2-OD");
  add("对照1-OD/mg", "calculated", "(对照1-OD - 空白溶剂OD) / 对照1-净重");
  add("对照2-OD/mg", "calculated", "(对照2-OD - 空白溶剂OD) / 对照2-净重");
  add("平均-OD/mg", "calculated", "(对照1-OD/mg + 对照2-OD/mg) / 2");
  add("对照RD", "calculated", "ABS(对照1-OD/mg - 对照2-OD/mg) / 平均-OD/mg * 100", { unit: "%" });
  const tabletWeight = stageKey === "intermediate" ? "理论片重" : "平均片重";
  for (const index of [1, 2]) {
    add(`样${index}-OD`);
    add(`样${index}-含量`, "calculated", `(样${index}-OD - 空白OD) * 0.9458 * 对照含量 * 2 * ${tabletWeight} * 1000 * 100 / (平均-OD/mg * 样${index}-净重 * 40)`, { unit: "%" });
  }
  add("平均含量", "calculated", "(样1-含量 + 样2-含量) / 2", { unit: "%" });
  add("RD", "calculated", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", { unit: "%" });
  add("结论-结果", "calculated", "平均含量", { unit: "%" });
  return {
    name: `泮托拉唑钠肠溶片${diammoniumStageLabel(stageKey)}含量`,
    source: "dedicated_layout",
    fields,
  };
}

function pantoprazoleAcidResistanceMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "泮托拉唑钠肠溶片成品耐酸力",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    options: arr(extra.options).map((option) => str(option)).filter(Boolean),
    field_key: pantoprazoleAcidResistanceFieldKey(name),
  });
}

function pantoprazoleAcidResistanceMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(pantoprazoleAcidResistanceMethodField(...args));
  add("酸处理介质", "prefilled", "", { type: "text", defaultValue: "0.1mol/L盐酸溶液" });
  add("介质体积", "prefilled", "", { unit: "ml", defaultValue: 900 });
  add("转速", "prefilled", "", { unit: "rpm", defaultValue: 100 });
  add("酸处理时间", "prefilled", "", { unit: "min", defaultValue: 120 });
  add("检测波长", "prefilled", "", { type: "text", unit: "nm", defaultValue: "292nm±2nm" });
  add("外观确认", "fillable", "", { type: "select", options: ["符合", "不符合"] });
  add("对照含量", "fillable", "", { unit: "%" });
  add("对照毛重", "fillable", "", { unit: "mg" });
  add("对照皮重", "fillable", "", { unit: "mg" });
  add("对照净重", "calculated", "对照毛重 - 对照皮重", { unit: "mg" });
  add("空白OD");
  add("空白溶剂OD");
  add("对照OD");
  for (let index = 1; index <= 6; index += 1) {
    add(`样${index}-OD`);
    add(`样${index}-耐酸力`, "calculated", `(样${index}-OD - 空白OD) * 对照净重 * 对照含量 * 0.9458 * 4 / ((对照OD - 空白OD) * 40)`, { unit: "%" });
  }
  add("平均耐酸力", "calculated", "(样1-耐酸力 + 样2-耐酸力 + 样3-耐酸力 + 样4-耐酸力 + 样5-耐酸力 + 样6-耐酸力) / 6", { unit: "%" });
  add("结论-结果", "calculated", "平均耐酸力", { unit: "%" });
  return {
    name: "泮托拉唑钠肠溶片成品耐酸力",
    source: "dedicated_layout",
    fields,
  };
}

function allopurinolRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "别嘌醇片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: allopurinolRelatedFieldKey(name),
  });
}

function allopurinolRelatedSubstancesMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(allopurinolRelatedMethodField(...args));
  const referenceNames = [...ALLOPURINOL_RELATED_NAMED_IMPURITIES, "别嘌醇对照"];
  for (const name of referenceNames) {
    add(`称样/${name}-含量`, name === "别嘌醇对照" ? "fillable" : "fillable", "", { unit: "%" });
    add(`称样/${name}-毛重`, "fillable", "", { unit: "mg" });
    add(`称样/${name}-皮重`, "fillable", "", { unit: "mg" });
    add(`称样/${name}-净重`, "calculated", `称样/${name}-毛重 - 称样/${name}-皮重`, { unit: "mg" });
  }
  add("称样/供试品-毛重", "fillable", "", { unit: "mg" });
  add("称样/供试品-皮重", "fillable", "", { unit: "mg" });
  add("称样/供试品-净重", "calculated", "称样/供试品-毛重 - 称样/供试品-皮重", { unit: "mg" });
  add("系统适用性-1", "fillable", "", { type: "number" });
  add("系统适用性-2", "fillable", "", { type: "number" });
  add("系统适用性-1是否符合", "calculated", "系统适用性-1 >= 1.5", { type: "boolean" });
  add("系统适用性-2是否符合", "calculated", "系统适用性-2 <= 1.5", { type: "boolean" });
  add("系统适用性-是否符合", "calculated", "系统适用性-1是否符合 && 系统适用性-2是否符合", { type: "boolean" });
  for (const name of referenceNames) {
    add(`对照/${name}/Ar1`);
    add(`对照/${name}/Ar2`);
    add(`对照/${name}/Ar3`);
    add(`对照/${name}/Ar`, "calculated", `(对照/${name}/Ar1 + 对照/${name}/Ar2 + 对照/${name}/Ar3) / 3`);
    add(`对照/${name}/RSD`, "calculated", `RSD(对照/${name}/Ar1, 对照/${name}/Ar2, 对照/${name}/Ar3)`, { unit: "%" });
  }
  for (const name of ALLOPURINOL_RELATED_NAMED_IMPURITIES) {
    add(`供试品/${name}-Ar`);
  }
  add("供试品/未知单个Ar");
  add("供试品/未知总Ar");
  const referenceVolume = { 杂质A: 6, 杂质B: 3, 杂质C: 3, 杂质D: 3, 杂质E: 3 };
  for (const name of ALLOPURINOL_RELATED_NAMED_IMPURITIES) {
    add(
      `结果/${name}`,
      "calculated",
      `供试品/${name}-Ar * 称样/${name}-净重 * 称样/${name}-含量 * ${referenceVolume[name]} * 10 * 100 / (对照/${name}/Ar * 称样/供试品-净重 * 100 * 100 * 100)`,
      { unit: "%" },
    );
  }
  add(
    "结果/单杂",
    "calculated",
    "供试品/未知单个Ar * 称样/别嘌醇对照-净重 * 称样/别嘌醇对照-含量 * 3 * 10 * 100 / (对照/别嘌醇对照/Ar * 称样/供试品-净重 * 100 * 100 * 100)",
    { unit: "%" },
  );
  add(
    "结果/总杂",
    "calculated",
    "结果/杂质A + 结果/杂质B + 结果/杂质C + 结果/杂质D + 结果/杂质E + 供试品/未知总Ar * 称样/别嘌醇对照-净重 * 称样/别嘌醇对照-含量 * 3 * 10 * 100 / (对照/别嘌醇对照/Ar * 称样/供试品-净重 * 100 * 100 * 100)",
    { unit: "%" },
  );
  add(
    "结果/测定是否符合规定",
    "calculated",
    "结果/杂质A <= 0.20 && 结果/杂质B <= 0.10 && 结果/杂质C <= 0.10 && 结果/杂质D <= 0.10 && 结果/杂质E <= 0.10 && 结果/单杂 <= 0.10 && 结果/总杂 <= 0.30",
    { type: "boolean" },
  );
  add("结论-结果", "calculated", "结果/测定是否符合规定", { type: "boolean" });
  return {
    name: "别嘌醇片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function pantoprazoleRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "pantoprazole" && stageKey === "finished" && testKeyValue === "related_substances";
}

function pantoprazoleRelatedFieldKey(name) {
  return `finished/related_substances/pantoprazole_hplc/${str(name).replace(/[\\/]/g, "_")}`;
}

function pantoprazoleRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: pantoprazoleRelatedFieldKey(field) });
}

function pantoprazoleRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `泮托拉唑钠肠溶片成品有关物质${label}`,
    sourceTemplateId: "dedicated/pantoprazole_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function pantoprazoleRelatedLayoutBlocks() {
  return [
    pantoprazoleRelatedTable("称样", ["30%", "70%"], [
      [contentCell("名称"), contentCell("称样")],
      [
        contentCell("供试品（g）"),
        contentCell([
          textPart("m="),
          pantoprazoleRelatedInput("供试品-毛重"),
          textPart(" - "),
          pantoprazoleRelatedInput("供试品-皮重"),
          textPart(" = "),
          pantoprazoleRelatedInput("供试品-净重", { readonlyDisplay: true }),
          textPart(" mg"),
        ]),
      ],
    ], 140),
    pantoprazoleRelatedTable("计算", ["30%", "28%", "42%"], [
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([
          textPart("AR 对="),
          pantoprazoleRelatedInput("对照溶液峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("供试品溶液"),
        contentCell("总杂质峰面积"),
        contentCell([
          textPart("AR 总="),
          pantoprazoleRelatedInput("总杂质峰面积"),
        ], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2 })],
      [
        contentCell([textPart("主成份峰相对保留时间 0.24"), lineBreakPart(), textPart("以上各杂质峰的和")]),
        contentCell([
          textPart("____________________________"),
          textPart(" ×100%= "),
          pantoprazoleRelatedInput("总杂", { readonlyDisplay: true }),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 150),
  ];
}

function pantoprazoleRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "泮托拉唑钠肠溶片成品有关物质称样", "泮托拉唑钠肠溶片成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...pantoprazoleRelatedLayoutBlocks());
  return nextBlocks;
}

function pantoprazoleRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "泮托拉唑钠肠溶片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: pantoprazoleRelatedFieldKey(name),
  });
}

function pantoprazoleRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(pantoprazoleRelatedMethodField(...args));
  add("供试品-毛重", "fillable", "", { unit: "mg" });
  add("供试品-皮重", "fillable", "", { unit: "mg" });
  add("供试品-净重", "calculated", "供试品-毛重 - 供试品-皮重", { unit: "mg" });
  add("对照溶液峰面积");
  add("总杂质峰面积");
  add("总杂", "calculated", "总杂质峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总杂", { unit: "%" });
  return {
    name: "泮托拉唑钠肠溶片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function atenololRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "atenolol" && stageKey === "finished" && testKeyValue === "related_substances";
}

function atenololRelatedFieldKey(name) {
  return `finished/related_substances/atenolol_total_impurity/${str(name).replace(/[\\/]/g, "_")}`;
}

function atenololRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: atenololRelatedFieldKey(field) });
}

function atenololRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...atenololRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(atenololRelatedFieldKey),
  };
}

function atenololRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `阿替洛尔片成品有关物质${label}`,
    sourceTemplateId: "dedicated/atenolol_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function atenololRelatedLayoutBlocks() {
  return [
    atenololRelatedTable("称样", ["31%", "14%", "55%"], [
      [contentCell("2.3.4.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("供试品（mg）"),
        contentCell("/"),
        contentCell([
          textPart("m="),
          atenololRelatedInput("供试品-毛重"),
          textPart(" - "),
          atenololRelatedInput("供试品-皮重"),
          textPart(" = "),
          atenololRelatedReadonly(
            "供试品-净重",
            "供试品-净重 = 供试品-毛重 - 供试品-皮重",
            ["供试品-毛重", "供试品-皮重"],
          ),
        ]),
      ],
    ], 141),
    atenololRelatedTable("计算", ["20%", "32%", "48%"], [
      [contentCell("2.3.4.2 计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([
          textPart("AR 对="),
          atenololRelatedInput("对照溶液峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("供试品溶液"),
        contentCell("总杂质峰面积"),
        contentCell([
          textPart("AR 总="),
          atenololRelatedInput("总杂质峰面积"),
        ], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2, bold: true })],
      [
        contentCell("总杂质%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          atenololRelatedReadonly(
            "总杂质",
            "总杂质 = 总杂质峰面积 / 对照溶液峰面积 × 100",
            ["总杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 156),
  ];
}

function atenololRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "阿替洛尔片成品有关物质称样", "阿替洛尔片成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...atenololRelatedLayoutBlocks());
  return nextBlocks;
}

function atenololRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "阿替洛尔片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: atenololRelatedFieldKey(name),
  });
}

function atenololRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(atenololRelatedMethodField(...args));
  add("供试品-毛重", "fillable", "", { unit: "mg" });
  add("供试品-皮重", "fillable", "", { unit: "mg" });
  add("供试品-净重", "calculated", "供试品-毛重 - 供试品-皮重", { unit: "mg" });
  add("对照溶液峰面积");
  add("总杂质峰面积");
  add("总杂质", "calculated", "总杂质峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总杂质", { unit: "%" });
  return {
    name: "阿替洛尔片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function clarithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "clarithromycin" && stageKey === "finished" && testKeyValue === "related_substances";
}

function clarithromycinRelatedFieldKey(name) {
  return `finished/related_substances/clarithromycin_single_impurity/${str(name).replace(/[\\/]/g, "_")}`;
}

function clarithromycinRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: clarithromycinRelatedFieldKey(field) });
}

function clarithromycinRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...clarithromycinRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(clarithromycinRelatedFieldKey),
  };
}

function clarithromycinRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `克拉霉素胶囊成品有关物质${label}`,
    sourceTemplateId: "dedicated/clarithromycin_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function clarithromycinRelatedLayoutBlocks() {
  return [
    clarithromycinRelatedTable("称样", ["31%", "14%", "55%"], [
      [contentCell("2.3.4.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("供试品（mg）"),
        contentCell("/"),
        contentCell([
          textPart("m="),
          clarithromycinRelatedInput("供试品-毛重"),
          textPart(" - "),
          clarithromycinRelatedInput("供试品-皮重"),
          textPart(" = "),
          clarithromycinRelatedReadonly(
            "供试品-净重",
            "供试品-净重 = 供试品-毛重 - 供试品-皮重",
            ["供试品-毛重", "供试品-皮重"],
          ),
          textPart(" mg"),
        ]),
      ],
    ], 141),
    clarithromycinRelatedTable("计算", ["20%", "32%", "48%"], [
      [contentCell("2.3.4.2 计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([
          textPart("AR 对="),
          clarithromycinRelatedInput("对照溶液峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("供试品"),
        contentCell("单个最大杂质峰面积"),
        contentCell([
          textPart("AR 单="),
          clarithromycinRelatedInput("单个最大杂质峰面积"),
        ], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2, bold: true })],
      [
        contentCell("单个杂质%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          clarithromycinRelatedReadonly(
            "单个杂质",
            "单个杂质 = 单个最大杂质峰面积 / 对照溶液峰面积 × 100",
            ["单个最大杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 156),
  ];
}

function clarithromycinRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "克拉霉素胶囊成品有关物质称样", "克拉霉素胶囊成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...clarithromycinRelatedLayoutBlocks());
  return nextBlocks;
}

function clarithromycinRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "克拉霉素胶囊成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: clarithromycinRelatedFieldKey(name),
  });
}

function clarithromycinRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(clarithromycinRelatedMethodField(...args));
  add("供试品-毛重", "fillable", "", { unit: "mg" });
  add("供试品-皮重", "fillable", "", { unit: "mg" });
  add("供试品-净重", "calculated", "供试品-毛重 - 供试品-皮重", { unit: "mg" });
  add("对照溶液峰面积");
  add("单个最大杂质峰面积");
  add("单个杂质", "calculated", "单个最大杂质峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "单个杂质", { unit: "%" });
  return {
    name: "克拉霉素胶囊成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function hydrochlorothiazideRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "hydrochlorothiazide" && stageKey === "finished" && testKeyValue === "related_substances";
}

function hydrochlorothiazideRelatedFieldKey(name) {
  return `finished/related_substances/hydrochlorothiazide_impurities/${str(name).replace(/[\\/]/g, "_")}`;
}

function hydrochlorothiazideRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: hydrochlorothiazideRelatedFieldKey(field) });
}

function hydrochlorothiazideRelatedRadio(name) {
  return {
    type: "radio",
    fieldKey: hydrochlorothiazideRelatedFieldKey(name),
    options: ["是", "否"],
  };
}

function hydrochlorothiazideRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...hydrochlorothiazideRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(hydrochlorothiazideRelatedFieldKey),
  };
}

function hydrochlorothiazideRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `氢氯噻嗪片成品有关物质${label}`,
    sourceTemplateId: "dedicated/hydrochlorothiazide_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function hydrochlorothiazideRelatedLayoutBlocks() {
  return [
    hydrochlorothiazideRelatedTable("称样", ["24%", "17%", "59%"], [
      [contentCell("2.3.5.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("氢氯噻嗪对照品（mg）"),
        contentCell([hydrochlorothiazideRelatedInput("氢氯噻嗪对照品含量")]),
        contentCell([hydrochlorothiazideRelatedInput("氢氯噻嗪对照品称样")]),
      ],
      [
        contentCell("氯噻嗪对照品（mg）"),
        contentCell([hydrochlorothiazideRelatedInput("氯噻嗪对照品含量")]),
        contentCell([hydrochlorothiazideRelatedInput("氯噻嗪对照品称样")]),
      ],
      [
        contentCell("供试品（g）"),
        contentCell("/"),
        contentCell([hydrochlorothiazideRelatedInput("供试品称样")]),
      ],
    ], 141),
    hydrochlorothiazideRelatedTable("计算", ["18%", "53%", "29%"], [
      [contentCell("2.3.5.2 计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("系统适用性", { rowspan: 2 }),
        contentCell("项目"),
        contentCell("是否符合规定"),
      ],
      [
        contentCell("氢氯噻嗪峰与氯噻嗪峰的分离度应大于2.5。"),
        contentCell([hydrochlorothiazideRelatedRadio("系统适用性分离度")]),
      ],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([
          textPart("Ar 对="),
          hydrochlorothiazideRelatedInput("对照溶液峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("供试品", { rowspan: 2 }),
        contentCell("其他单个最大峰面积"),
        contentCell([
          textPart("Ar 大="),
          hydrochlorothiazideRelatedInput("其他单个最大峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("总杂质峰面积"),
        contentCell([
          textPart("Ar 总="),
          hydrochlorothiazideRelatedInput("总杂质峰面积"),
        ], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2, bold: true })],
      [
        contentCell("单大%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          hydrochlorothiazideRelatedReadonly(
            "单大",
            "单大 = 其他单个最大峰面积 / 对照溶液峰面积 × 100",
            ["其他单个最大峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("总和%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          hydrochlorothiazideRelatedReadonly(
            "总和",
            "总和 = 总杂质峰面积 / 对照溶液峰面积 × 100",
            ["总杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 156),
  ];
}

function hydrochlorothiazideRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "氢氯噻嗪片成品有关物质称样", "氢氯噻嗪片成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...hydrochlorothiazideRelatedLayoutBlocks());
  return nextBlocks;
}

function hydrochlorothiazideRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "氢氯噻嗪片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: hydrochlorothiazideRelatedFieldKey(name),
    options: arr(extra.options).map((item) => str(item)).filter(Boolean),
  });
}

function hydrochlorothiazideRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(hydrochlorothiazideRelatedMethodField(...args));
  add("氢氯噻嗪对照品含量", "fillable", "", { unit: "%" });
  add("氢氯噻嗪对照品称样", "fillable", "", { unit: "mg" });
  add("氯噻嗪对照品含量", "fillable", "", { unit: "%" });
  add("氯噻嗪对照品称样", "fillable", "", { unit: "mg" });
  add("供试品称样", "fillable", "", { unit: "g" });
  add("系统适用性分离度", "fillable", "", { type: "select", options: ["是", "否"] });
  add("对照溶液峰面积");
  add("其他单个最大峰面积");
  add("总杂质峰面积");
  add("单大", "calculated", "其他单个最大峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("总和", "calculated", "总杂质峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总和", { unit: "%" });
  return {
    name: "氢氯噻嗪片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function terazosinRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "terazosin" && stageKey === "finished" && testKeyValue === "related_substances";
}

function terazosinRelatedFieldKey(name) {
  return `finished/related_substances/terazosin_impurities/${str(name).replace(/[\\/]/g, "_")}`;
}

function terazosinRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: terazosinRelatedFieldKey(field) });
}

function terazosinRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...terazosinRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(terazosinRelatedFieldKey),
  };
}

function terazosinRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `盐酸特拉唑嗪胶囊成品有关物质${label}`,
    sourceTemplateId: "dedicated/terazosin_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function terazosinRelatedLayoutBlocks() {
  return [
    terazosinRelatedTable("称样", ["31%", "69%"], [
      [contentCell("2.3.4.1 称样", { colspan: 2, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("称样")],
      [
        contentCell("供试品（g）"),
        contentCell([
          textPart("m="),
          terazosinRelatedInput("供试品-毛重"),
          textPart(" - "),
          terazosinRelatedInput("供试品-皮重"),
          textPart(" = "),
          terazosinRelatedReadonly(
            "供试品-净重",
            "供试品-净重 = 供试品-毛重 - 供试品-皮重",
            ["供试品-毛重", "供试品-皮重"],
          ),
          textPart(" g"),
        ]),
      ],
    ], 141),
    terazosinRelatedTable("计算", ["20%", "32%", "48%"], [
      [contentCell("2.3.4.2 计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([textPart("AR 对="), terazosinRelatedInput("对照溶液峰面积")], { align: "left" }),
      ],
      [
        contentCell("供试品溶液", { rowspan: 2 }),
        contentCell("单杂质峰面积"),
        contentCell([textPart("AR 单="), terazosinRelatedInput("单杂质峰面积")], { align: "left" }),
      ],
      [
        contentCell("总杂质峰面积"),
        contentCell([textPart("AR 总="), terazosinRelatedInput("总杂质峰面积")], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2, bold: true })],
      [
        contentCell([textPart("主成份峰相对保留时"), lineBreakPart(), textPart("间0.45以上各杂质峰"), lineBreakPart(), textPart("的和")], { rowspan: 2 }),
        contentCell([
          textPart("单杂="),
          textPart("____________________________"),
          textPart("×100%="),
          terazosinRelatedReadonly(
            "单杂",
            "单杂 = 单杂质峰面积 / 对照溶液峰面积 × 0.5",
            ["单杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell([
          textPart("总杂="),
          textPart("____________________________"),
          textPart("×100%="),
          terazosinRelatedReadonly(
            "总杂",
            "总杂 = 总杂质峰面积 / 对照溶液峰面积 × 0.5",
            ["总杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 156),
  ];
}

function terazosinRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "盐酸特拉唑嗪胶囊成品有关物质称样", "盐酸特拉唑嗪胶囊成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...terazosinRelatedLayoutBlocks());
  return nextBlocks;
}

function terazosinRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "盐酸特拉唑嗪胶囊成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: terazosinRelatedFieldKey(name),
  });
}

function terazosinRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(terazosinRelatedMethodField(...args));
  add("供试品-毛重", "fillable", "", { unit: "g" });
  add("供试品-皮重", "fillable", "", { unit: "g" });
  add("供试品-净重", "calculated", "供试品-毛重 - 供试品-皮重", { unit: "g" });
  add("对照溶液峰面积");
  add("单杂质峰面积");
  add("总杂质峰面积");
  add("单杂", "calculated", "单杂质峰面积 / 对照溶液峰面积 * 0.5", { unit: "%" });
  add("总杂", "calculated", "总杂质峰面积 / 对照溶液峰面积 * 0.5", { unit: "%" });
  add("结论-结果", "calculated", "总杂", { unit: "%" });
  return {
    name: "盐酸特拉唑嗪胶囊成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function verapamilRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "verapamil" && stageKey === "finished" && testKeyValue === "related_substances";
}

function verapamilRelatedFieldKey(name) {
  return `finished/related_substances/verapamil_total_impurity/${str(name).replace(/[\\/]/g, "_")}`;
}

function verapamilRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: verapamilRelatedFieldKey(field) });
}

function verapamilRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...verapamilRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(verapamilRelatedFieldKey),
  };
}

function verapamilRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `盐酸维拉帕米片成品有关物质${label}`,
    sourceTemplateId: "dedicated/verapamil_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function verapamilRelatedLayoutBlocks() {
  return [
    verapamilRelatedTable("称样", ["31%", "14%", "55%"], [
      [contentCell("2.3.4.1 称样", { colspan: 3, bold: true, align: "left" })],
      [contentCell("名称"), contentCell("含量（%）"), contentCell("称样")],
      [
        contentCell("供试品（g）"),
        contentCell("/"),
        contentCell([
          textPart("m="),
          verapamilRelatedInput("供试品-毛重"),
          textPart(" - "),
          verapamilRelatedInput("供试品-皮重"),
          textPart(" = "),
          verapamilRelatedReadonly(
            "供试品-净重",
            "供试品-净重 = 供试品-毛重 - 供试品-皮重",
            ["供试品-毛重", "供试品-皮重"],
          ),
          textPart(" g"),
        ]),
      ],
    ], 141),
    verapamilRelatedTable("计算", ["20%", "32%", "48%"], [
      [contentCell("2.3.4.2 计算", { colspan: 3, bold: true, align: "left" })],
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([textPart("AR 对="), verapamilRelatedInput("对照溶液峰面积")], { align: "left" }),
      ],
      [
        contentCell("供试品"),
        contentCell("总杂质峰面积和"),
        contentCell([textPart("AR 总="), verapamilRelatedInput("总杂质峰面积和")], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2, bold: true })],
      [
        contentCell("总杂质%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          verapamilRelatedReadonly(
            "总杂质",
            "总杂质 = 总杂质峰面积和 / 对照溶液峰面积 × 100",
            ["总杂质峰面积和", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 156),
  ];
}

function verapamilRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || ["有关物质称样", "有关物质峰面积计算", "盐酸维拉帕米片成品有关物质称样", "盐酸维拉帕米片成品有关物质计算"].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...verapamilRelatedLayoutBlocks());
  return nextBlocks;
}

function verapamilRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "盐酸维拉帕米片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: verapamilRelatedFieldKey(name),
  });
}

function verapamilRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(verapamilRelatedMethodField(...args));
  add("供试品-毛重", "fillable", "", { unit: "g" });
  add("供试品-皮重", "fillable", "", { unit: "g" });
  add("供试品-净重", "calculated", "供试品-毛重 - 供试品-皮重", { unit: "g" });
  add("对照溶液峰面积");
  add("总杂质峰面积和");
  add("总杂质", "calculated", "总杂质峰面积和 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总杂质", { unit: "%" });
  return {
    name: "盐酸维拉帕米片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function azithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "azithromycin" && stageKey === "finished" && testKeyValue === "related_substances";
}

function azithromycinRelatedFieldKey(name) {
  return `finished/related_substances/azithromycin_impurities/${str(name).replace(/[\\/]/g, "_")}`;
}

const AZITHROMYCIN_RELATED_PART_FIELD_MAP = {
  "称样1-毛重": "系统适用性对照品称样",
  "称样2-毛重": "杂质A对照品称样",
  "称样3-毛重": "杂质S对照品称样",
  "称样4-毛重": "供试品称样",
  对照溶液主峰面积: "对照溶液主峰面积",
  杂质H峰面积: "杂质H峰面积",
  杂质Q峰面积: "杂质Q峰面积",
  杂质B峰面积: "杂质B峰面积",
  其他单个最大杂质峰面积: "其他单个最大杂质峰面积",
  各杂质校正峰面积和: "各杂质校正峰面积和",
  杂质H: "杂质H",
  杂质Q: "杂质Q",
  杂质B: "杂质B",
  其他单杂: "其他单杂",
  总杂: "总杂（校）",
};

const AZITHROMYCIN_RELATED_PART_KEY_MAP = {
  "layout/related_substances/azithromycin/system_suitability_resolution_ok": "系统适用性分离度",
  "layout/related_substances/azithromycin/system_suitability_snr_ok": "灵敏度信噪比",
  "layout/related_substances/azithromycin/TR": "TR",
  "layout/related_substances/azithromycin/TQ": "TQ",
  "layout/related_substances/azithromycin/TJ": "TJ",
  "layout/related_substances/azithromycin/TI": "TI",
  "layout/related_substances/azithromycin/TS": "TS",
  "layout/related_substances/azithromycin/TA": "TA",
  "layout/related_substances/azithromycin/TH": "TH",
  "layout/related_substances/azithromycin/TB": "TB",
  "layout/related_substances/azithromycin/sensitivity_ar": "灵敏度溶液峰面积",
  "layout/related_substances/azithromycin/ArH_corrected": "杂质H校正峰面积",
  "layout/related_substances/azithromycin/ArQ_corrected": "杂质Q校正峰面积",
};

const AZITHROMYCIN_RELATED_FORMULA_META = {
  杂质H校正峰面积: {
    text: "杂质H校正峰面积 = 杂质H峰面积 × 0.1",
    deps: ["杂质H峰面积"],
  },
  杂质Q校正峰面积: {
    text: "杂质Q校正峰面积 = 杂质Q峰面积 × 0.4",
    deps: ["杂质Q峰面积"],
  },
  杂质H: {
    text: "杂质H = 杂质H校正峰面积 / 对照溶液主峰面积 × 0.5",
    deps: ["杂质H校正峰面积", "对照溶液主峰面积"],
  },
  杂质Q: {
    text: "杂质Q = 杂质Q校正峰面积 / 对照溶液主峰面积 × 0.5",
    deps: ["杂质Q校正峰面积", "对照溶液主峰面积"],
  },
  杂质B: {
    text: "杂质B = 杂质B峰面积 / 对照溶液主峰面积 × 0.5",
    deps: ["杂质B峰面积", "对照溶液主峰面积"],
  },
  其他单杂: {
    text: "其他单杂 = 其他单个最大杂质峰面积 / 对照溶液主峰面积 × 0.5",
    deps: ["其他单个最大杂质峰面积", "对照溶液主峰面积"],
  },
  "总杂（校）": {
    text: "总杂（校） = 各杂质校正峰面积和 / 对照溶液主峰面积 × 0.5",
    deps: ["各杂质校正峰面积和", "对照溶液主峰面积"],
  },
};

function withAzithromycinRelatedPartKey(part) {
  const item = { ...rec(part) };
  const fieldName = str(item.field);
  const mappedField = AZITHROMYCIN_RELATED_PART_FIELD_MAP[fieldName];
  if (mappedField) {
    item.field = mappedField;
    item.fieldKey = azithromycinRelatedFieldKey(mappedField);
  } else {
    const mappedKeyName = AZITHROMYCIN_RELATED_PART_KEY_MAP[str(item.fieldKey)];
    if (mappedKeyName) item.fieldKey = azithromycinRelatedFieldKey(mappedKeyName);
  }
  const resolvedName = str(item.fieldKey).startsWith("finished/related_substances/azithromycin_impurities/")
    ? str(item.field || Object.entries(AZITHROMYCIN_RELATED_PART_KEY_MAP).find(([, name]) => azithromycinRelatedFieldKey(name) === item.fieldKey)?.[1])
    : "";
  const meta = AZITHROMYCIN_RELATED_FORMULA_META[resolvedName];
  if (meta) {
    item.readonlyDisplay = true;
    item.advancedFormulaText = meta.text;
    item.advancedDependencyFieldKeys = meta.deps.map(azithromycinRelatedFieldKey);
  }
  return item;
}

function azithromycinRelatedSubstancesLayoutBlocks(layoutBlocks) {
  return arr(layoutBlocks).map((block) => {
    const data = { ...rec(block) };
    const label = str(data.label);
    if (str(data.type) !== "table" || !["有关物质称样", "阿奇霉素有关物质峰面积计算表"].includes(label)) return block;
    data.sourceTemplateId = "dedicated/azithromycin_finished_related_substances";
    if (label === "有关物质称样") {
      data.label = "阿奇霉素胶囊成品有关物质称样";
      data.columnWidths = ["32%", "12%", "56%"];
      const rows = arr(data.rows);
      data.rows = [
        [contentCell("2.2.5.1 称样", { colspan: 3, bold: true, align: "left" })],
        ...rows,
      ];
      data.rows = data.rows.map((row) => arr(row).map((cell) => {
        const nextCell = { ...rec(cell) };
        if (str(nextCell.rawText) === "含量/规格") nextCell.rawText = "含量（%）";
        return nextCell;
      }));
    } else {
      data.label = "阿奇霉素胶囊成品有关物质计算";
      data.columnWidths = Array.from({ length: 11 }, () => `${100 / 11}%`);
      const rows = arr(data.rows);
      data.rows = [
        [contentCell("2.2.5.2 计算", { colspan: 11, bold: true, align: "left" })],
        ...rows,
      ];
    }
    data.rows = arr(data.rows).map((row) => arr(row).map((cell) => {
      const nextCell = { ...rec(cell) };
      nextCell.parts = arr(nextCell.parts).map(withAzithromycinRelatedPartKey);
      return nextCell;
    }));
    return data;
  });
}

function azithromycinRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "阿奇霉素胶囊成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: azithromycinRelatedFieldKey(name),
    options: arr(extra.options).map((item) => str(item)).filter(Boolean),
  });
}

function azithromycinRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(azithromycinRelatedMethodField(...args));
  add("系统适用性对照品称样", "fillable", "", { unit: "mg" });
  add("杂质A对照品称样", "fillable", "", { unit: "mg" });
  add("杂质S对照品称样", "fillable", "", { unit: "mg" });
  add("供试品称样", "fillable", "", { unit: "g" });
  add("系统适用性分离度", "fillable", "", { type: "select", options: ["是", "否"] });
  add("灵敏度信噪比", "fillable", "", { type: "select", options: ["是", "否"] });
  for (const name of ["TR", "TQ", "TJ", "TI", "TS", "TA", "TH", "TB"]) add(name);
  add("对照溶液主峰面积");
  add("灵敏度溶液峰面积");
  add("杂质H峰面积");
  add("杂质Q峰面积");
  add("杂质H校正峰面积", "calculated", "杂质H峰面积 * 0.1");
  add("杂质Q校正峰面积", "calculated", "杂质Q峰面积 * 0.4");
  add("杂质B峰面积");
  add("其他单个最大杂质峰面积");
  add("各杂质校正峰面积和");
  add("杂质H", "calculated", "杂质H校正峰面积 / 对照溶液主峰面积 * 0.5", { unit: "%" });
  add("杂质Q", "calculated", "杂质Q校正峰面积 / 对照溶液主峰面积 * 0.5", { unit: "%" });
  add("杂质B", "calculated", "杂质B峰面积 / 对照溶液主峰面积 * 0.5", { unit: "%" });
  add("其他单杂", "calculated", "其他单个最大杂质峰面积 / 对照溶液主峰面积 * 0.5", { unit: "%" });
  add("总杂（校）", "calculated", "各杂质校正峰面积和 / 对照溶液主峰面积 * 0.5", { unit: "%" });
  add("结论-结果", "calculated", "总杂（校）", { unit: "%" });
  return {
    name: "阿奇霉素胶囊成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function simvastatinRelatedSubstancesApplies(productKey, stageKey, testKeyValue) {
  return productKey === "simvastatin" && stageKey === "finished" && testKeyValue === "related_substances";
}

function simvastatinRelatedFieldKey(name) {
  return `finished/related_substances/simvastatin_impurities/${str(name).replace(/[\\/]/g, "_")}`;
}

function simvastatinRelatedInput(field, options = {}) {
  return inputPart(field, { ...options, fieldKey: simvastatinRelatedFieldKey(field) });
}

function simvastatinRelatedReadonly(name, formulaText, dependencyNames, options = {}) {
  return {
    ...simvastatinRelatedInput(name, { readonlyDisplay: true, width: str(options.width) || "5em" }),
    advancedFormulaText: formulaText,
    advancedDependencyFieldKeys: dependencyNames.map(simvastatinRelatedFieldKey),
  };
}

function simvastatinRelatedTable(label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `辛伐他汀片成品有关物质${label}`,
    sourceTemplateId: "dedicated/simvastatin_finished_related_substances",
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function simvastatinMassParts(prefix, unit) {
  return [
    textPart("m="),
    simvastatinRelatedInput(`${prefix}-毛重`),
    textPart(" - "),
    simvastatinRelatedInput(`${prefix}-皮重`),
    textPart(" = "),
    simvastatinRelatedReadonly(
      `${prefix}-净重`,
      `${prefix}-净重 = ${prefix}-毛重 - ${prefix}-皮重`,
      [`${prefix}-毛重`, `${prefix}-皮重`],
    ),
    textPart(` ${unit}`),
  ];
}

function simvastatinRelatedCalculationLayoutBlocks() {
  return [
    simvastatinRelatedTable("计算称量与系统适用性", ["18%", "20%", "14%", "18%", "30%"], [
      [contentCell("计算", { colspan: 5, bold: true, align: "left" })],
      [
        contentCell("样"),
        contentCell(simvastatinMassParts("样", "g"), { colspan: 4, align: "left" }),
      ],
      [
        contentCell("辛伐他汀对照品"),
        contentCell([textPart("含量："), simvastatinRelatedInput("辛伐他汀对照品含量"), textPart("%")], { rowspan: 2 }),
        contentCell("酸溶液"),
        contentCell(simvastatinMassParts("酸溶液", "mg"), { colspan: 2, align: "left" }),
      ],
      [
        contentCell("辛伐他汀对照品"),
        contentCell("系统适用性", { rowspan: 2 }),
        contentCell(simvastatinMassParts("系统适用性辛伐他汀对照品", "mg"), { colspan: 2, align: "left" }),
      ],
      [
        contentCell("洛伐他汀对照品"),
        contentCell([textPart("含量："), simvastatinRelatedInput("洛伐他汀对照品含量"), textPart("%")]),
        contentCell(simvastatinMassParts("系统适用性洛伐他汀对照品", "mg"), { colspan: 2, align: "left" }),
      ],
      [
        contentCell("系统适用性", { rowspan: 2 }),
        contentCell("项目", { colspan: 3 }),
        contentCell("是否符合规定"),
      ],
      [
        contentCell("辛伐他汀酸峰与洛伐他汀峰之间的分离度应不小于 1.5，洛伐他汀峰与辛伐他汀峰之间的分离度应不小于 4.0。", { colspan: 3, align: "left" }),
        contentCell([
          { type: "radio", fieldKey: simvastatinRelatedFieldKey("系统适用性是否符合"), options: ["是", "否"] },
        ]),
      ],
    ], 150),
    simvastatinRelatedTable("计算峰面积与结果", ["18%", "32%", "50%"], [
      [
        contentCell("对照溶液"),
        contentCell("对照溶液峰面积"),
        contentCell([
          textPart("AR 对="),
          simvastatinRelatedInput("对照溶液峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("供试品溶液", { rowspan: 2 }),
        contentCell("其他单个最大峰面积"),
        contentCell([
          textPart("AR 单="),
          simvastatinRelatedInput("其他单个最大峰面积"),
        ], { align: "left" }),
      ],
      [
        contentCell("总杂质峰面积"),
        contentCell([
          textPart("AR 总="),
          simvastatinRelatedInput("总杂质峰面积"),
        ], { align: "left" }),
      ],
      [contentCell("计算"), contentCell("供试品", { colspan: 2 })],
      [
        contentCell("单杂%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          simvastatinRelatedReadonly(
            "单杂",
            "单杂 = 其他单个最大峰面积 / 对照溶液峰面积 × 100",
            ["其他单个最大峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
      [
        contentCell("总杂%="),
        contentCell([
          textPart("____________________________"),
          textPart("×100%="),
          simvastatinRelatedReadonly(
            "总杂",
            "总杂 = 总杂质峰面积 / 对照溶液峰面积 × 100",
            ["总杂质峰面积", "对照溶液峰面积"],
          ),
          textPart("%"),
        ], { colspan: 2 }),
      ],
    ], 151),
  ];
}

function simvastatinRelatedSubstancesLayoutBlocks(layoutBlocks) {
  const nextBlocks = arr(layoutBlocks).filter((block) => {
    const data = rec(block);
    const label = str(data.label);
    const title = str(data.title || data.text);
    const type = str(data.type);
    return !(
      (type === "title" && ["称样", "称重", "计算", "测定与计算"].includes(title))
      || [
        "有关物质称样",
        "有关物质峰面积计算",
        "样",
        "辛伐他汀片成品有关物质计算称量与系统适用性",
        "辛伐他汀片成品有关物质计算峰面积与结果",
      ].includes(label)
    );
  });
  const insertAt = postMethodBlockIndex(nextBlocks);
  nextBlocks.splice(insertAt >= 0 ? insertAt : nextBlocks.length, 0, ...simvastatinRelatedCalculationLayoutBlocks());
  return nextBlocks;
}

function simvastatinRelatedMethodField(name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: "辛伐他汀片成品有关物质",
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    field_key: simvastatinRelatedFieldKey(name),
    options: arr(extra.options).map((item) => str(item)).filter(Boolean),
  });
}

function simvastatinRelatedMethodGroup() {
  const fields = [];
  const add = (...args) => fields.push(simvastatinRelatedMethodField(...args));
  add("样-毛重", "fillable", "", { unit: "g" });
  add("样-皮重", "fillable", "", { unit: "g" });
  add("样-净重", "calculated", "样-毛重 - 样-皮重", { unit: "g" });
  add("辛伐他汀对照品含量", "fillable", "", { unit: "%" });
  add("酸溶液-毛重", "fillable", "", { unit: "mg" });
  add("酸溶液-皮重", "fillable", "", { unit: "mg" });
  add("酸溶液-净重", "calculated", "酸溶液-毛重 - 酸溶液-皮重", { unit: "mg" });
  add("系统适用性辛伐他汀对照品-毛重", "fillable", "", { unit: "mg" });
  add("系统适用性辛伐他汀对照品-皮重", "fillable", "", { unit: "mg" });
  add("系统适用性辛伐他汀对照品-净重", "calculated", "系统适用性辛伐他汀对照品-毛重 - 系统适用性辛伐他汀对照品-皮重", { unit: "mg" });
  add("洛伐他汀对照品含量", "fillable", "", { unit: "%" });
  add("系统适用性洛伐他汀对照品-毛重", "fillable", "", { unit: "mg" });
  add("系统适用性洛伐他汀对照品-皮重", "fillable", "", { unit: "mg" });
  add("系统适用性洛伐他汀对照品-净重", "calculated", "系统适用性洛伐他汀对照品-毛重 - 系统适用性洛伐他汀对照品-皮重", { unit: "mg" });
  add("系统适用性是否符合", "fillable", "", { type: "select", options: ["是", "否"] });
  add("对照溶液峰面积");
  add("其他单个最大峰面积");
  add("总杂质峰面积");
  add("单杂", "calculated", "其他单个最大峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("总杂", "calculated", "总杂质峰面积 / 对照溶液峰面积 * 100", { unit: "%" });
  add("结论-结果", "calculated", "总杂", { unit: "%" });
  return {
    name: "辛伐他汀片成品有关物质",
    source: "dedicated_layout",
    fields,
  };
}

function relatedSubstancesResultFieldKey(stageKey, testKeyValue, name) {
  return `${stageKey}/${testKeyValue}/s0/${str(name).replace(/[\\/]/g, "_")}`;
}

function relatedSubstancesResultMethodGroup(stageKey, testKeyValue) {
  const formulaByName = {
    单杂: "供试品单杂峰面积 / 对照溶液峰面积 * 100",
    总杂: "供试品总杂峰面积 / 对照溶液峰面积 * 100",
    其他单杂: "其他单杂峰面积 / 对照溶液峰面积 * 100",
    杂质A: "杂质A峰面积 / 对照溶液峰面积 * 100",
    杂质B: "杂质B峰面积 / 对照溶液峰面积 * 100",
    杂质H: "杂质H峰面积 / 对照溶液峰面积 * 100",
    杂质Q: "杂质Q峰面积 / 对照溶液峰面积 * 100",
    "254nm杂质": "供试品杂质峰面积和254nm * 100",
    "283nm坎利酮": "供试品坎利酮峰面积283nm * 100",
  };
  const fields = Object.entries(formulaByName).map(([name, formula]) => ({
    name,
    group: "有关物质结果计算",
    type: "number",
    attr: "calculated",
    unit: "%",
    formula,
    field_key: relatedSubstancesResultFieldKey(stageKey, testKeyValue, name),
  }));
  return {
    name: "有关物质结果计算",
    source: "dedicated_layout",
    fields,
  };
}

function allopurinolContentMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: `别嘌醇片${diammoniumStageLabel(stageKey)}含量`,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: allopurinolContentFieldKey(stageKey, name),
  });
}

function allopurinolContentMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(allopurinolContentMethodField(stageKey, ...args));
  if (stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: "万片" });
    add("理论片重", "calculated", "投料量 / (批量 * 10)", { unit: "g/片" });
  } else {
    add("20片总毛重", "fillable", "", { unit: "g" });
    add("20片总皮重", "fillable", "", { unit: "g" });
    add("平均片重", "calculated", "(20片总毛重 - 20片总皮重) / 20", { unit: "g/片" });
  }
  for (const index of [1, 2]) {
    add(`样${index}-毛重`, "fillable", "", { unit: "g" });
    add(`样${index}-皮重`, "fillable", "", { unit: "g" });
    add(`样${index}-净重`, "calculated", `样${index}-毛重 - 样${index}-皮重`, { unit: "g" });
  }
  add("检测波长", "fillable", "", { unit: "nm", type: "text" });
  add("空白OD");
  add("空白溶剂OD");
  const tabletWeight = stageKey === "intermediate" ? "理论片重" : "平均片重";
  for (const index of [1, 2]) {
    add(`样${index}-OD`);
    add(`样${index}-含量`, "calculated", `(样${index}-OD - 空白OD) * 100 * ${tabletWeight} * 100 / (样${index}-净重 * 571 * 0.1)`, { unit: "%" });
  }
  add("平均含量", "calculated", "(样1-含量 + 样2-含量) / 2", { unit: "%" });
  add("RD", "calculated", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", { unit: "%" });
  add("结论-结果", "calculated", "平均含量", { unit: "%" });
  return {
    name: `别嘌醇片${diammoniumStageLabel(stageKey)}含量`,
    source: "dedicated_layout",
    fields,
  };
}

function compoundRutinContentMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: `复方芦丁片${diammoniumStageLabel(stageKey)}含量`,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: compoundRutinContentFieldKey(stageKey, name),
  });
}

function compoundRutinContentMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(compoundRutinContentMethodField(stageKey, ...args));
  if (stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: "万片" });
    add("理论片重", "calculated", "投料量 / (批量 * 10)", { unit: "g/片" });
  } else {
    add("20片总重", "fillable", "", { unit: "g" });
    add("平均片重", "calculated", "20片总重 / 20", { unit: "g/片" });
  }

  add("芦丁对照含量", "fillable", "", { unit: "%" });
  for (const prefix of ["芦丁对照1", "芦丁对照2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-皮重`, "fillable", "", { unit: "mg" });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "mg" });
  }
  for (const prefix of ["芦丁样1", "芦丁样2", "维C样1", "维C样2"]) {
    add(`${prefix}-毛重`, "fillable", "", { unit: "g" });
    add(`${prefix}-皮重`, "fillable", "", { unit: "g" });
    add(`${prefix}-净重`, "calculated", `${prefix}-毛重 - ${prefix}-皮重`, { unit: "g" });
  }

  add("芦丁检测波长", "fillable", "", { unit: "nm", type: "text" });
  add("芦丁空白OD");
  add("芦丁空白溶剂OD");
  for (const index of [1, 2]) {
    add(`芦丁对照${index}-OD`);
    add(`芦丁对照${index}-OD/mg`, "calculated", `(芦丁对照${index}-OD - 芦丁空白OD) / 芦丁对照${index}-净重`);
  }
  add("芦丁平均OD/mg", "calculated", "(芦丁对照1-OD/mg + 芦丁对照2-OD/mg) / 2");
  add("芦丁对照RD", "calculated", "ABS(芦丁对照1-OD/mg - 芦丁对照2-OD/mg) / 芦丁平均OD/mg * 100", { unit: "%" });
  const tabletWeight = stageKey === "intermediate" ? "理论片重" : "平均片重";
  for (const index of [1, 2]) {
    add(`芦丁样${index}-OD`);
    add(`芦丁样${index}-含量`, "calculated", `(芦丁样${index}-OD - 芦丁空白OD) * 芦丁对照含量 * 1.089 * 2 * ${tabletWeight} * 100 / (芦丁样${index}-净重 * 芦丁平均OD/mg * 20)`, { unit: "%" });
  }
  add("芦丁平均含量", "calculated", "(芦丁样1-含量 + 芦丁样2-含量) / 2", { unit: "%" });
  add("芦丁RD", "calculated", "ABS(芦丁样1-含量 - 芦丁样2-含量) / 芦丁平均含量 * 100", { unit: "%" });

  add("维C滴定液浓度", "fillable", "", { unit: "mol/L", defaultValue: 0.05 });
  for (const index of [1, 2]) {
    add(`维C样${index}-滴定体积`, "fillable", "", { unit: "ml" });
    add(`维C样${index}-含量`, "calculated", `(维C滴定液浓度 * 维C样${index}-滴定体积 * 0.008806 * ${tabletWeight}) / (维C样${index}-净重 * 0.5 * 0.05 * 0.05) * 100`, { unit: "%" });
  }
  add("维C平均含量", "calculated", "(维C样1-含量 + 维C样2-含量) / 2", { unit: "%" });
  add("维C RD", "calculated", "ABS(维C样1-含量 - 维C样2-含量) / 维C平均含量 * 100", { unit: "%" });
  add("结论-结果", "calculated", "(芦丁平均含量 + 维C平均含量) / 2", { unit: "%" });
  return {
    name: `复方芦丁片${diammoniumStageLabel(stageKey)}含量`,
    source: "dedicated_layout",
    fields,
  };
}

function berberineContentApplies(productKey, stageKey, testKeyValue) {
  return productKey === "berberine_tannate" && testKeyValue === "content" && ["intermediate", "packaging"].includes(stageKey);
}

function berberineContentFieldKey(stageKey, name) {
  return `${stageKey}/content/berberine_uv/${str(name).replace(/[\\/]/g, "_")}`;
}

function berberineInput(stageKey, field, options = {}) {
  return inputPart(field, { ...options, fieldKey: berberineContentFieldKey(stageKey, field) });
}

function berberineContentTable(stageKey, label, columnWidths, rows, order) {
  return {
    type: "table",
    label: `鞣酸小檗碱片${diammoniumStageLabel(stageKey)}含量${label}`,
    sourceTemplateId: `dedicated/berberine_tannate_${stageKey}_content`,
    compactTable: true,
    columnWidths,
    rows,
    order,
  };
}

function berberineContentWeighingTable(stageKey) {
  const sampleWeightRow = stageKey === "intermediate"
    ? [
        contentCell("理论片重（g）"),
        contentCell([
          textPart("投料量（Kg）/[批量（万片）×10]="),
          berberineInput(stageKey, "投料量"),
          textPart(" / ["),
          berberineInput(stageKey, "批量"),
          textPart("×10] = "),
          berberineInput(stageKey, "理论片重", { readonlyDisplay: true }),
          textPart(" g/片"),
        ], { colspan: 3 }),
      ]
    : [
        contentCell("平均片重（g）"),
        contentCell([
          textPart("（"),
          berberineInput(stageKey, "20片总毛重"),
          textPart(" - "),
          berberineInput(stageKey, "20片总皮重"),
          textPart("） ÷ 20 = "),
          berberineInput(stageKey, "平均片重", { readonlyDisplay: true }),
          textPart(" g/片"),
        ], { colspan: 3 }),
      ];
  return berberineContentTable(stageKey, "称重", ["18%", "18%", "20%", "22%", "22%"], [
    [
      contentCell("对照称样（g）", { rowspan: 2 }),
      contentCell("对照 1"),
      contentCell([
        berberineInput(stageKey, "对照1-毛重"),
        textPart(" - "),
        berberineInput(stageKey, "对照1-皮重"),
        textPart(" = "),
        berberineInput(stageKey, "对照1-净重", { readonlyDisplay: true }),
        textPart(" g"),
      ], { colspan: 3 }),
    ],
    [
      contentCell("对照 2"),
      contentCell([
        berberineInput(stageKey, "对照2-毛重"),
        textPart(" - "),
        berberineInput(stageKey, "对照2-皮重"),
        textPart(" = "),
        berberineInput(stageKey, "对照2-净重", { readonlyDisplay: true }),
        textPart(" g"),
      ], { colspan: 3 }),
    ],
    sampleWeightRow,
    [
      contentCell("样品称样（mg）", { rowspan: 2 }),
      contentCell("样 1"),
      contentCell([
        berberineInput(stageKey, "样1-毛重"),
        textPart(" - "),
        berberineInput(stageKey, "样1-皮重"),
        textPart(" = "),
        berberineInput(stageKey, "样1-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 3 }),
    ],
    [
      contentCell("样 2"),
      contentCell([
        berberineInput(stageKey, "样2-毛重"),
        textPart(" - "),
        berberineInput(stageKey, "样2-皮重"),
        textPart(" = "),
        berberineInput(stageKey, "样2-净重", { readonlyDisplay: true }),
        textPart(" mg"),
      ], { colspan: 3 }),
    ],
  ], 141);
}

function berberineContentMeasurementBlocks(stageKey) {
  return [
    berberineContentTable(stageKey, "测定与计算", ["14%", "22%", "18%", "16%", "16%", "14%"], [
      [contentCell("对照品计算", { colspan: 6, bold: true, align: "left" })],
      [
        contentCell("吸光度", { rowspan: 5 }),
        contentCell([textPart("波长："), berberineInput(stageKey, "检测波长"), textPart("nm")], { colspan: 5, align: "left" }),
      ],
      [
        contentCell([textPart("空白 OD:"), berberineInput(stageKey, "空白OD")], { colspan: 2, align: "left" }),
        contentCell([textPart("空白溶剂 OD:"), berberineInput(stageKey, "空白溶剂OD")], { colspan: 3, align: "left" }),
      ],
      [contentCell("名称"), contentCell("对照吸光值"), contentCell("g/OD"), contentCell("平均（g/OD）"), contentCell("RD≤1.0%")],
      [
        contentCell(stageKey === "packaging"
          ? [textPart("对照 1："), berberineInput(stageKey, "对照1-净重", { readonlyDisplay: true }), textPart(" g")]
          : "对照 1"),
        contentCell([textPart("OD1:"), berberineInput(stageKey, "对照1-OD")]),
        contentCell([berberineInput(stageKey, "对照1-gOD", { readonlyDisplay: true })]),
        contentCell([berberineInput(stageKey, "平均gOD", { readonlyDisplay: true })], { rowspan: 2 }),
        contentCell([berberineInput(stageKey, "对照RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell(stageKey === "packaging"
          ? [textPart("对照 2："), berberineInput(stageKey, "对照2-净重", { readonlyDisplay: true }), textPart(" g")]
          : "对照 2"),
        contentCell([textPart("OD2:"), berberineInput(stageKey, "对照2-OD")]),
        contentCell([berberineInput(stageKey, "对照2-gOD", { readonlyDisplay: true })]),
      ],
      [contentCell("供试品计算", { colspan: 6, bold: true, align: "left" })],
      [
        contentCell("计算公式", { rowspan: 2 }),
        contentCell("小檗碱重量（g） = 重铬酸钾重量（g） × 供试品溶液吸收度 / 标准品溶液吸收度 × 1 / 10.69", { colspan: 5, align: "left" }),
      ],
      [contentCell("含量（%）=[（OD样-OD空白）×A×1000×片重/M×10.69×规格]×100%", { colspan: 5, align: "left" })],
      [contentCell("名称"), contentCell("称重"), contentCell("样品 OD"), contentCell("含量（%）"), contentCell("平均（%）"), contentCell("RD≤2.0%")],
      [
        contentCell("供试品样 1"),
        contentCell([berberineInput(stageKey, "样1-净重", { readonlyDisplay: true }), textPart(" mg")]),
        contentCell([berberineInput(stageKey, "样1-OD")]),
        contentCell([berberineInput(stageKey, "样1-含量", { readonlyDisplay: true }), textPart("%")]),
        contentCell([textPart("平均:"), berberineInput(stageKey, "平均含量", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
        contentCell([textPart("RD="), berberineInput(stageKey, "RD", { readonlyDisplay: true }), textPart("%")], { rowspan: 2 }),
      ],
      [
        contentCell("供试品样 2"),
        contentCell([berberineInput(stageKey, "样2-净重", { readonlyDisplay: true }), textPart(" mg")]),
        contentCell([berberineInput(stageKey, "样2-OD")]),
        contentCell([berberineInput(stageKey, "样2-含量", { readonlyDisplay: true }), textPart("%")]),
      ],
    ], 151),
  ];
}

function berberineContentLayoutBlocks(stageKey) {
  return [
    berberineContentWeighingTable(stageKey),
    ...berberineContentMeasurementBlocks(stageKey),
  ];
}

function berberineContentMethodField(stageKey, name, attr = "fillable", formula = "", extra = {}) {
  return compactObject({
    name,
    group: `鞣酸小檗碱片${diammoniumStageLabel(stageKey)}含量`,
    type: str(extra.type, "number"),
    attr,
    unit: str(extra.unit) || undefined,
    formula: formula || undefined,
    default_value: extra.defaultValue ?? undefined,
    field_key: berberineContentFieldKey(stageKey, name),
  });
}

function berberineContentMethodGroup(stageKey) {
  const fields = [];
  const add = (...args) => fields.push(berberineContentMethodField(stageKey, ...args));
  if (stageKey === "intermediate") {
    add("投料量", "fillable", "", { unit: "Kg" });
    add("批量", "fillable", "", { unit: "万片" });
    add("理论片重", "calculated", "投料量 / (批量 * 10)", { unit: "g/片" });
  } else {
    add("20片总毛重", "fillable", "", { unit: "g" });
    add("20片总皮重", "fillable", "", { unit: "g" });
    add("平均片重", "calculated", "(20片总毛重 - 20片总皮重) / 20", { unit: "g/片" });
  }
  for (const index of [1, 2]) {
    add(`对照${index}-毛重`, "fillable", "", { unit: "g" });
    add(`对照${index}-皮重`, "fillable", "", { unit: "g" });
    add(`对照${index}-净重`, "calculated", `对照${index}-毛重 - 对照${index}-皮重`, { unit: "g" });
    add(`样${index}-毛重`, "fillable", "", { unit: "mg" });
    add(`样${index}-皮重`, "fillable", "", { unit: "mg" });
    add(`样${index}-净重`, "calculated", `样${index}-毛重 - 样${index}-皮重`, { unit: "mg" });
  }
  add("检测波长", "fillable", "", { unit: "nm", type: "text" });
  add("空白OD");
  add("空白溶剂OD");
  add("转换系数", "prefilled", "", { defaultValue: 10.69 });
  add("规格", "fillable", "", { unit: "mg" });
  add("对照1-OD");
  add("对照2-OD");
  add("对照1-gOD", "calculated", "对照1-净重 / (对照1-OD - 空白OD)");
  add("对照2-gOD", "calculated", "对照2-净重 / (对照2-OD - 空白OD)");
  add("平均gOD", "calculated", "(对照1-gOD + 对照2-gOD) / 2");
  add("对照RD", "calculated", "ABS(对照1-gOD - 对照2-gOD) / 平均gOD * 100", { unit: "%" });
  const tabletWeight = stageKey === "intermediate" ? "理论片重" : "平均片重";
  for (const index of [1, 2]) {
    add(`样${index}-OD`);
    add(`样${index}-含量`, "calculated", `(样${index}-OD - 空白OD) * 平均gOD * 1000 * ${tabletWeight} * 100 / (样${index}-净重 * 转换系数 * 规格)`, { unit: "%" });
  }
  add("平均含量", "calculated", "(样1-含量 + 样2-含量) / 2", { unit: "%" });
  add("RD", "calculated", "ABS(样1-含量 - 样2-含量) / 平均含量 * 100", { unit: "%" });
  add("结论-结果", "calculated", "平均含量", { unit: "%" });
  return {
    name: `鞣酸小檗碱片${diammoniumStageLabel(stageKey)}含量`,
    source: "dedicated_layout",
    fields,
  };
}

function reconcileDedicatedMethodGroups(methodGroups, productKey, stageKey, testKeyValue, test = {}) {
  const groups = [...methodGroups];
  if (azithromycinFinishedMoistureApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(azithromycinFinishedMoistureMethodGroup());
  } else if (testKeyValue === "moisture") {
    groups.unshift(moistureMethodGroup(stageKey, testKeyValue));
  }
  if (testKeyValue === "weight_variation" || testKeyValue === "fill_variation") {
    groups.unshift(variationMethodGroup(stageKey, testKeyValue, rec(test["标准规定参数"])));
  }
  if (allopurinolIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(allopurinolIdentificationMethodGroup());
  }
  if (levofloxacinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(levofloxacinIdentificationMethodGroup());
  }
  if (terazosinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(terazosinIdentificationMethodGroup());
  }
  if (allopurinolRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(allopurinolRelatedSubstancesMethodGroup());
  }
  if (hydrochlorothiazideContentUniformityApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(hydrochlorothiazideUniformityMethodGroup(stageKey));
  }
  if (isosorbideUniformityApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(isosorbideUniformityMethodGroup(stageKey));
  }
  if (singleReferenceHplcUniformityApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(singleReferenceHplcUniformityMethodGroup(productKey, stageKey));
  }
  if (spironolactoneRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(spironolactoneRelatedMethodGroup());
  }
  if (levofloxacinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(levofloxacinRelatedMethodGroup());
  }
  if (pantoprazoleRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(pantoprazoleRelatedMethodGroup());
  }
  if (atenololRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(atenololRelatedMethodGroup());
  }
  if (clarithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(clarithromycinRelatedMethodGroup());
  }
  if (hydrochlorothiazideRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(hydrochlorothiazideRelatedMethodGroup());
  }
  if (terazosinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(terazosinRelatedMethodGroup());
  }
  if (verapamilRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(verapamilRelatedMethodGroup());
  }
  if (azithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(azithromycinRelatedMethodGroup());
  }
  if (simvastatinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(simvastatinRelatedMethodGroup());
  }
  if (simvastatinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(simvastatinIdentificationMethodGroup());
  }
  if (spironolactoneIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(spironolactoneIdentificationMethodGroup());
  }
  if (productKey === "diammonium_glycyrrhizinate" && stageKey === "finished" && testKeyValue === "identification") {
    groups.unshift(diammoniumIdentificationMethodGroup());
  }
  if (
    testKeyValue === "related_substances"
    && !allopurinolRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !spironolactoneRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !levofloxacinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !pantoprazoleRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !atenololRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !clarithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !hydrochlorothiazideRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !terazosinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !verapamilRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !azithromycinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
    && !simvastatinRelatedSubstancesApplies(productKey, stageKey, testKeyValue)
  ) {
    groups.unshift(relatedSubstancesResultMethodGroup(stageKey, testKeyValue));
  }
  if (specialDissolutionApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(specialDissolutionMethodGroup(productKey, stageKey, testKeyValue));
  }
  if (pantoprazoleContentApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(pantoprazoleContentMethodGroup(stageKey));
  }
  if (pantoprazoleAcidResistanceApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(pantoprazoleAcidResistanceMethodGroup());
  }
  if (allopurinolContentApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(allopurinolContentMethodGroup(stageKey));
  }
  if (compoundRutinContentApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(compoundRutinContentMethodGroup(stageKey));
  }
  if (berberineContentApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(berberineContentMethodGroup(stageKey));
  }
  if (berberineIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(berberineIdentificationMethodGroup());
  }
  if (compoundRutinIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(compoundRutinIdentificationMethodGroup());
  }
  if (pantoprazoleIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(pantoprazoleIdentificationMethodGroup());
  }
  if (methimazoleIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(methimazoleIdentificationMethodGroup());
  }
  if (verapamilIdentificationApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(verapamilIdentificationMethodGroup());
  }
  if (testKeyValue === "disintegration") {
    groups.unshift(disintegrationMethodGroup(stageKey));
  }
  if (specialHplcContentApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(specialHplcContentMethodGroup(productKey, stageKey));
  }
  if (productKey === "methimazole" && testKeyValue === "content" && ["intermediate", "packaging", "finished"].includes(stageKey)) {
    groups.unshift(methimazoleContentMethodGroup(stageKey));
  }
  if (methimazoleUniformityApplies(productKey, stageKey, testKeyValue)) {
    groups.unshift(methimazoleUniformityMethodGroup(stageKey));
  }
  if (productKey === "diammonium_glycyrrhizinate" && stageKey === "packaging" && testKeyValue === "dissolution") {
    groups.unshift(diammoniumPackagingDissolutionMethodGroup());
  }
  if (
    productKey === "diammonium_glycyrrhizinate"
    && testKeyValue === "content"
    && ["intermediate", "packaging", "finished"].includes(stageKey)
  ) {
    groups.unshift(diammoniumContentMethodGroup(stageKey));
  }
  if (groups.some((group) => str(group.source) === "dedicated_layout")) {
    return groups.filter((group) => str(group.source) !== "original_md");
  }
  return groups;
}

function expandTemplateText(value, index) {
  return typeof value === "string" ? value.replaceAll("{序号}", String(index)) : value;
}

function normalizeMethodField(field, group) {
  const data = rec(field);
  const name = str(data.name);
  if (!name) return null;
  return {
    name,
    group,
    type: str(data.type),
    attr: str(data.attr),
    role: str(data.attr) === "prefilled" ? "default" : "parameter",
    unit: str(data.unit),
    formula: str(data.formula),
    rule: str(data.rule),
    options: arr(data.options).map((option) => str(option)).filter(Boolean),
    default: data.default ?? data.value ?? null,
    default_value: str(data.attr) === "prefilled" ? data.default ?? data.value ?? null : null,
    suggested_value: str(data.attr) !== "prefilled" ? data.default ?? data.value ?? null : null,
    note: str(data.note),
  };
}

function flattenMethodFields(group, value) {
  return arr(value).flatMap((item) => {
    const field = rec(item);
    const repeat = rec(field.repeat);
    if (Array.isArray(repeat.fields)) {
      const count = Math.max(1, Number(repeat.count) || 1);
      return Array.from({ length: count }, (_, index) => index + 1).flatMap((rowNo) => (
        flattenMethodFields(group, arr(repeat.fields).map((child) => {
          const data = rec(child);
          return {
            ...data,
            name: expandTemplateText(data.name, rowNo),
            formula: expandTemplateText(data.formula, rowNo),
            rule: expandTemplateText(data.rule, rowNo),
          };
        }))
      ));
    }
    const normalized = normalizeMethodField(field, group);
    return normalized ? [normalized] : [];
  });
}

function groupsFromMethodDefinition(methodName, definition) {
  if (Array.isArray(definition)) {
    const fields = flattenMethodFields(methodName, definition);
    return fields.length ? [{ name: methodName, fields }] : [];
  }
  return Object.entries(rec(definition))
    .filter(([name]) => !["extends", "extra", "render_as"].includes(name))
    .flatMap(([name, value]) => {
      const fields = flattenMethodFields(name, Array.isArray(value) ? value : rec(value).fields);
      return fields.length ? [{ name, fields }] : [];
    });
}

function withFieldKeys(groups, stageKey, testKeyValue) {
  const seen = new Set();
  return groups.map((group, groupIndex) => ({
    ...group,
    fields: group.fields.map((field) => {
      const baseKey = `${stageKey}/${testKeyValue}/s${groupIndex}/${field.name}`;
      let fieldKey = baseKey;
      let suffix = 2;
      while (seen.has(fieldKey)) {
        fieldKey = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      seen.add(fieldKey);
      return { ...field, field_key: fieldKey };
    }),
  }));
}

function rekeyMethodGroups(groups, stageKey, testKeyValue) {
  const prefixPattern = new RegExp(`^(?:${stageOrder.map(escapeRegExp).join("|")})/${escapeRegExp(testKeyValue)}/`);
  const used = new Set();
  return groups.map((group) => ({
    ...group,
    name: str(group.name).replaceAll("待包装品", stageLabels[stageKey] ?? stageKey).replaceAll("待包品", stageLabels[stageKey] ?? stageKey),
    fields: arr(group.fields).map((field) => {
      const currentKey = str(field.field_key);
      const baseKey = currentKey && prefixPattern.test(currentKey)
        ? currentKey.replace(prefixPattern, `${stageKey}/${testKeyValue}/`)
        : `${stageKey}/${testKeyValue}/${slug(group.name) || "g"}/${slug(field.name) || "field"}`;
      let fieldKey = baseKey;
      let suffix = 2;
      while (used.has(fieldKey)) {
        fieldKey = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      used.add(fieldKey);
      return {
        ...field,
        group: str(field.group).replaceAll("待包装品", stageLabels[stageKey] ?? stageKey).replaceAll("待包品", stageLabels[stageKey] ?? stageKey),
        field_key: fieldKey,
      };
    }),
  }));
}

function addReferenceFieldKeys(groups, sourceGroups) {
  const refs = new Map();
  const refsByName = new Map();
  for (const group of sourceGroups) {
    for (const field of group.fields ?? []) {
      refs.set(`${group.name}\u0000${field.name}`, field.field_key);
      if (!refsByName.has(field.name)) refsByName.set(field.name, field.field_key);
    }
  }
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const referenceFieldKey = refs.get(`${group.name}\u0000${field.name}`) || refsByName.get(field.name) || "";
      return {
        ...field,
        reference_field_key: referenceFieldKey,
        value_source: referenceFieldKey ? { type: "field_ref", field_key: referenceFieldKey } : null,
      };
    }),
  }));
}

function remapSequenceText(text, fromSequence, toSequence) {
  if (!fromSequence || !toSequence || fromSequence === toSequence) return text;
  return str(text).replace(new RegExp(`\\b${fromSequence.replace(".", "\\.")}(?=\\b|\\.)`, "g"), toSequence);
}

function remapSections(sections, fromSequence, toSequence) {
  return sections.map((section) => ({
    ...section,
    sequence: remapSequenceText(section.sequence, fromSequence, toSequence),
    text: remapSequenceText(section.text, fromSequence, toSequence),
  }));
}

function shouldUseLayoutBlocksAsOutputText(productKey, stageKey, testKeyValue) {
  return productKey === "diammonium_glycyrrhizinate"
    && (
      (testKeyValue === "content" && ["intermediate", "packaging", "finished"].includes(stageKey))
      || (stageKey === "finished" && testKeyValue === "identification")
    );
}

function remapCopiedLayoutValue(value, fromStageKey, toStageKey, testKeyValue, fromSequence, toSequence) {
  if (Array.isArray(value)) {
    return value.map((item) => remapCopiedLayoutValue(item, fromStageKey, toStageKey, testKeyValue, fromSequence, toSequence));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [
      key,
      remapCopiedLayoutValue(val, fromStageKey, toStageKey, testKeyValue, fromSequence, toSequence),
    ]));
  }
  if (typeof value !== "string") return value;
  return remapSequenceText(value, fromSequence, toSequence)
    .replaceAll(`${fromStageKey}/${testKeyValue}/`, `${toStageKey}/${testKeyValue}/`)
    .replaceAll("待包装品", stageLabels[toStageKey] ?? toStageKey)
    .replaceAll("待包品", stageLabels[toStageKey] ?? toStageKey);
}

function remapCopiedLayoutBlocks(blocks, fromStageKey, toStageKey, testKeyValue, fromSequence, toSequence) {
  return remapCopiedLayoutValue(
    JSON.parse(JSON.stringify(blocks ?? [])),
    fromStageKey,
    toStageKey,
    testKeyValue,
    fromSequence,
    toSequence,
  );
}

function itemFileName(productKey, stageKey, testKeyValue) {
  return `${productKey}_${stageKey}_${testKeyValue}.json`;
}

function itemRelativePath(productKey, stageKey, testKeyValue) {
  return path.posix.join("items", itemFileName(productKey, stageKey, testKeyValue));
}

function buildMethodGroups(methodName, methods, stageKey, testKeyValue) {
  const method = methods[methodName] ?? methods[methodName.split("-")[0]];
  if (!method) return { method_file: "", groups: [] };
  const methodDefinition = rec(method.definition);
  const baseName = str(methodDefinition.extends);
  const base = methods[baseName];
  const groups = [
    ...(base ? groupsFromMethodDefinition(baseName, base.definition) : []),
    ...groupsFromMethodDefinition(methodName, method.definition),
  ];
  const extra = flattenMethodFields("扩展", methodDefinition.extra);
  const allGroups = extra.length ? [...groups, { name: "扩展", fields: extra }] : groups;
  return { method_file: method.fileName, groups: withFieldKeys(allGroups, stageKey, testKeyValue) };
}

function headingText(value) {
  return plainTextFromMd(value)
    .replace(/\|.*$/, "")
    .replace(/检验日期.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return headingText(value)
    .replace(/[|：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[（）()，,。.;；]/g, "")
    .trim();
}

function mdStageKey(title, fallbackIndex) {
  if (/^一、/.test(title)) return "intermediate";
  if (/^二、/.test(title)) return "packaging";
  if (/^三、/.test(title)) return "finished";
  return stageOrder[fallbackIndex] ?? `stage_${fallbackIndex + 1}`;
}

function parseMdDocument(mdText) {
  const stages = [];
  let currentStage = null;
  let currentTest = null;
  let currentSection = null;
  const lines = mdText.split(/\r?\n/);

  function pushLine(line) {
    if (!currentTest) return;
    currentTest.lines.push(line);
    if (currentSection) currentSection.lines.push(line);
  }

  for (const line of lines) {
    const stageMatch = line.match(/^##\s+([一二三]、.+)$/);
    if (stageMatch) {
      currentStage = {
        key: mdStageKey(stageMatch[1], stages.length),
        title: headingText(stageMatch[1]),
        lines: [line],
        tests: [],
      };
      stages.push(currentStage);
      currentTest = null;
      currentSection = null;
      continue;
    }

    const testMatch = line.match(/^###\s+(\d+\.\d+)\s*(?:\|\s*)?(.+)$/);
    if (currentStage && testMatch) {
      currentTest = {
        sequence: testMatch[1],
        title: headingText(testMatch[2]),
        lines: [line],
        sections: [],
      };
      currentStage.tests.push(currentTest);
      currentSection = null;
      continue;
    }

    if (currentStage && !currentTest) {
      currentStage.lines.push(line);
      continue;
    }

    const sectionMatch = line.match(/^####\s+(\d+\.\d+\.\d+(?:\.\d+)*)\s+(.+)$/);
    if (currentTest && sectionMatch) {
      currentSection = {
        sequence: sectionMatch[1],
        title: headingText(sectionMatch[2]),
        lines: [line],
      };
      currentTest.sections.push(currentSection);
      currentTest.lines.push(line);
      continue;
    }

    pushLine(line);
  }

  return stages;
}

function findMdTest(mdStages, stageKey, sequence, name) {
  const stage = mdStages.find((item) => item.key === stageKey);
  if (!stage) return undefined;
  const normalizedName = normalizeName(name);
  return stage.tests.find((test) => test.sequence === sequence)
    ?? stage.tests.find((test) => normalizeName(test.title) === normalizedName);
}

function testKey(test) {
  const english = str(test["英文名"]);
  const name = str(test["名称"]);
  if (english && /^[a-z][a-z0-9_]*$/i.test(english)) return english;
  return specialTestKeys.get(name) ?? (english || name);
}

function normalizedTestData(productKey, stageKey, test) {
  const data = { ...rec(test) };
  const key = testKey(data);
  const name = str(data["名称"]);
  // The verapamil source title says 装量差异, but the product is a tablet and the
  // operation/standard/conclusion all use the 20-tablet weight-difference family.
  if (productKey === "verapamil" && (key === "fill_variation" || key === "weight_variation") && (name === "装量差异" || name === "重量差异")) {
    data.__layout_key = "fill_variation";
    data["名称"] = "重量差异";
    data["英文名"] = "weight_variation";
    data["方法"] = str(data["方法"]).replace(/^装量差异/, "重量差异");
    data["结论名称"] = "重量差异";
    data["标准规定参数"] = {
      ...rec(data["标准规定参数"]),
      basis: "平均片重",
      difference_name: "重量差异",
      unit: "片",
      one_unit: "一片",
      unit_name: "片",
      sample_unit: "片",
    };
  }
  return data;
}

function isMicrobiology(test) {
  return testKey(test) === "microbial_limit" || /微生物/.test(str(test["名称"]));
}

function referencePhrases(text) {
  const normalized = str(text).replace(/\s+/g, " ").trim();
  const preciseMatches = normalized.match(/(?:[^。；;]*?(?:检验数据|测定结果|计算过程|测定与计算)[^。；;]*?见待包装品[^。；;]{0,160}?(?:项下|项)[。；;]?)/g) ?? [];
  const phrases = preciseMatches.map((phrase) => compactPackagingReferencePhrase(phrase)).filter(Boolean);
  if (!phrases.length && /见待包装品/.test(normalized)) {
    const index = normalized.indexOf("见待包装品");
    const start = Math.max(0, normalized.lastIndexOf("。", index - 1) + 1, normalized.lastIndexOf("；", index - 1) + 1);
    const nextStop = normalized.slice(index).search(/[。；;]/);
    const end = nextStop >= 0 ? index + nextStop + 1 : Math.min(normalized.length, index + 120);
    phrases.push(compactPackagingReferencePhrase(normalized.slice(start, end)));
  }
  return [...new Set(phrases)];
}

function packagingReferencePhrasesFor({ productKey, stageKey, key, text }) {
  return [
    ...referencePhrases(text),
    ...arr(manualPackagingReferencePhrases.get(`${productKey}/${stageKey}/${key}`)),
  ].map(compactPackagingReferencePhrase).filter(Boolean)
    .filter((phrase, index, phrases) => phrases.indexOf(phrase) === index);
}

function compactPackagingReferencePhrase(value) {
  let phrase = str(value)
    .replace(/\s*#{1,6}\s*/g, " ")
    .replace(/\*\*数据记录表：?\*\*/g, " ")
    .replace(/\b数据记录表：?/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!phrase) return "";
  const firstReferenceIndex = phrase.indexOf("见待包装品");
  if (firstReferenceIndex < 0) return phrase;
  const prefix = phrase.slice(0, firstReferenceIndex);
  const starts = ["检验数据及计算过程", "测定结果与计算过程", "检验数据", "计算过程", "测定与计算"]
    .map((marker) => ({ marker, index: prefix.lastIndexOf(marker) }))
    .filter((candidate) => candidate.index >= 0);
  const latestStart = starts.length ? Math.max(...starts.map((candidate) => candidate.index)) : -1;
  const startIndex = latestStart >= 0
    ? Math.min(
      ...starts
        .filter((candidate) => latestStart < candidate.index + candidate.marker.length)
        .map((candidate) => candidate.index),
    )
    : firstReferenceIndex;
  phrase = phrase.slice(startIndex).replace(/^[：:，,、。；;\s]+/, "");
  const referenceIndex = phrase.indexOf("见待包装品");
  const itemEnd = phrase.indexOf("项下", referenceIndex);
  const itemOnlyEnd = phrase.indexOf("项", referenceIndex);
  const endIndex = itemEnd >= 0 ? itemEnd + "项下".length : (itemOnlyEnd >= 0 ? itemOnlyEnd + "项".length : -1);
  if (endIndex < 0) return phrase.replace(/\s+####.*$/, "").trim();
  const punctuation = /[。；;]/.test(phrase[endIndex] ?? "") ? phrase[endIndex] : "";
  return `${phrase.slice(0, endIndex)}${punctuation}`.trim();
}

function copyGroup(key) {
  if (key === "weight_variation" || key === "fill_variation") return "variation";
  if (key === "content" || key === "content_uniformity") return "content";
  if (key === "dissolution" || key === "acid_release") return "dissolution";
  return key;
}

function sectionObject(section) {
  const text = plainTextFromMd(section.lines.join("\n"));
  return {
    sequence: section.sequence,
    title: section.title,
    text,
  };
}

function slug(value) {
  return str(value)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function hashText(value, length = 12) {
  return crypto.createHash("sha256").update(str(value)).digest("hex").slice(0, length);
}

function normalizeMdMethodText(value) {
  return str(value)
    .replace(/\{(?:FIELD|PREFILL):[^}]*\}/g, "")
    .replace(/\s+/g, "")
    .replace(/[，。；：、,.；:()（）【】\[\]《》<>]/g, "")
    .trim();
}

function methodEvidenceSections(sections) {
  const priority = sections.filter((section) => (
    /操作方法|测定法|供试品|对照品|色谱条件|溶出条件|系统适用性|测定与计算|计算|检查法|标准规定/.test(section.title)
  ));
  return priority.length ? priority : sections;
}

function mdMethodIdentity({ productName, productKey, stageKey, key, sequence, name, mdTest, text, sections }) {
  const evidence = methodEvidenceSections(sections);
  const evidenceText = evidence.map((section) => `${section.sequence} ${section.title}\n${section.text}`).join("\n\n") || text;
  const fingerprint = hashText(normalizeMdMethodText(evidenceText) || normalizeMdMethodText(text));
  const methodKey = `${productKey}/${stageKey}/${key}`;
  const fileName = `${productKey}_${stageKey}_${key}.json`;
  return {
    source: "original_md",
    reuse_policy: "dedicated_by_product_stage_test",
    method_key: methodKey,
    method_id: `${productKey}_${stageKey}_${key}`,
    method_file: path.posix.join("dedicated_methods", fileName),
    display_name: `${name}-${productName}${stageLabels[stageKey] ?? stageKey}`,
    fingerprint,
    evidence_sections: evidence.map((section) => ({
      sequence: section.sequence,
      title: section.title,
    })),
    md_section: mdTest?.sequence ?? "",
    md_title: mdTest?.title ?? "",
    rule: "Do not merge across product/stage/test; parameter-only differences still produce separate method keys.",
  };
}

function methodGroupsFromMdFields(mdFields, stageKey, testKeyValue) {
  if (!mdFields.length) return [];
  return [{
    name: "原始MD字段",
    source: "original_md",
    fields: mdFields.map((field) => ({
      name: field.parameter_hint || field.text || `${field.kind}_${field.index}`,
      group: "原始MD字段",
      type: field.type,
      role: field.role,
      default_value: field.default_value || null,
      suggested_value: field.suggested_value || null,
      raw: field.raw,
      field_key: `${stageKey}/${testKeyValue}/md/f${field.index}`,
    })),
  }];
}

function layoutAssignment(layoutAssignments, productKey, stageKey, key, rawKeys = []) {
  const candidates = [key, ...rawKeys].filter(Boolean);
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const assignmentKey = `products/${productKey}/${stageKey}/${candidate}`;
    const assignment = rec(layoutAssignments[assignmentKey]);
    if (!Object.keys(assignment).length) continue;
    const outputKey = `products/${productKey}/${stageKey}/${key}`;
    return {
      key: outputKey,
      lookup_key: assignmentKey,
      template_id: str(assignment.template_id),
      status: str(assignment.status),
      source_ref: str(assignment.source_ref),
      family_id: str(assignment.family_id),
      reuse_from: str(assignment.reuse_from),
      params: rec(assignment.params),
    };
  }
  return null;
}

function operationParamsFor(operationParams, layout, outputKey) {
  return {
    ...rec(operationParams[outputKey]),
    ...rec(operationParams[layout?.lookup_key]),
  };
}

async function buildLayoutBlocks({ layoutRoot, operationParams, layout, outputLayoutKey, test, key, sequence, name, methodName }) {
  if (!layoutRoot || !layout?.template_id) return [];
  const params = {
    test_sequence: sequence,
    test_name: name,
    test_english_name: key,
    test_method_name: methodName,
    ...operationParamsFor(operationParams, layout, outputLayoutKey),
    ...rec(layout.params),
  };
  return expandLayoutTemplate(layoutRoot, layout.template_id, params).catch(() => []);
}

function signatureFooterBlock(stageKey, testKeyValue) {
  const prefix = `${stageKey}/${testKeyValue}/signature`;
  const currentUserRef = {
    type: "field_ref",
    field_key: "auth/current_user/name",
  };
  const textCell = (rawText) => ({ rawText, parts: [], colspan: 1, rowspan: 1, isEmpty: false, align: "center" });
  const partCell = (parts) => ({ rawText: "", parts, colspan: 1, rowspan: 1, isEmpty: false, align: "center" });
  return {
    type: "table",
    label: "test_signature_footer",
    sectionRole: "signature",
    rows: [[
      textCell("检验者"),
      partCell([{
        type: "line",
        fieldKey: `${prefix}/inspector`,
        width: "8rem",
        underline: true,
        readonlyDisplay: true,
        reference_field_key: currentUserRef.field_key,
        value_source: currentUserRef,
      }]),
      textCell("日期"),
      partCell([{ type: "date", fieldKey: `${prefix}/inspection_date` }]),
      textCell("复核者"),
      partCell([{
        type: "line",
        fieldKey: `${prefix}/reviewer`,
        width: "8rem",
        underline: true,
        readonlyDisplay: true,
        reference_field_key: currentUserRef.field_key,
        value_source: currentUserRef,
      }]),
      textCell("日期"),
      partCell([{ type: "date", fieldKey: `${prefix}/review_date` }]),
    ]],
    order: 999,
    moduleOrder: 999,
  };
}

function basisEntriesFromText(value) {
  const text = plainTextFromMd(value)
    .replace(/\s+/g, " ")
    .replace(/^[：:、，,\s]+|[：:、，,\s]+$/g, "")
    .trim();
  if (!text) return [];
  return text
    .replace(/）\s*及\s*(?=《)/g, "）、")
    .split(/[、，,]\s*(?=《)/)
    .map((item) => item.trim().replace(/[、，,\s]+$/g, ""))
    .filter(Boolean);
}

function formatBasisEntries(entries) {
  return arr(entries).map((entry) => str(entry).trim()).filter(Boolean).join("、\n");
}

function mdStageBasisText(mdStage) {
  for (const line of arr(mdStage?.lines)) {
    if (!/检验依据/.test(line)) continue;
    const cells = splitMdTableRow(line);
    const basisIndex = cells.findIndex((cell) => /检验依据/.test(plainTextFromMd(cell)));
    const basisText = cells.slice(basisIndex + 1).map((cell) => plainTextFromMd(cell)).filter(Boolean).join("、");
    const entries = basisEntriesFromText(basisText);
    if (entries.length) return formatBasisEntries(entries);
  }
  return "";
}

function fallbackBasisTextFromFiles(files) {
  return formatBasisEntries(arr(files)
    .slice(0, 2)
    .map((file) => `${str(rec(file)["名称"])}（${str(rec(file)["编码"])}）`)
    .filter((item) => item !== "（）"));
}

function stageHeaderParams(productName, stageKey, stage, mdStage) {
  const precheck = rec(stage["检验前确认"]);
  const top = rec(precheck["顶部信息"]);
  const files = arr(precheck["文件清单"]);
  const mdBasis = mdStageBasisText(mdStage);
  return {
    stage_title: `${stageLabels[stageKey] ?? stageKey}`,
    sample_name: str(top["检品名称"], productName),
    packaging: str(top["包装情况"]),
    purpose: str(top["检验目的"]),
    request_department: str(top["请验部门"]),
    basis_text: mdBasis || fallbackBasisTextFromFiles(files),
  };
}

function precheckParams(stage) {
  const precheck = rec(stage["检验前确认"]);
  const environment = rec(precheck["环境确认"]);
  const envOptions = Object.entries(environment)
    .filter(([, value]) => value !== false)
    .map(([key]) => key);
  return {
    precheck_files: arr(precheck["文件清单"]).map((file) => ({
      name: str(rec(file)["名称"]),
      code: str(rec(file)["编码"]),
    })),
    precheck_items: arr(precheck["确认项"]).map((item) => ({ name: str(rec(item)["名称"]) })),
    precheck_env_options: envOptions.length ? envOptions : ["符合要求", "不符合要求"],
  };
}

function experimentProjectRows(tests) {
  return tests.map((test) => ({
    sequence: test.sequence,
    name: test.name,
    methodName: test.method,
    templateId: test.method_ref || "",
    legacyTemplateId: test.layout?.template_id || "",
    key: test.key,
  }));
}

async function buildPrecheckFullBlocks(layoutRoot, productName, stageKey, stage, mdStage) {
  const params = {
    ...stageHeaderParams(productName, stageKey, stage, mdStage),
    ...precheckParams(stage),
  };
  return expandLayoutTemplate(layoutRoot, "parents/precheck_full", params).catch(() => []);
}

async function buildExperimentProjectsFullBlocks() {
  return [{
    type: "title",
    title: "实验项目",
    sectionSuffix: "2",
    order: 1,
  }];
}

function standardFullTemplates(generatedAt) {
  return [
    {
      file: "precheck_full.json",
      data: {
        schema_version: 1,
        template_id: "precheck_full",
        title: "1 检验前确认",
        level: "L1",
        generated_at: generatedAt,
        source_template_id: "parents/precheck_full",
        params_source: "embedded in pharma-qc/full/<product>_<stage>_full.json#/precheck_full",
        blocks: [
          { type: "include", template_id: "common/stage_header", params: ["sample_name", "packaging", "purpose", "request_department", "basis_text"] },
          { type: "include", template_id: "common/precheck_files_table", params: ["precheck_files"] },
          { type: "include", template_id: "common/precheck_confirm_table", params: ["precheck_items", "precheck_env_options"] },
        ],
      },
    },
    {
      file: "experiment_projects_full.json",
      data: {
        schema_version: 1,
        template_id: "experiment_projects_full",
        title: "2 实验项目",
        level: "L1",
        generated_at: generatedAt,
        source_template_id: "parents/experiment_projects_full",
        params_source: "embedded in pharma-qc/full/<product>_<stage>_full.json#/experiment_projects_full",
        blocks: [
          { type: "title", title: "2 实验项目" },
        ],
      },
    },
    {
      file: "product_stage_full.json",
      data: {
        schema_version: 1,
        template_id: "product_stage_full",
        title: "完整产品_阶段",
        level: "FULL",
        generated_at: generatedAt,
        params_source: "embedded in pharma-qc/full/<product>_<stage>_full.json",
        composition: [
          { slot: "precheck", template_id: "precheck_full" },
          { slot: "experiment_projects", template_id: "experiment_projects_full" },
          { slot: "tests", source: "pharma-qc/items/<product>_<stage>_<test>.json#/test/layout_blocks" },
        ],
      },
    },
  ];
}

async function writeStandardFullTemplates(generatedAt) {
  await fs.rm(standardTemplateOutRoot, { recursive: true, force: true });
  await fs.mkdir(standardTemplateOutRoot, { recursive: true });
  for (const template of standardFullTemplates(generatedAt)) {
    await fs.writeFile(path.join(standardTemplateOutRoot, template.file), `${JSON.stringify(template.data, null, 2)}\n`, "utf8");
  }
}

async function writeFullStageFiles(products, rawStageIndex, mdStageIndex, layoutRoot, generatedAt, sourcePolicy) {
  await fs.rm(fullOutRoot, { recursive: true, force: true });
  await fs.mkdir(fullOutRoot, { recursive: true });
  let count = 0;
  for (const product of products) {
    for (const [stageKey, stage] of Object.entries(product.stages)) {
      const rawStage = rec(rawStageIndex[`${product.key}/${stageKey}`]);
      const mdStage = rec(mdStageIndex[`${product.key}/${stageKey}`]);
      const precheckBlocks = await buildPrecheckFullBlocks(layoutRoot, product.name, stageKey, rawStage, mdStage);
      const experimentBlocks = await buildExperimentProjectsFullBlocks(layoutRoot, stage.tests);
      const testRefs = stage.tests.map((test) => ({
        key: test.key,
        sequence: test.sequence,
        name: test.name,
        file: test.file,
        layout_blocks_ref: `${test.file}#/test/layout_blocks`,
      }));
      const full = {
        schema_version: 1,
        generated_at: generatedAt,
        source_policy: sourcePolicy,
        product: { key: product.key, name: product.name },
        stage: { key: stageKey, label: stage.label },
        templates: {
          precheck: "templates/precheck_full.json",
          experiment_projects: "templates/experiment_projects_full.json",
          product_stage: "templates/product_stage_full.json",
        },
        precheck_full: {
          title: "1 检验前确认",
          layout_blocks: precheckBlocks,
        },
        experiment_projects_full: {
          title: "2 实验项目",
          layout_blocks: experimentBlocks,
        },
        tests: testRefs,
        full_order: [
          { type: "blocks", ref: "#/precheck_full/layout_blocks" },
          { type: "blocks", ref: "#/experiment_projects_full/layout_blocks" },
          ...testRefs.map((test) => ({ type: "blocks", ref: test.layout_blocks_ref })),
        ],
      };
      await fs.writeFile(path.join(fullOutRoot, `${product.key}_${stageKey}_full.json`), `${JSON.stringify(full, null, 2)}\n`, "utf8");
      count += 1;
    }
  }
  return count;
}

async function testObject({ productName, productKey, stageKey, test, mdTest, layoutAssignments, layoutRoot, operationParams }) {
  const name = str(test["名称"]);
  const sequence = str(test["序号"]);
  const key = testKey(test);
  const rawEnglishKey = str(test["英文名"]);
  const layoutKey = str(test.__layout_key);
  const methodName = str(test["方法"]);
  const text = mdTest ? plainTextFromMd(mdTest.lines.join("\n")) : "";
  const mdFields = mdTest ? mdFieldsFromText(mdTest.lines.join("\n")) : [];
  const sections = mdTest ? mdTest.sections.map(sectionObject) : [];
  const methodIdentity = mdMethodIdentity({
    productName,
    productKey,
    stageKey,
    key,
    sequence,
    name,
    mdTest,
    text,
    sections,
  });
  const refs = packagingReferencePhrasesFor({ productKey, stageKey, key, text });
  let methodGroups = methodGroupsFromMdFields(mdFields, stageKey, key);
  methodGroups = reconcileDedicatedMethodGroups(methodGroups, productKey, stageKey, key, test);
  const layout = layoutAssignment(layoutAssignments, productKey, stageKey, key, [rawEnglishKey, layoutKey, name]);
  const outputLayoutKey = `products/${productKey}/${stageKey}/${key}`;
  const rawLayoutBlocks = await buildLayoutBlocks({ layoutRoot, operationParams, layout, outputLayoutKey, test, key, sequence, name, methodName });
  const operationLayoutBlocks = reconcileOperationLayoutBlocks(rawLayoutBlocks, mdTest, stageKey, key);
  const measurementLayoutBlocks = reconcileMeasurementLayoutBlocks(operationLayoutBlocks, mdTest, stageKey, key);
  const tableLayoutBlocks = reconcileMissingMdTables(measurementLayoutBlocks, mdTest, stageKey, key);
  const supplementalLayoutBlocks = reconcileMissingMdParagraphs(tableLayoutBlocks, mdTest, stageKey, key);
  const formulaLayoutBlocks = reconcileMoistureLayoutBlocks(supplementalLayoutBlocks, stageKey, key);
  let layoutBlocks = reconcileDedicatedProductLayoutBlocks(formulaLayoutBlocks, productKey, stageKey, key);
  layoutBlocks = normalizeVariationLayoutBlocks(layoutBlocks, productKey, stageKey, key, test);
  layoutBlocks = normalizeRecoveredMdTableBlocks(layoutBlocks, productKey, stageKey, key);
  layoutBlocks = normalizeFriabilityOperationTextBlocks(layoutBlocks, key);
  layoutBlocks = normalizeOperationTextBlocks(layoutBlocks, stageKey, key);
  layoutBlocks = normalizeFriabilityOperationPartsBlocks(layoutBlocks, productKey, stageKey, key);
  layoutBlocks = normalizeDisintegrationOperationPartsBlocks(layoutBlocks, stageKey, key);
  layoutBlocks = normalizeHydrochlorothiazideIdentificationPartsBlocks(layoutBlocks, productKey, stageKey, key);
  layoutBlocks = removeEmptyStructuredOperationBlocks(layoutBlocks);
  layoutBlocks = demoteDeprecatedDisplayParams(layoutBlocks);
  layoutBlocks = removeFinalDedicatedDuplicateParagraphs(layoutBlocks, productKey, stageKey, key);
  layoutBlocks.push(signatureFooterBlock(stageKey, key));
  const standardTemplate = str(test["标准规定模板"]);
  const usesDeprecatedStandardTemplate = standardTemplate === "related_substances_numbered_rules";
  const hasDedicatedMethodGroup = methodGroups.some((group) => str(group.source) === "dedicated_layout");
  const outputMdFields = hasDedicatedMethodGroup ? [] : mdFields;
  const outputText = shouldUseLayoutBlocksAsOutputText(productKey, stageKey, key)
    ? blocksComparableText(layoutBlocks)
    : text;
  return {
    key,
    sequence,
    path: `${productKey}/${stageKey}/${sequence}`,
    file: itemRelativePath(productKey, stageKey, key),
    name,
    method: methodIdentity.display_name,
    method_key: methodIdentity.method_key,
    method_ref: methodIdentity.method_file,
    method_source: "original_md",
    method_identity: methodIdentity,
    source: {
      product: productName,
      product_key: productKey,
      stage: stageKey,
      md_section: mdTest?.sequence ?? "",
      md_title: mdTest?.title ?? "",
    },
    copy_from_packaging: stageKey === "finished" && refs.length > 0,
    copy_group: stageKey === "finished" && refs.length > 0 ? copyGroup(key) : "",
    copied_from: null,
    packaging_reference_phrases: refs,
    text: outputText,
    md_fields: outputMdFields,
    method_file: methodIdentity.method_file,
    method_groups: methodGroups,
    layout_blocks: layoutBlocks,
    record_config: {
      source: "embedded_json",
      standard_template: usesDeprecatedStandardTemplate ? "" : standardTemplate,
      standard_params: usesDeprecatedStandardTemplate ? {} : stripDeprecatedParamValues(rec(test["标准规定参数"])),
      conclusion_name: str(test["结论名称"]),
      has_numeric_conclusion: test["结论含数值"] === true,
      conclusion_rule: rec(test["结论判定"]),
      cleanup_template: str(test["清场模板"]),
      attachment_template: str(test["附加说明模板"]),
      attachment_params: stripDeprecatedParamValues(rec(test["附加说明参数"])),
    },
    sections,
    migration: {
      previous_method_label: methodName,
      previous_layout: layout,
    },
  };
}

function applyPackagingCopies(stages) {
  const packagingTests = new Map((stages.packaging?.tests ?? []).map((test) => [test.key, test]));
  for (const test of stages.finished?.tests ?? []) {
    if (!test.copy_from_packaging) continue;
    const source = packagingTests.get(test.key);
    if (!source) continue;
    const originalText = test.text;
    const originalSections = test.sections;
    const originalMdFields = test.md_fields;
    const originalLayoutBlocks = test.layout_blocks;
    const isFinishedVariationReference = ["weight_variation", "fill_variation"].includes(str(test.key));
    test.copied_from = {
      stage: "packaging",
      sequence: source.sequence,
      key: source.key,
      name: source.name,
    };
    test.text = isFinishedVariationReference ? originalText : remapSequenceText(source.text, source.sequence, test.sequence);
    test.sections = isFinishedVariationReference ? originalSections : remapSections(source.sections, source.sequence, test.sequence);
    test.md_fields = isFinishedVariationReference ? originalMdFields : source.md_fields;
    test.method_file = source.method_file;
    test.method_ref = source.method_ref;
    test.method_identity = {
      ...test.method_identity,
      reuse_policy: "reference_packaging_exact_copy",
      reference_method_key: source.method_key,
      reference_method_ref: source.method_ref,
      reference_stage: "packaging",
      reference_sequence: source.sequence,
    };
    test.method_groups = addReferenceFieldKeys(
      rekeyMethodGroups(source.method_groups, "finished", test.key),
      source.method_groups,
    );
    test.layout_blocks = isFinishedVariationReference
      ? normalizeFinishedVariationReferenceLayoutBlocks(originalLayoutBlocks, test)
      : remapCopiedLayoutBlocks(
        source.layout_blocks,
        "packaging",
        "finished",
        test.key,
        source.sequence,
        test.sequence,
      );
    if (str(test.file) === "items/azithromycin_finished_content.json") {
      test.layout_blocks = normalizeAzithromycinFinishedContentCopiedLayoutBlocks(test.layout_blocks);
    }
    if (str(test.file) === "items/azithromycin_finished_dissolution.json") {
      test.layout_blocks = normalizeAzithromycinFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/berberine_tannate_finished_content.json") {
      test.layout_blocks = normalizeBerberineFinishedContentReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/clarithromycin_finished_dissolution.json") {
      test.layout_blocks = normalizeClarithromycinFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/compound_rutin_finished_content.json") {
      test.layout_blocks = normalizeCompoundRutinFinishedContentReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/diammonium_glycyrrhizinate_finished_dissolution.json") {
      test.layout_blocks = normalizeDiammoniumFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/hydrochlorothiazide_finished_dissolution.json") {
      test.layout_blocks = normalizeHydrochlorothiazideFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/isosorbide_dinitrate_finished_dissolution.json") {
      test.layout_blocks = normalizeIsosorbideFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/levofloxacin_finished_dissolution.json") {
      test.layout_blocks = normalizeLevofloxacinFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/methimazole_finished_content.json") {
      test.layout_blocks = normalizeMethimazoleFinishedContentReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/hydrochlorothiazide_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "氢氯噻嗪片成品含量均匀度",
        sourceTemplateId: "dedicated/hydrochlorothiazide_finished_content_uniformity_reference_summary",
        dropPatterns: [/氢氯噻嗪片含量均匀度/],
      });
    }
    if (str(test.file) === "items/isosorbide_dinitrate_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "硝酸异山梨酯片成品含量均匀度",
        sourceTemplateId: "dedicated/isosorbide_finished_content_uniformity_reference_summary",
        dropPatterns: [/硝酸异山梨酯片含量均匀度/],
      });
    }
    if (str(test.file) === "items/methimazole_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "甲巯咪唑片成品含量均匀度",
        sourceTemplateId: "dedicated/methimazole_finished_content_uniformity_reference_summary",
        dropPatterns: [/甲巯咪唑片.*含量均匀度/],
      });
    }
    if (str(test.file) === "items/pantoprazole_finished_acid_release.json") {
      test.layout_blocks = normalizePantoprazoleFinishedReleaseReferenceLayoutBlocks(test, {
        labelPrefix: "泮托拉唑钠肠溶片成品酸中释放度",
        sourceTemplateId: "dedicated/pantoprazole_finished_acid_release_reference_summary",
        leftHeader: "溶出度",
        fieldSuffix: "酸中释放度",
        dropLabel: "泮托拉唑钠肠溶片酸中释放度测定与计算",
      });
    }
    if (str(test.file) === "items/pantoprazole_finished_dissolution.json") {
      test.layout_blocks = normalizePantoprazoleFinishedReleaseReferenceLayoutBlocks(test, {
        labelPrefix: "泮托拉唑钠肠溶片成品释放度",
        sourceTemplateId: "dedicated/pantoprazole_finished_dissolution_reference_summary",
        leftHeader: "释放度",
        fieldSuffix: "释放度",
        dropLabel: "泮托拉唑钠肠溶片释放度测定与计算",
      });
    }
    if (str(test.file) === "items/simvastatin_finished_dissolution.json") {
      test.layout_blocks = normalizeSimvastatinFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/simvastatin_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "辛伐他汀片成品含量均匀度",
        sourceTemplateId: "dedicated/simvastatin_finished_content_uniformity_reference_summary",
        compact: true,
        dropPatterns: [/辛伐他汀片含量均匀度/],
      });
    }
    if (str(test.file) === "items/spironolactone_finished_dissolution.json") {
      test.layout_blocks = normalizeSimpleFinishedDissolutionReferenceLayoutBlocks(test, {
        labelPrefix: "螺内酯片成品溶出度",
        sourceTemplateId: "dedicated/spironolactone_finished_dissolution_reference_summary",
        leftHeader: "溶出量",
        dropLabel: "螺内酯片溶出度测定与计算",
      });
    }
    if (str(test.file) === "items/spironolactone_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "螺内酯片成品含量均匀度",
        sourceTemplateId: "dedicated/spironolactone_finished_content_uniformity_reference_summary",
        compact: true,
        dropPatterns: [/螺内酯片含量均匀度/],
      });
    }
    if (str(test.file) === "items/terazosin_finished_dissolution.json") {
      test.layout_blocks = normalizeSimpleFinishedDissolutionReferenceLayoutBlocks(test, {
        labelPrefix: "盐酸特拉唑嗪胶囊成品溶出度",
        sourceTemplateId: "dedicated/terazosin_finished_dissolution_reference_summary",
        leftHeader: "供试品溶出度",
        dropLabel: "盐酸特拉唑嗪胶囊溶出度测定与计算",
      });
    }
    if (str(test.file) === "items/terazosin_finished_content_uniformity.json") {
      test.layout_blocks = normalizeFinishedContentUniformityReferenceLayoutBlocks(test, {
        labelPrefix: "盐酸特拉唑嗪胶囊成品含量均匀度",
        sourceTemplateId: "dedicated/terazosin_finished_content_uniformity_reference_summary",
        dropPatterns: [/盐酸特拉唑嗪胶囊含量均匀度/],
      });
    }
    if (str(test.file) === "items/verapamil_finished_dissolution.json") {
      test.layout_blocks = normalizeSimpleFinishedDissolutionReferenceLayoutBlocks(test, {
        labelPrefix: "盐酸维拉帕米片成品溶出度",
        sourceTemplateId: "dedicated/verapamil_finished_dissolution_reference_summary",
        leftHeader: "溶出度",
        dropLabel: "盐酸维拉帕米片溶出度测定与计算",
      });
    }
    if (str(test.file) === "items/allopurinol_finished_dissolution.json") {
      test.layout_blocks = normalizeAllopurinolFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (str(test.file) === "items/atenolol_finished_dissolution.json") {
      test.layout_blocks = normalizeAtenololFinishedDissolutionReferenceLayoutBlocks(test);
    }
    if (SIMPLE_FINISHED_CONTENT_REFERENCE_SUMMARY_FILES.has(str(test.file))) {
      test.layout_blocks = normalizeSimpleFinishedContentReferenceLayoutBlocks(test);
    }
    if (str(test.file).startsWith("items/diammonium_glycyrrhizinate_finished_")) {
      test.text = blocksComparableText(test.layout_blocks);
    }
  }
}

function buildReport({ generatedAt, products, missingMd, packagingReferences, copyCandidates, copyGroups, countsByTestKey, layoutSource }) {
  const totalProducts = products.length;
  const totalStages = products.reduce((sum, product) => sum + Object.keys(product.stages).length, 0);
  const totalTests = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => stageSum + stage.tests.length, 0)
  ), 0);
  const layoutBlockCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => (
      stageSum + stage.tests.reduce((testSum, test) => testSum + arr(test.layout_blocks).length, 0)
    ), 0)
  ), 0);
  const mdFieldCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => (
      stageSum + stage.tests.reduce((testSum, test) => testSum + test.md_fields.length, 0)
    ), 0)
  ), 0);
  const methodFieldCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => (
      stageSum + stage.tests.reduce((testSum, test) => (
        testSum + test.method_groups.reduce((groupSum, group) => groupSum + group.fields.length, 0)
      ), 0)
    ), 0)
  ), 0);
  const formulaCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => (
      stageSum + stage.tests.reduce((testSum, test) => (
        testSum + test.method_groups.reduce((groupSum, group) => (
          groupSum + group.fields.filter((field) => field.formula || field.rule).length
        ), 0)
      ), 0)
    ), 0)
  ), 0);
  const layoutCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => (
      stageSum + stage.tests.filter((test) => test.migration?.previous_layout).length
    ), 0)
  ), 0);
  const itemFileCount = products.reduce((sum, product) => (
    sum + Object.values(product.stages).reduce((stageSum, stage) => stageSum + stage.tests.length, 0)
  ), 0);
  const lines = [
    "# Product Stage Tests Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Products: ${totalProducts}`,
    `- Stages: ${totalStages}`,
    `- Non-microbiology tests: ${totalTests}`,
    `- MD field markers preserved: ${mdFieldCount}`,
    `- Method fields preserved: ${methodFieldCount}`,
    `- Formula/rule fields preserved: ${formulaCount}`,
    `- Layout assignments preserved: ${layoutCount}`,
    `- Layout blocks expanded: ${layoutBlockCount}`,
    `- Item JSON files: ${itemFileCount}`,
    `- Layout source: ${layoutSource || "not found"}`,
    `- Tests with missing MD text: ${missingMd.length}`,
    `- Finished tests copied from packaging: ${copyCandidates.length}`,
    `- Packaging reference phrases: ${packagingReferences.length}`,
    "",
    "## Test Key Counts",
    "",
    "| Test key | Count |",
    "|---|---:|",
    ...Object.entries(countsByTestKey).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `| \`${key}\` | ${count} |`),
    "",
    "## Copy Groups",
    "",
    "| Copy group | Test keys | Count |",
    "|---|---|---:|",
    ...Object.entries(copyGroups).sort(([a], [b]) => a.localeCompare(b)).map(([group, data]) => `| \`${group}\` | ${[...data.keys].sort().map((key) => `\`${key}\``).join(", ")} | ${data.count} |`),
    "",
    "## Finished Packaging References",
    "",
    "| Product | Test | Key | Sequence | Copied from | Phrase |",
    "|---|---|---|---:|---|---|",
    ...(copyCandidates.length
      ? copyCandidates.map((item) => `| ${item.product} | ${item.test} | \`${item.key}\` | ${item.sequence} | ${item.copiedFrom} | ${item.phrase.replace(/\|/g, "\\|")} |`)
      : ["| - | - | - | - |"]),
    "",
    "## Missing MD Text",
    "",
    "| Product | Stage | Test | Sequence |",
    "|---|---|---|---:|",
    ...(missingMd.length
      ? missingMd.map((item) => `| ${item.product} | ${stageLabels[item.stage] ?? item.stage} | ${item.test} | ${item.sequence} |`)
      : ["| - | - | - | - |"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function productTests(products) {
  return products.flatMap((product) => (
    Object.entries(product.stages).flatMap(([stageKey, stage]) => (
      stage.tests.map((test) => ({ product, stageKey, stage, test }))
    ))
  ));
}

function legacyReuseGroup(test) {
  return [
    test.key,
    test.migration?.previous_method_label || "",
    test.migration?.previous_layout?.template_id || "",
  ].join(" || ");
}

function buildMdMethodAudit(products, generatedAt) {
  const groups = new Map();
  for (const { product, stageKey, stage, test } of productTests(products)) {
    const groupKey = legacyReuseGroup(test);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group_key: groupKey,
        test_key: test.key,
        legacy_method_label: test.migration?.previous_method_label || "",
        legacy_template_id: test.migration?.previous_layout?.template_id || "",
        items: [],
        fingerprints: new Map(),
      });
    }
    const group = groups.get(groupKey);
    const fingerprint = test.method_identity?.fingerprint || "";
    const item = {
      product: product.name,
      product_key: product.key,
      stage: stageKey,
      stage_label: stage.label,
      test: test.name,
      test_key: test.key,
      sequence: test.sequence,
      method_key: test.method_key,
      method_ref: test.method_ref,
      fingerprint,
      md_section: test.source?.md_section || "",
      md_title: test.source?.md_title || "",
      evidence_sections: test.method_identity?.evidence_sections || [],
      text_preview: str(test.text).replace(/\s+/g, " ").slice(0, 160),
      copy_from_packaging: test.copy_from_packaging === true,
      copied_from: test.copied_from,
    };
    group.items.push(item);
    if (!group.fingerprints.has(fingerprint)) group.fingerprints.set(fingerprint, []);
    group.fingerprints.get(fingerprint).push(item.method_key);
  }
  const auditGroups = [...groups.values()]
    .map((group) => ({
      group_key: group.group_key,
      test_key: group.test_key,
      legacy_method_label: group.legacy_method_label,
      legacy_template_id: group.legacy_template_id,
      item_count: group.items.length,
      distinct_md_fingerprint_count: group.fingerprints.size,
      old_reuse_is_unsafe: group.items.length > 1 && group.fingerprints.size > 1,
      new_policy: "dedicated_by_product_stage_test",
      fingerprints: [...group.fingerprints.entries()].map(([fingerprint, methodKeys]) => ({
        fingerprint,
        method_keys: methodKeys,
      })),
      items: group.items,
    }))
    .sort((a, b) => (
      Number(b.old_reuse_is_unsafe) - Number(a.old_reuse_is_unsafe)
      || b.distinct_md_fingerprint_count - a.distinct_md_fingerprint_count
      || b.item_count - a.item_count
      || a.group_key.localeCompare(b.group_key)
    ));
  const unsafeGroups = auditGroups.filter((group) => group.old_reuse_is_unsafe);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    purpose: "Audit legacy method/template reuse against original MD. New output does not reuse by this grouping.",
    rule: "Every non-microbiology product/stage/test gets its own MD-derived method key; even parameter-only differences stay split.",
    summary: {
      groups: auditGroups.length,
      unsafe_legacy_reuse_groups: unsafeGroups.length,
      total_items: productTests(products).length,
      dedicated_method_keys: new Set(productTests(products).map(({ test }) => test.method_key)).size,
    },
    groups: auditGroups,
  };
}

function buildMdMethodAuditReport(audit) {
  const lines = [
    "# MD Method Split Audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "## Rule",
    "",
    audit.rule,
    "",
    "## Summary",
    "",
    `- Legacy reuse groups: ${audit.summary.groups}`,
    `- Unsafe legacy reuse groups: ${audit.summary.unsafe_legacy_reuse_groups}`,
    `- Total items: ${audit.summary.total_items}`,
    `- Dedicated method keys: ${audit.summary.dedicated_method_keys}`,
    "",
    "## Unsafe Legacy Reuse Groups",
    "",
    "| Legacy group | Items | MD fingerprints | Action |",
    "|---|---:|---:|---|",
    ...audit.groups.filter((group) => group.old_reuse_is_unsafe).map((group) => (
      `| \`${group.group_key.replace(/\|/g, "\\|")}\` | ${group.item_count} | ${group.distinct_md_fingerprint_count} | split to product/stage/test methods |`
    )),
    "",
    "## All Legacy Groups",
    "",
    "| Legacy group | Items | MD fingerprints | Unsafe |",
    "|---|---:|---:|---|",
    ...audit.groups.map((group) => (
      `| \`${group.group_key.replace(/\|/g, "\\|")}\` | ${group.item_count} | ${group.distinct_md_fingerprint_count} | ${group.old_reuse_is_unsafe ? "yes" : "no"} |`
    )),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function writeMdMethodAudit(audit) {
  await fs.writeFile(mdMethodAuditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await fs.writeFile(mdMethodAuditReportFile, buildMdMethodAuditReport(audit), "utf8");
}

function stripMigrationMetadata(products) {
  for (const { test } of productTests(products)) {
    delete test.migration;
  }
}

async function writeDedicatedMethodFiles(products, generatedAt, sourcePolicy) {
  await fs.rm(dedicatedMethodOutRoot, { recursive: true, force: true });
  await fs.mkdir(dedicatedMethodOutRoot, { recursive: true });
  const written = new Set();
  let count = 0;
  for (const { product, stageKey, stage, test } of productTests(products)) {
    if (!test.method_file || written.has(test.method_file)) continue;
    if (test.method_identity?.reference_method_ref && test.method_file === test.method_identity.reference_method_ref) continue;
    written.add(test.method_file);
    const method = {
      schema_version: 1,
      generated_at: generatedAt,
      source_policy: sourcePolicy,
      method_key: test.method_key,
      method_source: "original_md",
      reuse_policy: test.method_identity?.reuse_policy || "dedicated_by_product_stage_test",
      fingerprint: test.method_identity?.fingerprint || "",
      product: { key: product.key, name: product.name },
      stage: { key: stageKey, label: stage.label },
      test: {
        key: test.key,
        sequence: test.sequence,
        name: test.name,
        path: test.path,
      },
      source: test.source,
      text: test.text,
      sections: test.sections,
      md_fields: test.md_fields,
      method_groups: test.method_groups,
      layout_blocks: test.layout_blocks,
    };
    await fs.writeFile(path.join(outRoot, test.method_file), `${JSON.stringify(method, null, 2)}\n`, "utf8");
    count += 1;
  }
  return count;
}

async function writeItemFiles(products, generatedAt, sourcePolicy) {
  await fs.rm(itemOutRoot, { recursive: true, force: true });
  await fs.mkdir(itemOutRoot, { recursive: true });
  for (const product of products) {
    for (const [stageKey, stage] of Object.entries(product.stages)) {
      for (const test of stage.tests) {
        const item = {
          schema_version: 1,
          generated_at: generatedAt,
          source_policy: sourcePolicy,
          product: {
            key: product.key,
            name: product.name,
          },
          stage: {
            key: stageKey,
            label: stage.label,
          },
          test,
        };
        await fs.writeFile(path.join(outRoot, test.file), `${JSON.stringify(item, null, 2)}\n`, "utf8");
      }
    }
  }
}

async function main() {
  const initialSourceRoot = await findSourceRoot();
  setConfigRoot(initialSourceRoot);
  const initialLayoutRoot = await findLayoutRoot();
  const sourceBundle = await syncSourceBundle({ sourceRoot: initialSourceRoot, layoutRoot: initialLayoutRoot });
  setConfigRoot(qcSourceRoot);

  const recordSources = await loadRecordTemplateSources();
  const layoutMapping = await loadLayoutMapping();
  const layoutRoot = await findLayoutRoot();
  const operationParams = await loadOperationParams(layoutRoot);
  const products = [];
  const rawStageIndex = {};
  const mdStageIndex = {};
  const missingMd = [];
  const packagingReferences = [];
  const countsByTestKey = {};

  for (const recordSource of recordSources) {
    const productKey = recordSource.productKey;
    const template = rec(recordSource.template);
    const productName = str(template["产品名称"], productKey);
    const mdText = await fs.readFile(path.join(mdRoot, `${productName}.md`), "utf8");
    const mdStages = parseMdDocument(mdText);
    const stages = {};

    for (const stageKey of stageOrder) {
      const stage = rec(rec(template["阶段"])[stageKey]);
      const tests = [];
      for (const test of arr(stage["检测项"])) {
        const data = normalizedTestData(productKey, stageKey, test);
        if (isMicrobiology(data)) continue;
        const sequence = str(data["序号"]);
        const name = str(data["名称"]);
        const mdTest = findMdTest(mdStages, stageKey, sequence, name);
        const item = await testObject({
          productName,
          productKey,
          stageKey,
          test: data,
          mdTest,
          layoutAssignments: layoutMapping.assignments,
          layoutRoot,
          operationParams,
        });
        tests.push(item);
        countsByTestKey[item.key] = (countsByTestKey[item.key] ?? 0) + 1;
        if (!item.text) missingMd.push({ product: productName, stage: stageKey, test: name, sequence });
        for (const phrase of item.packaging_reference_phrases) {
          packagingReferences.push({ product: productName, test: name, sequence, phrase });
        }
      }
      stages[stageKey] = {
        key: stageKey,
        label: str(stage["显示名"], stageLabels[stageKey] ?? stageKey),
        tests,
      };
      rawStageIndex[`${productKey}/${stageKey}`] = stage;
      mdStageIndex[`${productKey}/${stageKey}`] = mdStages.find((item) => item.key === stageKey) ?? {};
    }
    applyPackagingCopies(stages);

    products.push({
      key: productKey,
      name: productName,
      stages,
    });
  }

  const generatedAt = new Date().toISOString();
  const copyCandidates = [];
  const copyGroups = {};
  for (const product of products) {
    for (const test of product.stages.finished.tests) {
      if (!test.copy_from_packaging) continue;
      const phrase = test.packaging_reference_phrases[0] ?? "";
      copyCandidates.push({
        product: product.name,
        test: test.name,
        key: test.key,
        sequence: test.sequence,
        copiedFrom: test.copied_from ? `packaging/${test.copied_from.sequence}` : "",
        phrase,
      });
      if (!copyGroups[test.copy_group]) copyGroups[test.copy_group] = { count: 0, keys: new Set() };
      copyGroups[test.copy_group].count += 1;
      copyGroups[test.copy_group].keys.add(test.key);
    }
  }
  const sourcePolicy = {
    runtime_truth: "pharma-qc JSON files",
    record_source: "pharma-qc/records/*.json",
    sequence_source: "pharma-qc/records/*.json and embedded in product_stage_tests.json, items/*.json, full/*.json",
    record_config_source: "embedded in items/*.json#/test/record_config",
    text_source: "embedded from original MD into items/*.json and dedicated_methods/*.json",
    runtime_field_source: "embedded from original MD FIELD markers into method_groups",
    shared_template_source: "pharma-qc/templates/*.json and full/*.json",
    excludes: ["microbial_limit"],
    keys: "english",
    item_file_naming: "product_stage_test",
    method_policy: "dedicated_by_product_stage_test_from_original_md",
    product_params_policy: "disabled_for_method_identity; parameter-only differences stay split",
  };
  const output = {
    schema_version: 1,
    generated_at: generatedAt,
    source_policy: sourcePolicy,
    products,
  };
  const mdMethodAudit = buildMdMethodAudit(products, generatedAt);
  stripMigrationMetadata(products);

  await fs.mkdir(outRoot, { recursive: true });
  await writeCanonicalRecordFiles(products, rawStageIndex, generatedAt);
  await fs.writeFile(outFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeItemFiles(products, generatedAt, sourcePolicy);
  const dedicatedMethodCount = await writeDedicatedMethodFiles(products, generatedAt, sourcePolicy);
  await writeMdMethodAudit(mdMethodAudit);
  await writeStandardFullTemplates(generatedAt);
  const fullStageCount = await writeFullStageFiles(products, rawStageIndex, mdStageIndex, layoutRoot, generatedAt, sourcePolicy);
  await fs.writeFile(reportFile, buildReport({
    generatedAt,
    products,
    missingMd,
    packagingReferences,
    copyCandidates,
    copyGroups,
    countsByTestKey,
    layoutSource: layoutMapping.source,
  }), "utf8");

  console.log(`Wrote ${path.relative(root, outFile)}`);
  console.log(`Wrote ${path.relative(root, recordOutRoot)}/*.json (${recordSources.length})`);
  console.log(`Wrote ${path.relative(root, itemOutRoot)}/*.json`);
  console.log(`Wrote ${path.relative(root, dedicatedMethodOutRoot)}/*.json (${dedicatedMethodCount})`);
  console.log(`Wrote ${path.relative(root, mdMethodAuditFile)}`);
  console.log(`Wrote ${path.relative(root, mdMethodAuditReportFile)}`);
  console.log(`Wrote ${path.relative(root, standardTemplateOutRoot)}/*.json`);
  console.log(`Wrote ${path.relative(root, fullOutRoot)}/*.json (${fullStageCount})`);
  console.log(`Wrote ${path.relative(root, reportFile)}`);
  console.log(`${sourceBundle.copied ? "Synced" : "Using"} ${path.relative(root, qcSourceRoot)} source bundle`);
  console.log(`products=${products.length} tests=${Object.values(countsByTestKey).reduce((sum, count) => sum + count, 0)} dedicated_methods=${dedicatedMethodCount} unsafe_legacy_reuse_groups=${mdMethodAudit.summary.unsafe_legacy_reuse_groups} missing_md=${missingMd.length} packaging_copies=${copyCandidates.length} packaging_refs=${packagingReferences.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
