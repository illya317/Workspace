#!/usr/bin/env node
/**
 * Architecture Documentation Check
 *
 * 规则：app/ 下的页面域必须在实际 route shell 位置提供 ARCHITECTURE.md
 */

const fs = require("fs");
const path = require("path");

const APP_DIR = path.resolve(__dirname, "../../app");

const REQUIRED_ARCHITECTURE_FILES = [
  "app/(modules)/administration/contracts/ARCHITECTURE.md",
  "app/(modules)/external/ARCHITECTURE.md",
  "app/(modules)/finance/ARCHITECTURE.md",
  "app/(modules)/finance/budget/ARCHITECTURE.md",
  "app/(modules)/finance/cost/ARCHITECTURE.md",
  "app/(modules)/hr/ARCHITECTURE.md",
  "app/(modules)/library/ARCHITECTURE.md",
  "app/(modules)/production/ARCHITECTURE.md",
  "app/(modules)/work/ARCHITECTURE.md",
  "app/(system)/portal/ARCHITECTURE.md",
  "app/(system)/settings/ARCHITECTURE.md",
  "app/(system)/settings/admin/ARCHITECTURE.md",
];

// 可选/辅助目录，不需要 ARCHITECTURE.md
const OPTIONAL_DIRS = [
  "api",
  "(auth)",
  "(docs)",
  "(modules)",
  "(system)",
  "components",
  "hooks",
  "lib",
];

let errors = 0;

for (const rel of REQUIRED_ARCHITECTURE_FILES) {
  const archFile = path.resolve(__dirname, "../..", rel);
  if (!fs.existsSync(archFile)) {
    console.error(`❌ ${rel} 缺失`);
    errors++;
  } else {
    console.log(`✓ ${rel}`);
  }
}

// 检查是否有新增目录但没有 ARCHITECTURE.md
const entries = fs.readdirSync(APP_DIR);
for (const entry of entries) {
  const full = path.join(APP_DIR, entry);
  if (!fs.statSync(full).isDirectory()) continue;
  if (OPTIONAL_DIRS.includes(entry)) continue;
  if (entry.startsWith(".") || entry.startsWith("_")) continue;

  // 未知目录，给警告
  console.warn(`⚠ app/${entry}/ 不在已知业务模块列表中，请确认是否需要 ARCHITECTURE.md`);
}

if (errors > 0) {
  console.error(`\nArchitecture docs check failed: ${errors} missing ARCHITECTURE.md`);
  process.exit(1);
} else {
  console.log("\n✓ Architecture docs check passed");
}
