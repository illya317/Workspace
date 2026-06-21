#!/usr/bin/env node
/**
 * Architecture Documentation Check
 *
 * 规则：app/ 下的业务模块目录必须有 ARCHITECTURE.md
 */

const fs = require("fs");
const path = require("path");

const APP_DIR = path.resolve(__dirname, "../../app");

// 需要 ARCHITECTURE.md 的业务模块
const REQUIRED_DOMAINS = [
  "admin",
  "contracts",
  "finance",
  "hr",
  "history",
  "inventory",
  "portal",
  "production",
  "reports",
  "settings",
  "work",
  "works",
];

// 可选/辅助目录，不需要 ARCHITECTURE.md
const OPTIONAL_DIRS = [
  "administration",
  "api",
  "api-guide",
  "components",
  "docs",
  "external",
  "hooks",
  "lib",
  "library",
  "login",
];

let errors = 0;

for (const domain of REQUIRED_DOMAINS) {
  const domainDir = path.join(APP_DIR, domain);
  const archFile = path.join(domainDir, "ARCHITECTURE.md");

  if (!fs.existsSync(archFile)) {
    console.error(`❌ app/${domain}/ 缺少 ARCHITECTURE.md`);
    errors++;
  } else {
    console.log(`✓ app/${domain}/ARCHITECTURE.md`);
  }
}

// 检查是否有新增目录但没有 ARCHITECTURE.md
const entries = fs.readdirSync(APP_DIR);
for (const entry of entries) {
  const full = path.join(APP_DIR, entry);
  if (!fs.statSync(full).isDirectory()) continue;
  if (OPTIONAL_DIRS.includes(entry)) continue;
  if (REQUIRED_DOMAINS.includes(entry)) continue;
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
