#!/usr/bin/env node

/**
 * 硬约束：module-nav.tsx 中声明了 resourceKey 的模块/子模块，
 * 如果存在对应的 app/<path>/page.tsx，则该 page.tsx 必须调用
 * requireResourceAccess("<同一个 resourceKey>") 做路由级权限门禁。
 *
 * 白名单路径明确放行（公开页面或登录即可见的页面）。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const NAV_PATH = path.join(ROOT, "app", "lib", "module-nav.tsx");
const APP_DIR = path.join(ROOT, "app");

const WHITELIST_PATHS = new Set([
  "/settings",
  "/portal",
  "/login",
  "/history",
  "/works",
  "/reports",
]);

/**
 * 历史债务：这些页面在引入 requireResourceAccess 之前就已存在，
 * 使用的是旧权限字段（canAccess* / visibleResourceKeys 手动检查 / requireAuth）。
 * 它们需要逐步迁移到 requireResourceAccess，在此之前先放行以避免阻塞 CI。
 * 新模块必须直接走 requireResourceAccess，不得加入此列表。
 */
const LEGACY_EXCEPTIONS = new Set([
  "app/hr/page.tsx",
  "app/administration/page.tsx",
  "app/contracts/page.tsx",
  "app/finance/page.tsx",
  "app/production/page.tsx",
  "app/inventory/page.tsx",
  "app/external/page.tsx",
  "app/external/investors/page.tsx",
  "app/external/customers/page.tsx",
  "app/external/suppliers/page.tsx",
  "app/docs/page.tsx",
  "app/docs/positions/GMP/page.tsx",
  "app/docs/company/page.tsx",
  "app/docs/expense/page.tsx",
  "app/docs/api-guide/page.tsx",
]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function findLineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function findMatchingBrace(text, openBraceIndex) {
  let braceCount = 1;
  let i = openBraceIndex + 1;
  while (i < text.length && braceCount > 0) {
    if (text[i] === "{") braceCount++;
    else if (text[i] === "}") braceCount--;
    i++;
  }
  return i;
}

function hasProperty(block, prop) {
  const regex = new RegExp(`\\b${prop}\\s*:`);
  return regex.test(block);
}

function extractStringProperty(block, prop) {
  const regex = new RegExp(`\\b${prop}\\s*:\\s*["']([^"']+)["']`);
  const match = block.match(regex);
  return match ? match[1] : undefined;
}

function isWhitelisted(href) {
  if (WHITELIST_PATHS.has(href)) return true;
  for (const prefix of WHITELIST_PATHS) {
    if (href.startsWith(prefix + "/")) return true;
  }
  return false;
}

function hrefToPagePath(href) {
  // /finance/tax => app/finance/tax/page.tsx
  const relative = href.replace(/^\//, "");
  if (!relative) return null;
  return path.join(APP_DIR, relative, "page.tsx");
}

function checkPageGate(pagePath, expectedResourceKey) {
  if (!fs.existsSync(pagePath)) return null; // no page to gate
  const text = readText(pagePath);
  const regex = new RegExp(
    `requireResourceAccess\\s*\\(\\s*["']${expectedResourceKey.replace(/\./g, "\\.")}["']\\s*\\)`,
  );
  return regex.test(text);
}

function main() {
  if (!fs.existsSync(NAV_PATH)) {
    console.error(`✗ module-nav file not found: ${NAV_PATH}`);
    process.exit(1);
  }

  const raw = readText(NAV_PATH);
  const cleaned = stripComments(raw);

  const violations = [];

  const modulesStart = cleaned.indexOf("export const MODULES");
  if (modulesStart === -1) {
    console.error("✗ MODULES array not found in module-nav.tsx");
    process.exit(1);
  }

  const arrayOpen = cleaned.indexOf("[", modulesStart);
  const arrayClose = cleaned.indexOf("];", arrayOpen);
  if (arrayOpen === -1 || arrayClose === -1) {
    console.error("✗ MODULES array brackets not found");
    process.exit(1);
  }

  const arrayBody = cleaned.slice(arrayOpen + 1, arrayClose);

  function findTopLevelObjects(body) {
    const objects = [];
    let i = 0;
    while (i < body.length) {
      // Skip whitespace and commas
      while (i < body.length && /\s/.test(body[i])) i++;
      if (body[i] === ",") i++;
      while (i < body.length && /\s/.test(body[i])) i++;
      if (body[i] !== "{") {
        i++;
        continue;
      }
      const openBrace = i;
      const end = findMatchingBrace(body, openBrace);
      const block = body.slice(openBrace, end);
      const keyMatch = block.match(/\{\s*key:\s*["']([^"']+)["']/);
      if (keyMatch) {
        objects.push({ key: keyMatch[1], block, startIndex: openBrace });
      }
      i = end;
    }
    return objects;
  }

  function checkDef(defBlock, line, keyPrefix) {
    const href = extractStringProperty(defBlock, "href");
    const resourceKey = extractStringProperty(defBlock, "resourceKey");

    if (!href || !resourceKey) return;
    if (isWhitelisted(href)) return;

    const pagePath = hrefToPagePath(href);
    if (!pagePath) return;

    const hasGate = checkPageGate(pagePath, resourceKey);
    if (hasGate === null) {
      // Page does not exist — not a violation of this check, but note it for awareness
      return;
    }
    const pageRelative = path.relative(ROOT, pagePath).replace(/\\/g, "/");
    if (!hasGate && !LEGACY_EXCEPTIONS.has(pageRelative)) {
      violations.push({
        pagePath: pageRelative,
        navLine: line,
        key: keyPrefix,
        href,
        expectedResourceKey: resourceKey,
      });
    }
  }

  const topLevelModules = findTopLevelObjects(arrayBody);
  for (const mod of topLevelModules) {
    const moduleKey = mod.key;
    const moduleBlock = mod.block;
    const moduleLine = findLineNumber(raw, arrayOpen + 1 + mod.startIndex);

    checkDef(moduleBlock, moduleLine, moduleKey);

    const childrenMatch = moduleBlock.match(/children\s*:\s*\[/);
    if (childrenMatch && childrenMatch.index !== undefined) {
      const childrenOpen = moduleBlock.indexOf("[", childrenMatch.index);
      let bracketCount = 1;
      let k = childrenOpen + 1;
      while (k < moduleBlock.length && bracketCount > 0) {
        if (moduleBlock[k] === "[") bracketCount++;
        else if (moduleBlock[k] === "]") bracketCount--;
        k++;
      }
      const childrenBody = moduleBlock.slice(childrenOpen + 1, k - 1);
      const childObjects = findTopLevelObjects(childrenBody);
      for (const child of childObjects) {
        const childKey = child.key;
        const childBlock = child.block;
        const childLine = findLineNumber(
          raw,
          arrayOpen + 1 + mod.startIndex + childrenOpen + 1 + child.startIndex,
        );

        checkDef(childBlock, childLine, `${moduleKey}.${childKey}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("✗ Module page gate check failed.");
    for (const v of violations) {
      console.error(
        `  ${v.pagePath} — missing requireResourceAccess("${v.expectedResourceKey}") (declared at app/lib/module-nav.tsx:${v.navLine} for ${v.key})`,
      );
    }
    process.exit(1);
  }

  console.log("✓ Module page gate check passed.");
}

main();
