#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const CHECK_ROOTS = ["app", "packages", "prisma/models"].map((root) => path.join(WORKSPACE_ROOT, root));
const CHECK_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx", ".prisma"]);

const SKIP_DIR_PARTS = new Set([
  ".git",
  ".next",
  ".cache",
  "node_modules",
  "generated",
]);

const ACCOUNT_IDENTITY_PREFIXES = [
  "app/api/auth/",
  "app/api/settings/account/",
  "app/api/settings/admin/users/",
  "packages/platform/server/auth/",
  "packages/platform/server/account.ts",
  "packages/platform/server/auth-token.ts",
  "packages/platform/server/personal-api-key.ts",
  "packages/platform/server/rbac/user-list.ts",
  "packages/platform/server/users.ts",
  "packages/platform/types/session.ts",
  "packages/platform/ui/UserMenu.tsx",
  "packages/platform/ui/PortalClient.tsx",
  "packages/settings/ui/settings/",
];

const BUSINESS_IDENTITY_PREFIXES = [
  "app/(modules)/",
  "app/api/modules/",
  "packages/finance/",
  "packages/hr/",
  "packages/production/",
  "packages/work/",
  "packages/platform/server/audit-log.ts",
  "packages/platform/server/business-space-natural-users.ts",
  "packages/platform/server/business-space-permissions.ts",
  "packages/docs/server/permissions.ts",
  "packages/platform/server/fk-search.ts",
  "packages/platform/server/history.ts",
  "packages/platform/server/notifications.ts",
  "packages/platform/server/space-registry.ts",
];

const RULES = [
  {
    id: "nickname-field-reference",
    test: (line) => /\bnickname\b/.test(line),
    message: "Nickname has been removed; use username for account identity or Employee.name for business identity.",
  },
  {
    id: "mutable-account-name-fallback",
    test: (line) => /employee|empByUser/.test(line) && /\bnickname\b/.test(line) && /(\|\||\?\?)/.test(line),
    message: "Business names must not fall back from employee identity to mutable account nickname.",
  },
  {
    id: "account-username-as-business-name",
    test: (line) => {
      if (/\bfunction\b|\btype\b|\binterface\b/.test(line)) return false;
      if (!/\b(name|label|summary|displayName|editorName|reviewerName|inspectorName|submitterName|userName)\s*[:=]/.test(line)) return false;
      if (!/\busername\b/.test(line)) return false;
      return /(\|\||\?\?)/.test(line);
    },
    message: "Business display names must not fall back to account username.",
  },
  {
    id: "account-name-as-business-name",
    test: (line) => {
      if (/\bfunction\b|\btype\b|\binterface\b/.test(line)) return false;
      if (!/\b(name|label|summary|displayName|editorName|reviewerName|inspectorName|submitterName|userName)\s*[:=]/.test(line)) return false;
      if (!/\bnickname\b/.test(line)) return false;
      return /(\|\||\?\?)/.test(line) || /\b(name|label|summary|displayName|editorName|reviewerName|inspectorName|submitterName|userName)\s*[:=]\s*[^,;]*\bnickname\b/.test(line);
    },
    message: "Business display names must come from stable employee identity, not nickname.",
  },
  {
    id: "account-id-as-business-name",
    test: (line) => /用户[#\s]*\$\{[^}]+\}|`[^`]*用户[#\s]*\$\{[^}]+\}[^`]*`/.test(line),
    message: "Business display names must not use user id fallback strings.",
  },
  {
    id: "user-fk-label-from-nickname",
    test: (line) => /\blabelField\s*:\s*["']nickname["']/.test(line),
    message: "User FK labels must not use nickname as the business reference label.",
  },
  {
    id: "signature-helper-fallback",
    test: (line) => /\bgetUserEmployeeSignatureName\s*\(\s*[^),\n]+,\s*[^)]/.test(line),
    message: "Signature helper must not accept nickname/userId fallbacks.",
  },
];

function toRel(fullPath) {
  return path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, "/");
}

function isCheckableFile(fullPath) {
  return CHECK_EXTENSIONS.has(path.extname(fullPath));
}

function shouldSkipPath(fullPath) {
  const rel = toRel(fullPath);
  if (rel.split("/").some((part) => SKIP_DIR_PARTS.has(part))) return true;
  if (ACCOUNT_IDENTITY_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) return true;
  return !BUSINESS_IDENTITY_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix));
}

function shouldSkipDirectory(fullPath) {
  const rel = toRel(fullPath);
  if (rel.split("/").some((part) => SKIP_DIR_PARTS.has(part))) return true;
  if (ACCOUNT_IDENTITY_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) return true;
  return false;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(fullPath)) yield* walk(fullPath);
    } else if (entry.isFile() && isCheckableFile(fullPath) && !shouldSkipPath(fullPath)) {
      yield fullPath;
    }
  }
}

function stripLineComment(line) {
  return line.replace(/\/\/.*$/, "");
}

const violations = [];

for (const file of CHECK_ROOTS.flatMap((root) => Array.from(walk(root)))) {
  const rel = toRel(file);
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    const codeLine = stripLineComment(rawLine);
    for (const rule of RULES) {
      if (!rule.test(codeLine)) continue;
      violations.push({
        file: rel,
        line: index + 1,
        rule: rule.id,
        message: rule.message,
        text: trimmed,
      });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error("Business identity boundary check failed.");
  console.error("Business names/signatures/audit labels must use stable employee identity. Nickname and user id are account identity only.");
  console.error("");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}]`);
    console.error(`  ${violation.text.slice(0, 160)}`);
    console.error(`  ${violation.message}`);
  }
  process.exit(1);
}

console.log("Business identity boundary check passed.");
