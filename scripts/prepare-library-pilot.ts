import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CatalogRecord = {
  path: string;
  absolute_path: string;
  sha256: string;
  size: number;
  title: string;
  file_type: string;
  classification: { security_level: string };
  tags: string[];
  key_passages: Array<{ passage?: string; location?: string; page?: number; significance?: string }>;
  chunks: Array<{ title?: string; page?: number; text_preview?: string }>;
  read_issues: string;
};

type Taxonomy = {
  version: string;
  dimensions: Record<string, string[]>;
};

const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const indexDir = valueAfter("--index-dir")?.trim();
const checkOnly = args.includes("--check");

if (!indexDir) {
  throw new Error("Usage: npx tsx scripts/prepare-library-pilot.ts --index-dir <资料库索引> [--check]");
}

const repoRoot = process.cwd();
const taxonomyPath = path.join(repoRoot, "prisma/seed-data/library-taxonomy.v1.json");
const catalogPath = path.join(indexDir, "catalog.jsonl");
const outputDir = path.join(indexDir, "phase0");

function parseJsonl<T>(text: string): T[] {
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(`Invalid JSONL line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function stableUid(prefix: string, ...parts: string[]) {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}-${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function normalizedFileType(record: CatalogRecord) {
  const ext = path.extname(record.path).slice(1).toLowerCase();
  return ext === "jpg" ? "jpeg" : ext;
}

function category(record: CatalogRecord) {
  return record.path.split("/")[0] || "未分类";
}

function compareRecords(a: CatalogRecord, b: CatalogRecord) {
  return a.sha256.localeCompare(b.sha256) || a.path.localeCompare(b.path, "zh");
}

function selectPilot(records: CatalogRecord[]) {
  const selected: CatalogRecord[] = [];
  const selectedHashes = new Set<string>();
  const groups = Map.groupBy(records, category);

  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh"))) {
    const sorted = [...group].sort(compareRecords);
    const readable = sorted.find((record) => !record.read_issues.trim());
    const needsOcr = sorted.find((record) => record.read_issues.trim());
    for (const candidate of [readable, needsOcr, ...sorted]) {
      if (!candidate || selectedHashes.has(candidate.sha256)) continue;
      selected.push(candidate);
      selectedHashes.add(candidate.sha256);
      if (selected.filter((item) => category(item) === category(candidate)).length === 3) break;
    }
  }

  const representedTypes = new Set(selected.map(normalizedFileType));
  const remaining = records.filter((record) => !selectedHashes.has(record.sha256)).sort((a, b) => {
    const typeA = representedTypes.has(normalizedFileType(a)) ? 1 : 0;
    const typeB = representedTypes.has(normalizedFileType(b)) ? 1 : 0;
    return typeA - typeB || Number(Boolean(a.read_issues)) - Number(Boolean(b.read_issues)) || compareRecords(a, b);
  });
  for (const candidate of remaining) {
    if (selected.length >= 30) break;
    selected.push(candidate);
    selectedHashes.add(candidate.sha256);
    representedTypes.add(normalizedFileType(candidate));
  }
  return selected.slice(0, 30);
}

function makeDraftCases(record: CatalogRecord, pilotUid: string) {
  const securityMap: Record<string, number> = { "公开": 1, "内部": 2, "机密": 3, "绝密": 4 };
  const passages = record.key_passages.filter((item) => item.passage?.trim()).slice(0, 2);
  return [0, 1].map((ordinal) => {
    const passage = passages[ordinal];
    const fallbackChunk = record.chunks[ordinal] ?? record.chunks[0];
    const quote = passage?.passage?.trim() || fallbackChunk?.text_preview?.trim() || "";
    const locator = passage
      ? { schemaVersion: "v1", ...(passage.page ? { page: passage.page } : {}), sectionPath: [passage.location || record.title] }
      : fallbackChunk
        ? { schemaVersion: "v1", ...(fallbackChunk.page ? { page: fallbackChunk.page } : {}), sectionPath: [fallbackChunk.title || record.title] }
        : null;
    const hasEvidence = Boolean(quote && locator);
    return {
      caseUid: stableUid("eval", record.sha256, String(ordinal)),
      pilotUid,
      sourceSha256: record.sha256,
      sourcePath: record.path,
      versionUid: null,
      kind: ordinal === 0 ? "search" : "qa",
      question: hasEvidence
        ? `《${record.title}》中${passage?.significance ? `关于“${passage.significance}”` : "对应章节"}的关键事实是什么？请给出原文定位。`
        : `《${record.title}》的关键内容是什么？请只依据可定位原文回答。`,
      expectedAnswer: hasEvidence ? quote : null,
      expectedBehavior: hasEvidence ? "answer" : "refuse_until_ocr",
      minConfidentiality: securityMap[record.classification.security_level] ?? 2,
      evidence: hasEvidence ? [{ quote, locator }] : [],
      reviewStatus: "pending_human",
      reviewNote: hasEvidence ? "人工改写问题并逐字核对证据" : "先完成 OCR/解析，再补问题与证据",
    };
  });
}

async function main() {
const [catalogText, taxonomyText] = await Promise.all([
  readFile(catalogPath, "utf8"),
  readFile(taxonomyPath, "utf8"),
]);
const records = parseJsonl<CatalogRecord>(catalogText);
const taxonomy = JSON.parse(taxonomyText) as Taxonomy;
const formalTags = new Set(Object.values(taxonomy.dimensions).flat());
const usedTags = new Set(records.flatMap((record) => record.tags));
const outsideTaxonomy = [...usedTags].filter((tag) => !formalTags.has(tag)).sort((a, b) => a.localeCompare(b, "zh"));
const pilot = selectPilot(records);

if (records.length === 0) throw new Error("Catalog is empty");
if (pilot.length !== 30) throw new Error(`Pilot must contain 30 records, got ${pilot.length}`);
if (new Set(pilot.map((record) => record.sha256)).size !== pilot.length) throw new Error("Pilot contains duplicate checksums");

const pilotRows = pilot.map((record, ordinal) => ({
  pilotUid: stableUid("pilot", record.sha256),
  ordinal: ordinal + 1,
  sourcePath: record.path,
  sourceAbsolutePath: record.absolute_path,
  sourceSha256: record.sha256,
  sourceSizeBytes: record.size,
  versionUid: null,
  category: category(record),
  normalizedFileType: normalizedFileType(record),
  securityLevel: record.classification.security_level,
  needsOcrOrReview: Boolean(record.read_issues.trim()),
  readIssues: record.read_issues,
  draftTitle: record.title,
  draftTags: record.tags,
  reviewStatus: "pending_human",
}));
const cases = pilotRows.flatMap((pilotRow, index) => makeDraftCases(pilot[index], pilotRow.pilotUid));

const summary = {
  catalogCount: records.length,
  pilotCount: pilotRows.length,
  draftCaseCount: cases.length,
  categories: Object.fromEntries([...Map.groupBy(pilotRows, (row) => row.category)].map(([key, rows]) => [key, rows.length])),
  fileTypes: Object.fromEntries([...Map.groupBy(pilotRows, (row) => row.normalizedFileType)].map(([key, rows]) => [key, rows.length])),
  needsOcrOrReview: pilotRows.filter((row) => row.needsOcrOrReview).length,
  formalTaxonomyTagCount: formalTags.size,
  catalogTagsOutsideTaxonomy: outsideTaxonomy,
  approvedCaseCount: cases.filter((item) => item.reviewStatus === "approved").length,
};

if (checkOnly) {
  const existingSummary = JSON.parse(await readFile(path.join(outputDir, "gate0-summary.json"), "utf8"));
  if (JSON.stringify(existingSummary) !== JSON.stringify(summary)) throw new Error("Phase 0 outputs are stale; rerun without --check");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "pilot-manifest.v1.jsonl"), `${pilotRows.map((row) => JSON.stringify(row)).join("\n")}\n`),
  writeFile(path.join(outputDir, "gold-cases.draft.v1.jsonl"), `${cases.map((row) => JSON.stringify(row)).join("\n")}\n`),
  writeFile(path.join(outputDir, "gate0-summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
  writeFile(path.join(outputDir, "REVIEW.md"), `# Phase 0 人工复核单\n\n- Pilot：${pilotRows.length} 份\n- 金标候选：${cases.length} 条\n- 待 OCR/读取复核：${summary.needsOcrOrReview} 份\n- 当前 approved 金标：0 条\n\n## 复核要求\n\n1. 每份资料确认标题、主题分类、正式 tags 和密级。\n2. 每条问题改成真实检索问法，逐字核对 expectedAnswer 与 locator。\n3. OCR 前无法定位的条目保持 \`refuse_until_ocr\`，不能凭文件名批准。\n4. 只有人工签字后把 reviewStatus 改为 \`approved\`；新 tag 必须先升级 taxonomy。\n5. Phase 0 Gate 只有在 30 份 Pilot 和至少 50 条问题全部完成审核后才能 PASS。\n`),
]);
console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
