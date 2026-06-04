#!/usr/bin/env node
/**
 * company:check — 自动扫描代码库中的硬编码公司专有事实。
 *
 * 检测项：
 * 1. 具体公司名（丰华生物、丰华制药 等）
 * 2. 旧 helper 导入（@/lib/company）
 * 3. 固定公司映射对象（COMPANIES = { "01": "..." } 等模式）
 *
 * 白名单：
 * - prisma/seed-data/*  （seed 输入数据）
 * - scripts/import/*     （历史数据导入脚本）
 * - scripts/check/*      （检查脚本自身）
 * - docs/*               （文档说明）
 * - *.test.ts, *.spec.ts （测试文件）
 * - *.md                 （markdown 文档）
 * - package*.json        （依赖配置）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

// ─── Patterns ──────────────────────────────────────────────

/** 具体公司名（禁止出现在业务代码中） */
const COMPANY_NAMES = [
  "丰华生物", "丰华制药", "丰华天力通", "丰华悦通",
  "上海天力通", "上海悦通", "加拿大",
];

/** 旧 helper 导入路径 */
const OLD_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/company["']/,
  /from\s+["']\.\.\/lib\/company["']/,
  /from\s+["']\.\.\/\.\.\/lib\/company["']/,
  /from\s+["']lib\/company["']/,
];

/** 固定公司映射对象（如 const COMPANIES = { "01": "丰华生物" }） */
const FIXED_MAP_PATTERNS = [
  /const\s+\w*[Cc][Oo][Mm][Pp][Aa][Nn][Yy]\w*\s*[:=]\s*\{\s*["']\d+["']\s*:/,
  /const\s+\w*[Cc][Oo][Mm][Pp][Aa][Nn][Yy]\w*\s*[:=]\s*\{[^}]*["']\d+["']\s*:\s*["']丰华/,
];

// ─── Whitelist ─────────────────────────────────────────────

const WHITELIST_DIRS = [
  "prisma/seed-data",
  "scripts",
  "docs",
  "generated",
  "node_modules",
  ".next",
  ".git",
  "data",
];

const WHITELIST_FILES = [
  /package.*\.json$/,
  /\.md$/,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.lock$/,
  /\.db$/,
];

// ─── Helpers ───────────────────────────────────────────────

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (WHITELIST_DIRS.some((d) => rel.startsWith(d + "/") || rel === d)) return true;
  if (WHITELIST_FILES.some((re) => re.test(path.basename(filePath)))) return true;
  return false;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldSkip(full)) continue;
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function findViolations(filePath, content) {
  const lines = content.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Skip pure comment lines (//, /*, *, JSDoc, */)
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("*/")) continue;

    // Remove inline comments
    const codePart = line.replace(/\/\/.*/, "").replace(/\/\*[\s\S]*?\*\//, "");

    // 1) Company names
    for (const name of COMPANY_NAMES) {
      if (codePart.includes(name)) {
        violations.push({ line: lineNo, text: line.trim(), type: `公司名: ${name}` });
        break;
      }
    }

    // 2) Old imports
    for (const re of OLD_IMPORT_PATTERNS) {
      if (re.test(line)) {
        violations.push({ line: lineNo, text: line.trim(), type: "旧 helper 导入" });
        break;
      }
    }

    // 3) Fixed company maps
    for (const re of FIXED_MAP_PATTERNS) {
      if (re.test(codePart)) {
        violations.push({ line: lineNo, text: line.trim(), type: "硬编码公司映射" });
        break;
      }
    }
  }

  return violations;
}

// ─── Main ──────────────────────────────────────────────────

let totalFiles = 0;
let violationFiles = 0;
const allViolations = [];

for (const filePath of walk(ROOT)) {
  // Only scan source files
  const ext = path.extname(filePath);
  if (![".ts", ".tsx", ".js", ".jsx", ".json"].includes(ext)) continue;

  totalFiles++;
  const content = fs.readFileSync(filePath, "utf8");
  const violations = findViolations(filePath, content);
  if (violations.length > 0) {
    violationFiles++;
    const rel = path.relative(ROOT, filePath);
    allViolations.push({ file: rel, violations });
    console.log(`\n❌ ${rel}`);
    for (const v of violations) {
      console.log(`   ${v.type} @ L${v.line}: ${v.text.slice(0, 80)}`);
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(`扫描文件: ${totalFiles}, 违规文件: ${violationFiles}`);

if (allViolations.length > 0) {
  console.log(`\n❌ company:check 失败 — 发现 ${allViolations.reduce((s, f) => s + f.violations.length, 0)} 处硬编码`);
  console.log("\n白名单目录: prisma/seed-data, scripts/import, scripts/check, docs, *.test.ts, *.md");
  process.exit(1);
} else {
  console.log("✅ company:check 通过 — 未发现硬编码公司专有事实");
  process.exit(0);
}
