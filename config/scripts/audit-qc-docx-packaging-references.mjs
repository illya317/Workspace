#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const workspaceRoot = path.resolve(root, "..");
const qcRoot = path.join(workspaceRoot, ".workspace/config/pharma-qc");
const rawDocxRoot = path.join(workspaceRoot, ".workspace/pdf/raw");
const productTestsFile = path.join(qcRoot, "product_stage_tests.json");
const outJson = path.join(qcRoot, "docx_packaging_reference_audit.json");
const outMd = path.join(qcRoot, "docx_packaging_reference_audit.md");

const stageOrder = ["intermediate", "packaging", "finished"];
const watchedCopyKeys = new Set([
  "content",
  "content_uniformity",
  "dissolution",
  "acid_release",
  "acid_resistance",
  "weight_variation",
  "fill_variation",
]);

function str(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return str(value).replace(/\s+/g, "");
}

function decodeXmlText(value) {
  return str(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function docxXml(file) {
  return execFileSync("unzip", ["-p", file, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
}

function paragraphTextsFromDocx(file) {
  const xml = docxXml(file)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n");
  const paragraphs = [];
  for (const match of xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)) {
    const text = [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((textMatch) => decodeXmlText(textMatch[1]))
      .join("");
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact) paragraphs.push(compact);
  }
  return paragraphs;
}

function compactPhrase(value) {
  let phrase = str(value)
    .replace(/\s+/g, " ")
    .replace(/\|/g, " ")
    .trim();
  const refIndex = phrase.indexOf("见待包装品");
  if (refIndex < 0) return phrase;
  const prefix = phrase.slice(0, refIndex);
  const starts = ["检验数据及计算过程", "测定结果与计算过程", "检验数据", "计算过程", "测定与计算"]
    .map((marker) => ({ marker, index: prefix.lastIndexOf(marker) }))
    .filter((candidate) => candidate.index >= 0);
  const start = starts.length ? Math.max(...starts.map((candidate) => candidate.index)) : refIndex;
  phrase = phrase.slice(start).replace(/^[：:，,、。；;\s]+/, "");
  const afterRef = phrase.slice(phrase.indexOf("见待包装品"));
  const stop = afterRef.search(/[。；;]/);
  if (stop >= 0) {
    const end = phrase.indexOf("见待包装品") + stop + 1;
    phrase = phrase.slice(0, end);
  }
  return phrase.trim();
}

function referencePhrasesFromText(text) {
  const phrases = [];
  const pattern = /(?:检验数据|测定结果|计算过程|测定与计算)[^。；;]{0,180}?见待包装品[^。；;]{0,180}?(?:项下|项)[。；;]?/g;
  for (const match of text.matchAll(pattern)) {
    const phrase = compactPhrase(match[0]);
    if (!phrase) continue;
    phrases.push({
      phrase,
      index: match.index ?? 0,
      target_sequence: (phrase.match(/见待包装品(?:（二）)?\s*(2\.\d+(?:\.\d+)*)/) ?? [])[1] ?? "",
    });
  }
  return phrases;
}

function docxFileForProduct(files, productName) {
  const normalizedName = normalize(productName);
  return files.find((file) => normalize(path.basename(file)).includes(normalizedName));
}

function findItemPositions(normalizedText, product) {
  const positions = [];
  let cursor = 0;
  for (const stageKey of stageOrder) {
    for (const test of arr(product.stages?.[stageKey]?.tests)) {
      const needles = [
        `${test.sequence}检测项目${test.name}`,
        `${test.sequence}${test.name}`,
      ].map(normalize).filter(Boolean);
      let found = -1;
      for (const needle of needles) {
        found = normalizedText.indexOf(needle, cursor);
        if (found >= 0) break;
      }
      if (found < 0) {
        positions.push({ product, stageKey, test, index: -1, missing: true });
        continue;
      }
      positions.push({ product, stageKey, test, index: found, missing: false });
      cursor = found + 1;
    }
  }
  return positions;
}

function itemForReference(normalizedIndex, positions) {
  const prior = positions
    .filter((item) => !item.missing && item.index <= normalizedIndex)
    .sort((a, b) => b.index - a.index)[0];
  return prior ?? null;
}

function normalizedIndexForRawIndex(rawText, rawIndex) {
  return normalize(rawText.slice(0, rawIndex)).length;
}

function uniqueBy(rows, keyFn) {
  const seen = new Set();
  const next = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(row);
  }
  return next;
}

function buildMarkdown(audit) {
  const lines = [
    "# DOCX Packaging Reference Audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "## Summary",
    "",
    `- Products: ${audit.summary.products}`,
    `- DOCX files matched: ${audit.summary.docx_files_matched}`,
    `- Unique DOCX packaging references: ${audit.summary.unique_references}`,
    `- Finished references: ${audit.summary.finished_references}`,
    `- Finished references not copied in JSON: ${audit.summary.finished_references_not_copied}`,
    `- Watched copy-key references not copied: ${audit.summary.watched_not_copied}`,
    `- Missing DOCX files: ${audit.summary.missing_docx_files}`,
    "",
    "## Finished References Not Copied",
    "",
    "| Product | Stage | Seq | Test | Key | Target | Phrase |",
    "|---|---|---:|---|---|---|---|",
    ...(audit.finished_references_not_copied.length
      ? audit.finished_references_not_copied.map((row) => `| ${row.product} | ${row.stage_label} | ${row.sequence} | ${row.test} | \`${row.key}\` | ${row.target_sequence || "-"} | ${row.phrase.replace(/\|/g, "\\|")} |`)
      : ["| - | - | - | - | - | - | - |"]),
    "",
    "## All Finished References",
    "",
    "| Product | Seq | Test | Key | Copied | Target | Phrase |",
    "|---|---:|---|---|---|---|---|",
    ...(audit.finished_references.length
      ? audit.finished_references.map((row) => `| ${row.product} | ${row.sequence} | ${row.test} | \`${row.key}\` | ${row.copy_from_packaging ? "yes" : "no"} | ${row.target_sequence || "-"} | ${row.phrase.replace(/\|/g, "\\|")} |`)
      : ["| - | - | - | - | - | - | - |"]),
    "",
    "## Position Misses",
    "",
    "| Product | Missing positioned items |",
    "|---|---:|",
    ...(audit.position_misses.length
      ? audit.position_misses.map((row) => `| ${row.product} | ${row.missing_count} |`)
      : ["| - | - |"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const productTests = JSON.parse(await fs.readFile(productTestsFile, "utf8"));
  const docxFiles = (await fs.readdir(rawDocxRoot))
    .filter((name) => name.endsWith(".docx") && !name.startsWith("~$"))
    .map((name) => path.join(rawDocxRoot, name))
    .sort();
  const allRows = [];
  const missingDocx = [];
  const positionMisses = [];

  for (const product of arr(productTests.products)) {
    const docx = docxFileForProduct(docxFiles, product.name);
    if (!docx) {
      missingDocx.push({ product: product.name, product_key: product.key });
      continue;
    }
    const text = paragraphTextsFromDocx(docx).join("\n");
    const normalizedText = normalize(text);
    const positions = findItemPositions(normalizedText, product);
    const missingPositions = positions.filter((item) => item.missing);
    if (missingPositions.length) {
      positionMisses.push({
        product: product.name,
        product_key: product.key,
        missing_count: missingPositions.length,
        items: missingPositions.map(({ stageKey, test }) => ({
          stage: stageKey,
          sequence: test.sequence,
          key: test.key,
          name: test.name,
        })),
      });
    }
    for (const ref of referencePhrasesFromText(text)) {
      const owner = itemForReference(normalizedIndexForRawIndex(text, ref.index), positions);
      if (!owner) continue;
      allRows.push({
        product: product.name,
        product_key: product.key,
        docx_file: path.basename(docx),
        stage: owner.stageKey,
        stage_label: owner.stageKey === "finished" ? "成品" : (owner.stageKey === "packaging" ? "待包装品" : "中间体"),
        sequence: owner.test.sequence,
        key: owner.test.key,
        test: owner.test.name,
        copy_from_packaging: owner.test.copy_from_packaging === true,
        copied_from: owner.test.copied_from ?? null,
        target_sequence: ref.target_sequence,
        phrase: ref.phrase,
      });
    }
  }

  const references = uniqueBy(
    allRows,
    (row) => `${row.product_key}/${row.stage}/${row.key}/${row.target_sequence}/${normalize(row.phrase)}`,
  ).sort((a, b) => (
    a.product_key.localeCompare(b.product_key)
    || stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)
    || a.sequence.localeCompare(b.sequence, "zh-Hans-CN", { numeric: true })
    || a.phrase.localeCompare(b.phrase)
  ));
  const finishedReferences = references.filter((row) => row.stage === "finished");
  const finishedNotCopied = finishedReferences.filter((row) => !row.copy_from_packaging);
  const watchedNotCopied = finishedNotCopied.filter((row) => watchedCopyKeys.has(row.key));
  const audit = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    purpose: "Read-only discovery audit. DOCX text is used to find finished-stage packaging references that canonical MD may have missed; findings still require manual DOCX/PDF/MD review before changing templates.",
    sources: {
      product_stage_tests: productTestsFile,
      raw_docx_root: rawDocxRoot,
    },
    summary: {
      products: arr(productTests.products).length,
      docx_files_matched: arr(productTests.products).length - missingDocx.length,
      unique_references: references.length,
      finished_references: finishedReferences.length,
      finished_references_not_copied: finishedNotCopied.length,
      watched_not_copied: watchedNotCopied.length,
      missing_docx_files: missingDocx.length,
    },
    finished_references_not_copied: finishedNotCopied,
    watched_not_copied: watchedNotCopied,
    finished_references: finishedReferences,
    all_references: references,
    missing_docx: missingDocx,
    position_misses: positionMisses,
  };

  await fs.writeFile(outJson, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await fs.writeFile(outMd, buildMarkdown(audit), "utf8");
  console.log(JSON.stringify(audit.summary, null, 2));
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
