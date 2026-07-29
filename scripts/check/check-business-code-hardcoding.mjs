#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_FILE = path.join(ROOT, "scripts/check/baselines/business-code-hardcoding.json");
const ROOTS = ["app", "packages", "scripts"];
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const ALLOWED_PREFIXES = [
  "packages/platform/business-code-config.ts",
  "packages/platform/business-code-management.ts",
  "packages/platform/business-code-registry.ts",
  "packages/platform/business-code-rule.ts",
  "packages/platform/business-code-template.ts",
  "packages/platform/server/business-code-sequence.ts",
  "packages/platform/server/business-codes/",
  "packages/settings/ui/admin/tabs/BusinessCode",
  "scripts/check/",
];

function normalizedPath(value) {
  return value.replaceAll(path.sep, "/");
}

export function shouldScanFile(relativeFile) {
  if (!EXTENSIONS.has(path.extname(relativeFile))) return false;
  if (relativeFile.includes("/node_modules/") || relativeFile.includes("/generated/")) return false;
  if (relativeFile.includes("/migrations/") || relativeFile.includes("/__tests__/")) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativeFile)) return false;
  return !ALLOWED_PREFIXES.some((prefix) => relativeFile.startsWith(prefix));
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

const CODE_CONTEXT = /(?:assetCategoryCode|categoryCode|employeeId|supplierCode|customerCode|departmentCode|positionCode|projectCode|prefix|suffix|编码|编号)/i;
const CODE_LITERAL = /["'`](?:FUN|GW|CUS|SUP)["'`]/;
const BUSINESS_COMPOSITE_LITERAL = /["'`](?:FA|IA|PA|LT)-[A-Z0-9]+(?:-[A-Z0-9]+)*["'`]/;
const COMPOSITE_LITERAL = /["'`][A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+["'`]/;
const CODE_TEMPLATE_PREFIX = /["'`](?:FUN|GW|CUS|SUP|FA|IA|PA|LT|TEMP)-\$\{/;
const CODE_CONSTRUCTION = /(?:padStart\s*\(|\.join\s*\(|`[^`]*\$\{[^}]+\}[^`]*`)/;
const GENERATED_CODE_ASSIGNMENT = /(?:assetCode|projectCode|departmentCode|positionCode|employeeId|supplierCode|customerCode|\bcode)\s*[:=]\s*(?:`[^`]*\$\{|String\([^;]*padStart|\[[^;]*\.join\()/i;
const GENERATOR_PATH = /(?:department-code|position-code|project-numbering|voucher-numbering|slot-numbering|project-normalization|group-accounts\/sync|current-period-(?:fixed|other)-assets|external-party-master-source|recode-work-project-codes)/i;

export function classifyBusinessCodeLine(line, relativeFile = "") {
  const source = line.trim();
  if (!source || source.startsWith("//") || source.startsWith("*") || source.startsWith("/*")) return null;
  if (BUSINESS_COMPOSITE_LITERAL.test(source)) return "coded-literal";
  if (CODE_LITERAL.test(source) && CODE_CONTEXT.test(source)) return "coded-literal";
  if (COMPOSITE_LITERAL.test(source) && CODE_CONTEXT.test(source)) return "coded-literal";
  if (CODE_TEMPLATE_PREFIX.test(source)) return "code-construction";
  if (GENERATED_CODE_ASSIGNMENT.test(source)) return "code-construction";
  if (
    CODE_CONSTRUCTION.test(source)
    && GENERATOR_PATH.test(relativeFile)
    && (CODE_CONTEXT.test(source) || /numbering/i.test(relativeFile))
    && /(?:return|=>|=|:)/.test(source)
  ) {
    return "code-construction";
  }
  return null;
}

function fingerprint(file, line) {
  return createHash("sha256").update(`${file}\0${line.trim().replace(/\s+/g, " ")}`).digest("hex").slice(0, 16);
}

export function scanBusinessCodeHardcoding(root = ROOT) {
  const findings = [];
  for (const rootName of ROOTS) {
    const directory = path.join(root, rootName);
    if (!fs.existsSync(directory)) continue;
    for (const fullPath of walk(directory)) {
      const file = normalizedPath(path.relative(root, fullPath));
      if (!shouldScanFile(file)) continue;
      const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const kind = classifyBusinessCodeLine(line, file);
        if (!kind) return;
        findings.push({
          file,
          fingerprint: fingerprint(file, line),
          kind,
          line: index + 1,
          snippet: line.trim().replace(/\s+/g, " ").slice(0, 180),
        });
      });
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function findingKey(finding) {
  return `${finding.file}:${finding.fingerprint}`;
}

function run() {
  const findings = scanBusinessCodeHardcoding();
  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ version: 1, entries: findings }, null, 2)}\n`);
    console.log(`Business-code hardcoding baseline written (${findings.length} entries).`);
    return;
  }
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error("Business-code hardcoding baseline is missing. Run npm run business-code:baseline after review.");
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const expected = new Map(baseline.entries.map((entry) => [findingKey(entry), entry]));
  const actual = new Map(findings.map((entry) => [findingKey(entry), entry]));
  const added = findings.filter((entry) => !expected.has(findingKey(entry)));
  const stale = baseline.entries.filter((entry) => !actual.has(findingKey(entry)));
  if (added.length === 0 && stale.length === 0) {
    console.log(`Business-code hardcoding gate passed (${findings.length} baselined entries).`);
    return;
  }
  if (added.length > 0) {
    console.error("New business-code hardcoding is not allowed; use @workspace/platform/business-code-rule:");
    for (const entry of added) console.error(`- ${entry.file}:${entry.line} ${entry.snippet}`);
  }
  if (stale.length > 0) {
    console.error("Business-code hardcoding baseline contains resolved entries; shrink it with npm run business-code:baseline:");
    for (const entry of stale) console.error(`- ${entry.file} ${entry.snippet}`);
  }
  process.exitCode = 1;
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) run();
