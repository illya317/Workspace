import path from "path";
import { access, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { normalizeDocumentTemplatePayload } from "@workspace/platform/server/docs-editor";
import { convertQcTemplateToEditorDocument } from "./editor-adapter";
import type {
  QcEditorImportAudit,
  QcEditorImportResult,
} from "./editor-adapter-types";
import { getQcTemplateDetailFromConfig, normalizeProductDisplayName } from "./record-structure";
import type { QcTemplateDetail } from "./types";
import { getTenantProfile, resolveTenantConfigPath } from "@workspace/platform/server/tenant-config";

interface ProductAggregate {
  products?: Array<{ key?: string; name?: string }>;
}

interface SourcePathAudit {
  path: string;
  exists: boolean;
  fileCount: number;
  message?: string;
}

interface CanonicalMdAudit {
  path: string;
  exists: boolean;
  headings: Array<{ level: number; text: string }>;
  headingCounts: Record<string, number>;
  microbiologySection?: {
    found: boolean;
    heading?: string;
    sequence?: string;
    lineCount?: number;
    fieldMarkerCount?: number;
    prefillMarkerCount?: number;
  };
  sourceComment?: {
    fieldCount?: number;
    prefillCount?: number;
    totalFieldMarkers?: number;
    h3Count?: number;
    h4Count?: number;
    totalTitleMarkers?: number;
    missingSections: string[];
    inlineNotPromoted: string[];
  };
}

interface ProductSourceAudit {
  canonicalMd: CanonicalMdAudit;
  recordPath: string;
  recordExists: boolean;
  fullPaths: string[];
  missingFullStageFiles: string[];
  warnings: string[];
}

interface ProductSourceRead {
  audit: ProductSourceAudit;
  canonicalMdRaw: string;
}

interface HeadingComparisonAudit {
  mdHeadingCounts: Record<string, number>;
  editorHeadingCounts: Record<string, number>;
  mdStageHeadingCount: number;
  editorStageHeadingCount: number;
  mdExperimentItemHeadingCount: number;
  editorExperimentItemHeadingCount: number;
  missingStageHeadingsInMd: string[];
  missingTestHeadingsInMd: Array<{ stageKey: string; testKey: string; sequence: string; name: string }>;
  mdExperimentHeadingsMissingInEditor: Array<{ sequence: string; name: string; heading: string }>;
  mdMissingSectionWarnings: string[];
  mdInlineNotPromotedWarnings: string[];
}

interface ProductTemplateAudit {
  productKey: string;
  productName: string;
  outputFile: string;
  stages: number;
  experimentItems: number;
  tables: number;
  fields: number;
  formulas: number;
  conversion: QcEditorImportAudit;
  source: ProductSourceAudit;
  headingComparison: HeadingComparisonAudit;
  warnings: string[];
}

export interface QcEditorTemplateGenerationAudit {
  schemaVersion: 1;
  generatedAt: string;
  configRoot: string;
  sourceSchemaRoot: string;
  outputRoot: string;
  sourceInventory: {
    mdCanonical: SourcePathAudit;
    records: SourcePathAudit;
    full: SourcePathAudit;
    warnings: string[];
  };
  totals: {
    products: number;
    stages: number;
    experimentItems: number;
    tables: number;
    fields: number;
    formulas: number;
  };
  products: ProductTemplateAudit[];
}

export interface GenerateQcEditorTemplatesOptions {
  configRoot?: string;
  sourceSchemaRoot?: string;
  outputRoot?: string;
  productKeys?: string[];
}

const STAGE_ORDER = ["intermediate", "packaging", "finished"];

function defaultOutputRoot() {
  return resolveTenantConfigPath(getTenantProfile().directories.qcTemplateSnapshots);
}

function defaultConfigRoot() {
  const workspaceConfigDir = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!workspaceConfigDir || !path.isAbsolute(workspaceConfigDir)) {
    throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for QC template generation");
  }
  return path.join(workspaceConfigDir, "config", "pharma-qc");
}

export async function generateQcEditorTemplates(options: GenerateQcEditorTemplatesOptions = {}) {
  const configRoot = path.resolve(options.configRoot || process.env.WORKSPACE_QC_CONFIG_ROOT || defaultConfigRoot());
  const sourceSchemaRoot = path.resolve(options.sourceSchemaRoot || process.env.QC_SOURCE_SCHEMA_ROOT || path.join(configRoot, "source", "source_docs", "schema"));
  const outputRoot = path.resolve(options.outputRoot || process.env.QC_EDITOR_TEMPLATE_OUTPUT_ROOT || defaultOutputRoot());

  process.env.WORKSPACE_QC_CONFIG_ROOT = configRoot;

  const [aggregate, sourceInventory] = await Promise.all([
    readJson<ProductAggregate>(path.join(configRoot, "product_stage_tests.json")),
    readSourceInventory(configRoot, sourceSchemaRoot),
  ]);
  const productEntries = (aggregate.products || [])
    .filter((product) => !options.productKeys?.length || options.productKeys.includes(String(product.key || "")))
    .map((product) => ({ key: String(product.key || ""), name: String(product.name || product.key || "") }))
    .filter((product) => product.key)
    .sort((a, b) => a.key.localeCompare(b.key));

  const productsRoot = path.join(outputRoot, "products");
  await rm(productsRoot, { recursive: true, force: true });
  await mkdir(productsRoot, { recursive: true });

  const productAudits: ProductTemplateAudit[] = [];
  for (const product of productEntries) {
    const detail = await getQcTemplateDetailFromConfig(product.key);
    const sourceRead = await readProductSourceAudit(configRoot, sourceSchemaRoot, detail);
    const conversion = convertQcTemplateToEditorDocument(detail, {
      dryingWeightMultipliers: getTenantProfile().docs.formulaRules.dryingWeightMultipliers,
    });
    const normalized = normalizeDocumentTemplatePayload(conversion.document, conversion.fieldModel);
    if (normalized.ok === false) {
      throw new Error(`QC 编辑器模板数据无效：${detail.id} ${normalized.issue.message}`);
    }
    const normalizedConversion: QcEditorImportResult = {
      ...conversion,
      document: normalized.data.document as QcEditorImportResult["document"],
      fieldModel: normalized.data.fieldModel as QcEditorImportResult["fieldModel"],
    };
    const headingComparison = compareHeadings(detail, normalizedConversion, sourceRead.audit.canonicalMd);
    const outputFile = path.join(productsRoot, `${product.key}.json`);
    const productAudit = buildProductAudit(detail, normalizedConversion, sourceRead.audit, headingComparison, outputFile);
    await writeJson(outputFile, {
      schemaVersion: 1,
      kind: "qc-doc-editor-product-template",
      generatedAt: new Date().toISOString(),
      productKey: detail.id,
      productName: detail.productName,
      document: normalizedConversion.document,
      fieldModel: normalizedConversion.fieldModel,
      audit: productAudit,
    });
    productAudits.push(productAudit);
  }

  const audit: QcEditorTemplateGenerationAudit = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configRoot,
    sourceSchemaRoot,
    outputRoot,
    sourceInventory,
    totals: {
      products: productAudits.length,
      stages: sum(productAudits, "stages"),
      experimentItems: sum(productAudits, "experimentItems"),
      tables: sum(productAudits, "tables"),
      fields: sum(productAudits, "fields"),
      formulas: sum(productAudits, "formulas"),
    },
    products: productAudits,
  };
  await writeJson(path.join(outputRoot, "audit.json"), audit);
  return audit;
}

async function readSourceInventory(configRoot: string, sourceSchemaRoot: string): Promise<QcEditorTemplateGenerationAudit["sourceInventory"]> {
  const mdCanonical = await pathAudit(path.join(sourceSchemaRoot, "md_canonical"), ".md");
  const records = await pathAudit(path.join(configRoot, "records"), ".json");
  const full = await pathAudit(path.join(configRoot, "full"), ".json");
  const warnings = [
    ...(!mdCanonical.exists ? [`canonical md path missing: ${mdCanonical.path}`] : []),
    ...(!records.exists ? [`record source path missing: ${records.path}`] : []),
    ...(!full.exists ? [`full source path missing: ${full.path}`] : []),
  ];
  return { mdCanonical, records, full, warnings };
}

async function readProductSourceAudit(configRoot: string, sourceSchemaRoot: string, detail: QcTemplateDetail): Promise<ProductSourceRead> {
  const mdPath = await canonicalMdPathForProduct(sourceSchemaRoot, detail.productName);
  const recordPath = path.join(configRoot, "records", `${detail.id}.json`);
  const fullPaths = stageKeys(detail).map((stageKey) => path.join(configRoot, "full", `${detail.id}_${stageKey}_full.json`));
  const record = await readOptionalJson(recordPath);
  const fullPathReads = await Promise.all(fullPaths.map(readOptionalJson));
  const missingFullStageFiles = stageKeys(detail).filter((_, index) => !fullPathReads[index]?.ok);
  const canonicalMdRead = await readCanonicalMd(mdPath);
  const canonicalMd = canonicalMdRead.audit;
  const warnings = [
    ...(!canonicalMd.exists ? [`canonical md path missing: ${mdPath}`] : []),
    ...(!record.ok ? [`record JSON missing: ${recordPath}`] : []),
    ...missingFullStageFiles.map((stageKey) => `full JSON missing for stage ${stageKey}`),
  ];
  return {
    audit: {
      canonicalMd,
      recordPath,
      recordExists: record.ok,
      fullPaths,
      missingFullStageFiles,
      warnings,
    },
    canonicalMdRaw: canonicalMdRead.raw,
  };
}

async function canonicalMdPathForProduct(sourceSchemaRoot: string, productName: string) {
  const mdRoot = path.join(sourceSchemaRoot, "md_canonical");
  const directPath = path.join(mdRoot, `${productName}.md`);
  if (await pathExists(directPath)) return directPath;
  const files = await readdir(mdRoot).catch(() => []);
  const matchedFile = files.find((file) => {
    if (!file.endsWith(".md")) return false;
    return normalizeProductDisplayName(path.basename(file, ".md")) === productName;
  });
  return matchedFile ? path.join(mdRoot, matchedFile) : directPath;
}

async function pathExists(filePath: string) {
  return access(filePath).then(() => true, () => false);
}

function buildProductAudit(
  detail: QcTemplateDetail,
  conversion: QcEditorImportResult,
  source: ProductSourceAudit,
  headingComparison: HeadingComparisonAudit,
  outputFile: string,
): ProductTemplateAudit {
  const counts = conversion.audit.counts.editor;
  const warnings = [
    ...conversion.audit.warnings,
    ...source.warnings,
    ...(headingComparison.missingStageHeadingsInMd.length ? [`MD stage headings missing: ${headingComparison.missingStageHeadingsInMd.join(", ")}`] : []),
    ...(headingComparison.missingTestHeadingsInMd.length ? [`MD test headings missing: ${headingComparison.missingTestHeadingsInMd.length}`] : []),
    ...(headingComparison.mdExperimentHeadingsMissingInEditor.length ? [`MD experiment headings missing in editor: ${headingComparison.mdExperimentHeadingsMissingInEditor.length}`] : []),
  ];
  return {
    productKey: detail.id,
    productName: detail.productName,
    outputFile,
    stages: detail.stages.length,
    experimentItems: counts.tests,
    tables: counts.tables,
    fields: counts.fields,
    formulas: counts.formulas,
    conversion: conversion.audit,
    source,
    headingComparison,
    warnings,
  };
}

function compareHeadings(detail: QcTemplateDetail, conversion: QcEditorImportResult, md: CanonicalMdAudit): HeadingComparisonAudit {
  const editorHeadings = conversion.document.blocks.filter((block) => block.type === "heading");
  const editorHeadingCounts = countBy(editorHeadings.map((block) => `h${block.level}`));
  const stageSections = mdStageSections(md.headings);
  const mdStageHeadingCount = stageSections.length;
  const editorStageHeadingCount = editorHeadings.filter((block) => block.metadata?.qcRole === "stageHeading").length;
  const mdExperimentItemHeadingCount = md.headings.filter((heading) => heading.level === 3 && /^2\.\d+\b/.test(heading.text.trim())).length;
  const editorExperimentItemHeadingCount = editorHeadings.filter((block) => block.metadata?.qcRole === "testHeading").length;
  const missingStageHeadingsInMd = detail.stages
    .filter((stage) => !stageSections.some((section) => stageHeadingMatches(detail, stage.key, stage.label, section.heading.text)))
    .map((stage) => `${stage.key}:${stage.label}`);
  const missingTestHeadingsInMd = detail.stages.flatMap((stage) => {
    const section = stageSections.find((item) => stageHeadingMatches(detail, stage.key, stage.label, item.heading.text));
    const headings = section?.headings || md.headings.filter((heading) => heading.level === 3);
    return stage.tests
      .filter((test) => !headings.some((heading) => mdTestHeadingMatches(heading.text, test.sequence, test.name)))
      .map((test) => ({ stageKey: stage.key, testKey: test.englishName, sequence: test.sequence, name: test.name }));
  });
  const editorTestHeadings = editorHeadings.filter((block) => block.metadata?.qcRole === "testHeading");
  const mdExperimentHeadingsMissingInEditor = md.headings
    .filter((heading) => heading.level === 3 && /^2\.\d+\b/.test(heading.text.trim()))
    .filter((heading) => !editorTestHeadings.some((block) => mdEditorTestHeadingMatches(heading.text, block.text)))
    .map((heading) => ({
      sequence: heading.text.match(/^(\d+(?:\.\d+)*)/)?.[1] || "",
      name: heading.text.replace(/^(\d+(?:\.\d+)*)\s*(?:[|｜]\s*)?/, "").trim(),
      heading: heading.text,
    }));
  return {
    mdHeadingCounts: md.headingCounts,
    editorHeadingCounts,
    mdStageHeadingCount,
    editorStageHeadingCount,
    mdExperimentItemHeadingCount,
    editorExperimentItemHeadingCount,
    missingStageHeadingsInMd,
    missingTestHeadingsInMd,
    mdExperimentHeadingsMissingInEditor,
    mdMissingSectionWarnings: md.sourceComment?.missingSections || [],
    mdInlineNotPromotedWarnings: md.sourceComment?.inlineNotPromoted || [],
  };
}

function mdEditorTestHeadingMatches(mdHeadingText: string, editorHeadingText: string) {
  const mdSequence = mdHeadingText.match(/^(\d+(?:\.\d+)*)/)?.[1];
  const editorSequence = editorHeadingText.match(/^(\d+(?:\.\d+)*)/)?.[1];
  if (mdSequence && editorSequence && mdSequence === editorSequence) return true;
  return normalizeText(editorHeadingText).includes(normalizeText(mdHeadingText.replace(/^(\d+(?:\.\d+)*)\s*(?:[|｜]\s*)?/, "")));
}

function microbiologySectionAudit(raw: string): CanonicalMdAudit["microbiologySection"] {
  const heading = raw.split(/\r?\n/).find((line) => /^###\s+.+微生物限度检查/.test(line.trim()));
  if (!heading) return { found: false };
  const sectionStart = raw.indexOf(heading);
  const section = sectionStart >= 0 ? raw.slice(sectionStart) : "";
  return {
    found: true,
    heading: heading.replace(/^###\s+/, "").trim(),
    sequence: heading.match(/^###\s+(\d+(?:\.\d+)*)/)?.[1],
    lineCount: section.split(/\r?\n/).filter((line) => line.trim()).length,
    fieldMarkerCount: (section.match(/\{FIELD:/g) || []).length,
    prefillMarkerCount: (section.match(/\{PREFILL:/g) || []).length,
  };
}

function mdTestHeadingMatches(headingText: string, sequence: string, testName: string) {
  const text = headingText.trim();
  return text.startsWith(sequence) || normalizeText(text).includes(normalizeText(testName));
}

function stageHeadingMatches(detail: QcTemplateDetail, stageKey: string, stageLabel: string, headingText: string) {
  const heading = normalizeText(headingText);
  if (heading.includes(normalizeText(stageLabel))) return true;
  if (stageKey !== "finished") return false;
  return (
    heading.includes(normalizeText(detail.productName))
    && !heading.includes("中间体")
    && !heading.includes("待包装品")
    && !heading.includes("包装品")
  );
}

function mdStageSections(headings: Array<{ level: number; text: string }>) {
  const sections: Array<{ heading: { level: number; text: string }; headings: Array<{ level: number; text: string }> }> = [];
  for (const heading of headings) {
    if (heading.level === 2) {
      sections.push({ heading, headings: [] });
      continue;
    }
    sections.at(-1)?.headings.push(heading);
  }
  return sections;
}

async function readCanonicalMd(filePath: string): Promise<{ audit: CanonicalMdAudit; raw: string }> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return { audit: { path: filePath, exists: false, headings: [], headingCounts: {} }, raw };
  const headings = [...raw.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({ level: match[1].length, text: match[2].trim() }));
  return {
    audit: {
      path: filePath,
      exists: true,
      headings,
      headingCounts: countBy(headings.map((heading) => `h${heading.level}`)),
      microbiologySection: microbiologySectionAudit(raw),
      sourceComment: parseSourceComment(raw.match(/^<!--([\s\S]*?)-->/)?.[1] || ""),
    },
    raw,
  };
}

function parseSourceComment(comment: string): CanonicalMdAudit["sourceComment"] {
  const fieldMatch = comment.match(/字段:\s*(\d+)\s+FIELD\s+\+\s+(\d+)\s+PREFILL\s+=\s+(\d+)/);
  const titleMatch = comment.match(/标题:\s*(\d+)\s+###\s+\+\s+(\d+)\s+####\s+=\s+(\d+)/);
  return {
    fieldCount: numberFromMatch(fieldMatch, 1),
    prefillCount: numberFromMatch(fieldMatch, 2),
    totalFieldMarkers: numberFromMatch(fieldMatch, 3),
    h3Count: numberFromMatch(titleMatch, 1),
    h4Count: numberFromMatch(titleMatch, 2),
    totalTitleMarkers: numberFromMatch(titleMatch, 3),
    missingSections: parseWarningBullets(comment, "子章节缺失"),
    inlineNotPromoted: parseWarningBullets(comment, "内联未提升"),
  };
}

function parseWarningBullets(comment: string, label: string) {
  const lines = comment.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(label));
  if (start < 0) return [];
  const items: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*⚠️/.test(line)) break;
    const match = line.match(/^\s*•\s*(.+)$/);
    if (match) items.push(match[1].trim());
  }
  return items;
}

async function pathAudit(dirPath: string, extension: string): Promise<SourcePathAudit> {
  const files = await listFiles(dirPath, extension).catch(() => []);
  return {
    path: dirPath,
    exists: files.length > 0 || await existsDir(dirPath),
    fileCount: files.length,
    message: files.length ? undefined : "No matching files found.",
  };
}

async function listFiles(dirPath: string, extension: string) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).map((entry) => path.join(dirPath, entry.name)).sort();
}

async function existsDir(dirPath: string) {
  try {
    const entries = await readdir(dirPath);
    return Array.isArray(entries);
  } catch {
    return false;
  }
}

async function readOptionalJson(filePath: string): Promise<{ ok: boolean; data?: unknown }> {
  try {
    return { ok: true, data: JSON.parse(await readFile(filePath, "utf8")) as unknown };
  } catch {
    return { ok: false };
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function stageKeys(detail: QcTemplateDetail) {
  const keys = detail.stages.map((stage) => stage.key);
  return [...keys].sort((a, b) => {
    const indexA = STAGE_ORDER.indexOf(a);
    const indexB = STAGE_ORDER.indexOf(b);
    return (indexA < 0 ? 99 : indexA) - (indexB < 0 ? 99 : indexB);
  });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").replace(/[|｜（）()：:，,。.\-—_]/g, "").toLowerCase();
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, key) => {
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function numberFromMatch(match: RegExpMatchArray | null, index: number) {
  const value = Number(match?.[index]);
  return Number.isFinite(value) ? value : undefined;
}

function sum<T>(items: T[], key: keyof T) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}
