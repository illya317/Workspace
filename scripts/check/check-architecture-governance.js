#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

const ROLE_SKILL_NAMES = [
  "workspace-role-router",
  "workspace-coordinator",
  "workspace-feature",
  "workspace-architecture",
  "workspace-data",
  "workspace-operations",
  "workspace-hygiene",
  "workspace-review",
];

const REQUIRED_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/OWNERS.md",
  "docs/README.md",
  "docs/engineering/project-overview.md",
  "docs/generated/README.md",
  "docs/planning/README.md",
  "docs/product/README.md",
  "docs/reference/README.md",
  "docs/engineering/architecture-governance.md",
  ...ROLE_SKILL_NAMES.map((name) => `.agents/skills/${name}/SKILL.md`),
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
  "## Start Here",
  "## Document Map",
  "## Hard Red Lines",
];

const REQUIRED_AGENT_PHRASES = [
  "不要先扫全库",
  "读取 router 后的第一条角色声明更新",
  "docs/engineering/project-overview.md",
  "$workspace-role-router",
  "/workspace-role-router",
  ".agents/skills/workspace-role-router/SKILL.md",
  "docs/OWNERS.md",
];

const API_CAPABILITY_ROOTS = new Set([
  "agent",
  "auth",
  "internal",
  "integrations",
  "modules",
  "open",
  "settings",
]);

const ALLOWED_API_ROOTS = API_CAPABILITY_ROOTS;

function registeredModuleApiRoots() {
  const source = fs.readFileSync(rel("packages", "platform", "module-registry.ts"), "utf8");
  return new Set(
    Array.from(source.matchAll(/apiResourceGuards\(\s*["']\/api\/modules\/([^/"']+)/g))
      .map((match) => match[1])
  );
}

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

function hasRouteFile(dir) {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /^route\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      return true;
    }
    if (entry.isDirectory() && hasRouteFile(full)) {
      return true;
    }
  }
  return false;
}

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(rel(file))) {
    fail(`${file} is required for architecture governance`);
  } else {
    ok(`${file} exists`);
  }
}

for (const name of ROLE_SKILL_NAMES) {
  const skillPath = `.agents/skills/${name}/SKILL.md`;
  if (fs.existsSync(rel(skillPath))) {
    const source = readText(skillPath);
    if (!source.startsWith(`---\nname: ${name}\n`)) {
      fail(`${skillPath} must start with matching name frontmatter`);
    }
    if (!/^description: \S.+$/m.test(source)) {
      fail(`${skillPath} must declare a non-empty description`);
    }
    if (!source.includes("读取 router 后的第一条角色声明更新")) {
      fail(`${skillPath} must confirm the role declaration after routing`);
    }
  }

  const claudePath = rel(".claude", "skills", name);
  const canonicalPath = rel(".agents", "skills", name);
  if (!fs.existsSync(claudePath)) {
    fail(`.claude/skills/${name} symlink is required`);
  } else if (!fs.lstatSync(claudePath).isSymbolicLink()) {
    fail(`.claude/skills/${name} must be a symlink`);
  } else if (fs.realpathSync(claudePath) !== fs.realpathSync(canonicalPath)) {
    fail(`.claude/skills/${name} must target .agents/skills/${name}`);
  }
}

if (fs.existsSync(rel("CLAUDE.md")) && readText("CLAUDE.md").trim() !== "@AGENTS.md") {
  fail("CLAUDE.md must import the shared AGENTS.md entry");
}

if (fs.existsSync(rel("README.md"))) {
  const readme = readText("README.md");
  for (const section of REQUIRED_README_SECTIONS) {
    if (!readme.includes(section)) fail(`README.md missing section: ${section}`);
  }
}

if (fs.existsSync(rel("AGENTS.md"))) {
  const agentRules = readText("AGENTS.md");
  for (const section of REQUIRED_AGENT_SECTIONS) {
    if (!agentRules.includes(section)) fail(`AGENTS.md missing section: ${section}`);
  }
  for (const phrase of REQUIRED_AGENT_PHRASES) {
    if (!agentRules.includes(phrase)) fail(`AGENTS.md missing required entry: ${phrase}`);
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
  const registeredModuleApiRootsSet = registeredModuleApiRoots();
  for (const entry of fs.readdirSync(apiDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (!hasRouteFile(path.join(apiDir, entry.name))) continue;
    if (!ALLOWED_API_ROOTS.has(entry.name)) {
      fail(
        `app/api/${entry.name} is not registered. API root must be one of auth, agent, settings, modules, integrations, internal, open, or an explicit compatibility baseline.`
      );
    }
  }

  const modulesDir = path.join(apiDir, "modules");
  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (!hasRouteFile(path.join(modulesDir, entry.name))) continue;
      if (!registeredModuleApiRootsSet.has(entry.name)) {
        fail(`app/api/modules/${entry.name} is not registered in module-registry apiGuards.`);
      }
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

for (const packageEntry of fs.readdirSync(rel("packages"), { withFileTypes: true })) {
  if (!packageEntry.isDirectory()) continue;
  const uiRoot = rel("packages", packageEntry.name, "ui");
  for (const file of walk(uiRoot)) {
    if (![".ts", ".tsx", ".js", ".jsx"].includes(path.extname(file))) continue;
    const relativePath = path.relative(ROOT, file);
    const source = readText(relativePath);
    if (/from\s+["']@workspace\/[^"']+\/server(?:\/[^"']*)?["']/.test(source)
      || /from\s+["'](?:\.\.\/)+server(?:\/[^"']*)?["']/.test(source)
      || /from\s+["']@prisma\/client["']/.test(source)) {
      fail(`${relativePath} must consume DTO/types or API contracts; presentation UI cannot import server or Prisma modules.`);
    }
  }
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
