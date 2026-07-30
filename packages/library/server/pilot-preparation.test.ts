import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { prepareLibraryPilotArtifacts } from "./pilot-preparation";

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

const taxonomy = {
  version: "v1",
  dimensions: { topic: ["正式"] },
};

function record(index: number): CatalogRecord {
  const needsOcr = index % 3 === 0;
  const hasEvidence = index % 2 === 0;
  const extension = index === 2 ? "jpg" : index === 3 ? "docx" : "pdf";
  return {
    path: `分类${index % 5}/资料-${String(index).padStart(2, "0")}.${extension}`,
    absolute_path: `/library/资料-${index}.${extension}`,
    sha256: index.toString(16).padStart(64, "0"),
    size: 1_000 + index,
    title: `资料 ${index}`,
    file_type: extension,
    classification: { security_level: index % 4 === 0 ? "机密" : "内部" },
    tags: index === 1 ? ["正式", "待纳入"] : ["正式"],
    key_passages: hasEvidence
      ? [{ passage: `证据 ${index}`, location: "关键章节", page: index, significance: "关键事实" }]
      : [],
    chunks: hasEvidence ? [] : needsOcr ? [] : [{ title: "摘要", page: 1, text_preview: `摘要 ${index}` }],
    read_issues: needsOcr ? "需要 OCR" : "",
  };
}

function catalogJsonl(records: CatalogRecord[]) {
  return `${records.map((item) => JSON.stringify(item)).join("\n")}\n`;
}

function parseJsonl(content: string) {
  return content.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("prepares a deterministic pilot with 30 unique checksums and ready-to-write files", () => {
  const input = { catalogJsonl: catalogJsonl(Array.from({ length: 32 }, (_, index) => record(index + 1))), taxonomy };
  const first = prepareLibraryPilotArtifacts(input);
  const second = prepareLibraryPilotArtifacts(input);

  assert.deepEqual(second, first);
  const manifest = parseJsonl(first.files["pilot-manifest.v1.jsonl"]);
  const cases = parseJsonl(first.files["gold-cases.draft.v1.jsonl"]);
  assert.equal(manifest.length, 30);
  assert.equal(new Set(manifest.map((item) => item.sourceSha256)).size, 30);
  assert.equal(cases.length, 60);
  assert.deepEqual(JSON.parse(first.files["gate0-summary.json"]), first.summary);
  assert.match(first.files["REVIEW.md"], /Pilot：30 份/);
});

test("owns OCR refusal, evidence cases, taxonomy drift, and normalized file types", () => {
  const prepared = prepareLibraryPilotArtifacts({
    catalogJsonl: catalogJsonl(Array.from({ length: 32 }, (_, index) => record(index + 1))),
    taxonomy,
  });
  const manifest = parseJsonl(prepared.files["pilot-manifest.v1.jsonl"]);
  const cases = parseJsonl(prepared.files["gold-cases.draft.v1.jsonl"]);

  assert.ok(manifest.some((item) => item.needsOcrOrReview === true));
  assert.ok(manifest.some((item) => item.normalizedFileType === "jpeg"));
  assert.ok(cases.some((item) => item.expectedBehavior === "refuse_until_ocr" && item.expectedAnswer === null));
  assert.ok(cases.some((item) => item.expectedBehavior === "answer" && Array.isArray(item.evidence) && item.evidence.length > 0));
  assert.deepEqual(prepared.summary.catalogTagsOutsideTaxonomy, ["待纳入"]);
});

test("fails closed when fewer than 30 unique catalog checksums are available", () => {
  assert.throws(
    () => prepareLibraryPilotArtifacts({
      catalogJsonl: catalogJsonl(Array.from({ length: 29 }, (_, index) => record(index + 1))),
      taxonomy,
    }),
    /30 unique checksums, got 29/,
  );

  const duplicated = Array.from({ length: 30 }, (_, index) => record(index + 1));
  duplicated[29] = { ...duplicated[29], sha256: duplicated[0].sha256 };
  assert.throws(
    () => prepareLibraryPilotArtifacts({ catalogJsonl: catalogJsonl(duplicated), taxonomy }),
    /30 unique checksums, got 29/,
  );
});

test("fails closed for an empty or malformed catalog", () => {
  assert.throws(() => prepareLibraryPilotArtifacts({ catalogJsonl: "", taxonomy }), /Catalog is empty/);
  assert.throws(() => prepareLibraryPilotArtifacts({ catalogJsonl: "{\"bad\"\n", taxonomy }), /Invalid JSONL line 1/);
});

test("CLI delegates Library business rules to the package interface", () => {
  const script = readFileSync(path.resolve(process.cwd(), "scripts/prepare-library-pilot.ts"), "utf8");
  assert.match(script, /from "@workspace\/library\/server\/pilot-preparation"/);
  for (const forbiddenDefinition of [
    "function parseCatalogJsonl(",
    "function stableUid(",
    "function selectPilot(",
    "function makeDraftCases(",
    "Map.groupBy(",
  ]) {
    assert.equal(script.includes(forbiddenDefinition), false, `CLI must not define ${forbiddenDefinition}`);
  }
});
