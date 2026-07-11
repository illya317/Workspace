#!/usr/bin/env node

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACE_DIR = path.resolve(ROOT, "..", ".workspace");
const CACHE_DIR = path.join(WORKSPACE_DIR, "cache/reference/education");
const OUT_DIR = path.join(WORKSPACE_DIR, "data/reference/education");

const SOURCES = {
  institutionsPage: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202506/t20250627_1195683.html",
  ordinaryInstitutionsXls: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202506/W020250729615142156867.xls",
  adultInstitutionsXls: "https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202506/W020250627301230143042.xls",
  majorsPage: "https://www.moe.gov.cn/srcsite/A08/moe_1034/s4930/202504/t20250422_1188239.html",
  undergraduateMajorsPdf: "https://www.moe.gov.cn/srcsite/A08/moe_1034/s4930/202504/W020250422312780837078.pdf",
  vocationalMajorsPage: "https://www.moe.gov.cn/s78/A07/zcs_ztzl/2017_zt06/17zt06_bznr/zhijiao/",
  vocationalMajorsDocx: "https://www.moe.gov.cn/s78/A07/zcs_ztzl/2017_zt06/17zt06_bznr/zhijiao/202601/P020260105414713053015.docx",
  qsWorldRankingsPage: "https://www.topuniversities.com/world-university-rankings",
  qsWorldRankingsEndpoint: "https://www.topuniversities.com/rankings/endpoint?nid=4153156&page=0&items_per_page=2000&tab=&region=&countries=&cities=&search=&star=&sort_by=rank&order_by=asc&program_type=&scholarship=&fee=&english_score=&academic_score=&mix_student=&loggedincache=&study_level=&subjects=",
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function download(url, target) {
  if (fs.existsSync(target)) return;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
}

function readSheetRows(file) {
  const workbook = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    raw: false,
    defval: "",
  });
}

function parseInstitutions(file, kind) {
  const rows = readSheetRows(file);
  let province = "";
  const records = [];

  for (const row of rows.slice(3)) {
    const first = String(row[0] || "").trim();
    if (!first) continue;

    const provinceMatch = first.match(/^(.+?)[（(]\d+所[）)]$/);
    if (provinceMatch) {
      province = provinceMatch[1];
      continue;
    }
    if (!/^\d+$/.test(first)) continue;

    if (kind === "ordinary") {
      records.push({
        id: String(row[2] || "").trim(),
        name: String(row[1] || "").trim(),
        kind,
        level: String(row[5] || "").trim(),
        province,
        city: String(row[4] || "").trim(),
        authority: String(row[3] || "").trim(),
        note: String(row[6] || "").trim(),
        sourceNo: Number(first),
      });
      continue;
    }

    records.push({
      id: String(row[2] || "").trim(),
      name: String(row[1] || "").trim(),
      kind,
      level: "成人高等学校",
      province,
      city: "",
      authority: String(row[3] || "").trim(),
      note: String(row[4] || "").trim(),
      sourceNo: Number(first),
    });
  }

  return records;
}

function convertPdfToText(pdfFile, textFile) {
  if (fs.existsSync(textFile)) return;
  execFileSync("pdftotext", ["-layout", pdfFile, textFile], { stdio: "inherit" });
}

function parseUndergraduateMajors(textFile) {
  const text = fs.readFileSync(textFile, "utf8");
  let category = null;
  let majorClass = null;
  const records = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let match = line.match(/^(\d{2})\s+学科门类：(.+)$/);
    if (match) {
      category = { code: match[1], name: match[2].trim() };
      majorClass = null;
      continue;
    }

    match = line.match(/^(\d{4})\s+(.+类)$/);
    if (match && category) {
      majorClass = { code: match[1], name: match[2].trim() };
      continue;
    }

    match = line.match(/^(\d{6,7}[TK]*)\s+(.+)$/);
    if (!match || !category || !majorClass) continue;

    const code = match[1];
    records.push({
      code,
      name: match[2].trim(),
      categoryCode: category.code,
      categoryName: category.name,
      classCode: majorClass.code,
      className: majorClass.name,
      isSpecial: code.includes("T"),
      isStateControlled: code.includes("K"),
    });
  }

  return records;
}

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseDocxTables(docxFile) {
  const xml = execFileSync("unzip", ["-p", docxFile, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return [...xml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)].map((tableMatch) =>
    [...tableMatch[0].matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)].map((cellMatch) =>
        [...cellMatch[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
          .map((textMatch) => decodeXmlText(textMatch[1]))
          .join("")
          .trim(),
      ),
    ),
  );
}

function parseVocationalMajors(docxFile) {
  const levels = [
    { code: "secondary_vocational", name: "中等职业教育专业" },
    { code: "higher_vocational_associate", name: "高等职业教育专科专业" },
    { code: "higher_vocational_bachelor", name: "高等职业教育本科专业" },
  ];

  return parseDocxTables(docxFile).flatMap((rows, tableIndex) => {
    const level = levels[tableIndex];
    if (!level) return [];

    let category = null;
    let majorClass = null;
    const records = [];

    for (const row of rows) {
      const first = String(row[0] || "").trim();
      if (!first) continue;

      let match = first.match(/^(\d{2})(.+大类)$/);
      if (row.length === 1 && match) {
        category = { code: match[1], name: match[2].trim() };
        majorClass = null;
        continue;
      }

      match = first.match(/^(\d{4})(.+类)$/);
      if (row.length === 1 && match) {
        majorClass = { code: match[1], name: match[2].trim() };
        continue;
      }

      if (!/^\d+$/.test(first) || !row[1] || !row[2] || !category || !majorClass) continue;
      records.push({
        code: String(row[1]).trim(),
        name: String(row[2]).trim(),
        educationLevel: level.code,
        educationLevelName: level.name,
        categoryCode: category.code,
        categoryName: category.name,
        classCode: majorClass.code,
        className: majorClass.name,
      });
    }

    return records;
  });
}

async function fetchQsWorldRankings() {
  const response = await fetch(SOURCES.qsWorldRankingsEndpoint, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch QS rankings: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return (payload.score_nodes || []).map((item) => ({
    qsScoreNodeId: String(item.score_nid || ""),
    qsNodeId: String(item.nid || ""),
    qsCoreId: String(item.core_id || ""),
    name: String(item.title || "").trim(),
    rank: Number(item.rank),
    rankDisplay: String(item.rank_display || "").trim(),
    overallScore: String(item.overall_score || "").trim(),
    region: String(item.region || "").trim(),
    country: String(item.country || "").trim(),
    city: String(item.city || "").trim(),
    path: item.path ? `https://www.topuniversities.com${item.path}` : "",
  }));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function assertCount(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} count mismatch: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir(OUT_DIR);

  const ordinaryXls = path.join(CACHE_DIR, "moe-ordinary-heis-2025.xls");
  const adultXls = path.join(CACHE_DIR, "moe-adult-heis-2025.xls");
  const majorsPdf = path.join(CACHE_DIR, "moe-undergraduate-majors-2025.pdf");
  const majorsText = path.join(CACHE_DIR, "moe-undergraduate-majors-2025.txt");
  const vocationalDocx = path.join(CACHE_DIR, "moe-vocational-majors-2025-12.docx");

  await download(SOURCES.ordinaryInstitutionsXls, ordinaryXls);
  await download(SOURCES.adultInstitutionsXls, adultXls);
  await download(SOURCES.undergraduateMajorsPdf, majorsPdf);
  await download(SOURCES.vocationalMajorsDocx, vocationalDocx);
  convertPdfToText(majorsPdf, majorsText);

  const ordinary = parseInstitutions(ordinaryXls, "ordinary");
  const adult = parseInstitutions(adultXls, "adult");
  const majors = parseUndergraduateMajors(majorsText);
  const vocationalMajors = parseVocationalMajors(vocationalDocx);
  const qsRankings = await fetchQsWorldRankings();

  assertCount("ordinary institution", ordinary.length, 2919);
  assertCount("adult institution", adult.length, 248);
  assertCount("undergraduate major", majors.length, 845);
  assertCount("vocational major", vocationalMajors.length, 1491);
  assertCount("QS 2027 world ranking", qsRankings.length, 1504);

  writeJson("china-higher-education-institutions-2025.json", {
    metadata: {
      name: "China higher education institutions",
      version: "2025-06-20",
      source: "Ministry of Education of the People's Republic of China",
      sourceUrl: SOURCES.institutionsPage,
      ordinaryCount: ordinary.length,
      adultCount: adult.length,
      totalCount: ordinary.length + adult.length,
    },
    records: [...ordinary, ...adult],
  });

  writeJson("china-undergraduate-majors-2025.json", {
    metadata: {
      name: "China undergraduate major catalog",
      version: "2025",
      source: "Ministry of Education of the People's Republic of China",
      sourceUrl: SOURCES.majorsPage,
      catalogPdfUrl: SOURCES.undergraduateMajorsPdf,
      categoryCount: new Set(majors.map((item) => item.categoryCode)).size,
      classCount: new Set(majors.map((item) => item.classCode)).size,
      majorCount: majors.length,
    },
    records: majors,
  });

  writeJson("china-vocational-majors-2025-12.json", {
    metadata: {
      name: "China vocational education major catalog",
      version: "2025-12",
      source: "Ministry of Education of the People's Republic of China",
      sourceUrl: SOURCES.vocationalMajorsPage,
      catalogDocxUrl: SOURCES.vocationalMajorsDocx,
      secondaryVocationalCount: vocationalMajors.filter((item) => item.educationLevel === "secondary_vocational").length,
      higherVocationalAssociateCount: vocationalMajors.filter((item) => item.educationLevel === "higher_vocational_associate").length,
      higherVocationalBachelorCount: vocationalMajors.filter((item) => item.educationLevel === "higher_vocational_bachelor").length,
      totalCount: vocationalMajors.length,
    },
    records: vocationalMajors,
  });

  writeJson("qs-world-university-rankings-2027.json", {
    metadata: {
      name: "QS World University Rankings",
      version: "2027",
      source: "QS Quacquarelli Symonds",
      sourceUrl: SOURCES.qsWorldRankingsPage,
      endpointUrl: SOURCES.qsWorldRankingsEndpoint,
      publishedAt: "2026-06-18",
      rankingCount: qsRankings.length,
      usageNote: "Public ranking endpoint normalized to minimal factual fields. Do not redistribute as a substitute for the QS commercial dataset.",
    },
    records: qsRankings,
  });

  console.log(`Wrote ${ordinary.length + adult.length} institutions, ${majors.length} undergraduate majors, ${vocationalMajors.length} vocational majors, and ${qsRankings.length} QS rankings.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
