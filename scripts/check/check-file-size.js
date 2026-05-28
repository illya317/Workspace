#!/usr/bin/env node
/**
 * File Size Governance Check
 *
 * 规则（软约束，先警告）：
 * - API route ≤ 120 行
 * - 组件 / hook ≤ 220 行
 * - service ≤ 260 行
 *
 * 超限文件登记到 .sizecheck-allowlist.json 可豁免警告。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ALLOWLIST_PATH = path.join(ROOT, "scripts/check/.sizecheck-allowlist.json");

const LIMITS = {
  api: { pattern: /^app\/api\/.*\/route\.ts$/, max: 120 },
  component: { pattern: /^app\/.*\.tsx$/, max: 220 },
  service: { pattern: /^server\/.*\.ts$/, max: 260 },
};

let allowlist = {};
if (fs.existsSync(ALLOWLIST_PATH)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf-8"));
  } catch {
    console.warn("⚠ .sizecheck-allowlist.json 解析失败，忽略白名单");
  }
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function walk(dir, pattern) {
  const results = [];
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (fs.statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "generated" || entry.startsWith(".")) continue;
      results.push(...walk(full, pattern));
    } else if (pattern.test(rel)) {
      results.push({ path: full, rel });
    }
  }
  return results;
}

let warnings = 0;
const newViolations = [];

for (const [name, { pattern, max }] of Object.entries(LIMITS)) {
  const files = walk(ROOT, pattern);
  for (const { path: filePath, rel } of files) {
    const lines = countLines(filePath);
    if (lines <= max) continue;

    const allowlisted = allowlist[rel];
    if (allowlisted && lines <= allowlisted) {
      // 白名单内且未超过白名单限额，静默通过
      continue;
    }

    if (allowlisted && lines > allowlisted) {
      console.warn(`⚠ ${rel}: ${lines} 行（超过白名单 ${allowlisted} 行，原上限 ${max}）`);
      warnings++;
      newViolations.push({ file: rel, lines, limit: max, reason: "超过白名单限额" });
    } else {
      console.warn(`⚠ ${rel}: ${lines} 行（超过 ${max} 行上限）`);
      warnings++;
      newViolations.push({ file: rel, lines, limit: max });
    }
  }
}

if (warnings > 0) {
  console.log(`\n⚠ File size check: ${warnings} warning(s) — 软约束，不阻断 CI`);
  console.log(`  白名单文件: ${ALLOWLIST_PATH}`);
  console.log(`  运行以下命令添加白名单条目：`);
  console.log(`  node scripts/check/check-file-size.js --update-allowlist`);
} else {
  console.log("\n✓ File size check passed");
}

// 支持 --update-allowlist 自动更新白名单
if (process.argv.includes("--update-allowlist") && newViolations.length > 0) {
  for (const v of newViolations) {
    if (!allowlist[v.file]) {
      allowlist[v.file] = v.lines;
      console.log(`  已添加白名单: ${v.file} = ${v.lines}`);
    }
  }
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(allowlist, null, 2) + "\n", "utf-8");
  console.log(`  已更新 ${ALLOWLIST_PATH}`);
}
