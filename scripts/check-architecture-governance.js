#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const REQUIRED_FILES = [
  "README.md",
  "CLAUDE.md",
  "docs/architecture-governance.md",
];

const REQUIRED_README_SECTIONS = [
  "## 当前业务模块",
  "## 横向平台能力",
  "## 目录契约",
  "## 从数据到页面的标准流程",
  "## 数据原则",
  "## 权限原则",
];

const REQUIRED_AGENT_SECTIONS = [
  "## 项目地图",
  "## 新模块接入流程",
  "## Prisma Schema 规则",
  "## API 权限规则",
  "## 硬约束",
];

const ALLOWED_API_ROOTS = new Set([
  "admin",
  "auth",
  "contracts",
  "departments",
  "employee-positions",
  "employee-projects",
  "employees",
  "employments",
  "finance",
  "hr",
  "inventory",
  "my-api-key",
  "my-targets",
  "position-descriptions",
  "positions",
  "projects",
  "reports",
  "user",
  "week-info",
  "works",
]);

const LOCAL_ONLY_TRACKED = [
  ".DS_Store",
  "task_plan.md",
  "findings.md",
  "progress.md",
  ".env",
  "prisma/dev.db",
];

let failed = false;

function rel(...parts) {
  return path.join(ROOT, ...parts);
}

function fail(message) {
  failed = true;
  console.error(`✗ ${message}`);
}

function warn(message) {
  console.warn(`! ${message}`);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function readText(relativePath) {
  return fs.readFileSync(rel(relativePath), "utf8");
}

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(rel(file))) {
    fail(`${file} is required for architecture governance`);
  } else {
    ok(`${file} exists`);
  }
}

if (fs.existsSync(rel("README.md"))) {
  const readme = readText("README.md");
  for (const section of REQUIRED_README_SECTIONS) {
    if (!readme.includes(section)) fail(`README.md missing section: ${section}`);
  }
}

if (fs.existsSync(rel("CLAUDE.md"))) {
  const agentRules = readText("CLAUDE.md");
  for (const section of REQUIRED_AGENT_SECTIONS) {
    if (!agentRules.includes(section)) fail(`CLAUDE.md missing section: ${section}`);
  }
}

try {
  const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  for (const file of LOCAL_ONLY_TRACKED) {
    if (tracked.includes(file)) {
      fail(`${file} must not be tracked`);
    }
  }
} catch {
  warn("git ls-files unavailable; skipped tracked local-file check");
}

const apiDir = rel("app", "api");
if (fs.existsSync(apiDir)) {
  for (const entry of fs.readdirSync(apiDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (!ALLOWED_API_ROOTS.has(entry.name)) {
      fail(
        `app/api/${entry.name} is not registered. Add the domain to README.md, CLAUDE.md, and scripts/check-architecture-governance.js.`
      );
    }
  }
}

const lineBudgets = [
  { dir: "app", exts: [".ts", ".tsx"], warnAt: 300 },
  { dir: "server", exts: [".ts"], warnAt: 300 },
  { dir: "lib", exts: [".ts"], warnAt: 300 },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const budget of lineBudgets) {
  const files = walk(rel(budget.dir));
  for (const file of files) {
    if (!budget.exts.includes(path.extname(file))) continue;
    const lines = readText(path.relative(ROOT, file)).split("\n").length;
    if (lines > budget.warnAt) {
      warn(`${path.relative(ROOT, file)} has ${lines} lines; split before adding more logic`);
    }
  }
}

if (failed) {
  console.error("\nArchitecture governance check failed.");
  process.exit(1);
}

console.log("\nArchitecture governance check passed.");
