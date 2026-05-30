#!/usr/bin/env node
/**
 * File Size Governance Check
 *
 * 规则（硬约束）：
 * - API route ≤ 120 行
 * - 组件 / hook ≤ 220 行
 * - service ≤ 260 行
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

const LIMITS = {
  api: { pattern: /^app\/api\/.*\/route\.ts$/, max: 120 },
  component: { pattern: /^app\/.*\.tsx$/, max: 220 },
  service: { pattern: /^server\/.*\.ts$/, max: 260 },
};

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

for (const { pattern, max } of Object.values(LIMITS)) {
  const files = walk(ROOT, pattern);
  for (const { path: filePath, rel } of files) {
    const lines = countLines(filePath);
    if (lines <= max) continue;

    console.error(`✗ ${rel}: ${lines} 行（超过 ${max} 行上限）`);
    warnings++;
  }
}

if (warnings > 0) {
  console.error(`\nFile size check failed: ${warnings} violation(s).`);
  console.error("请拆分超限文件，或先完成对应模块的治理重构。");
  process.exit(1);
} else {
  console.log("\n✓ File size check passed");
}
