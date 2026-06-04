#!/usr/bin/env node

/**
 * 硬约束：module-nav.tsx 中的每个模块/子模块必须配置 resourceKey 或 requiredPerm。
 * settings 模块作为白名单放行（个人设置类页面天然登录可见）。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const NAV_PATH = path.join(ROOT, "app", "lib", "module-nav.tsx");

const WHITELIST_MODULES = new Set(["settings"]);

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

function main() {
  if (!fs.existsSync(NAV_PATH)) {
    console.error(`✗ module-nav file not found: ${NAV_PATH}`);
    process.exit(1);
  }

  const raw = readText(NAV_PATH);
  const cleaned = stripComments(raw);

  const violations = [];

  // Find MODULES array: export const MODULES: ModuleDef[] = [ ... ]
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

  // Scan top-level module objects in the array body
  const moduleRegex = /\{\s*key:\s*["']([^"']+)["']/g;
  let moduleMatch;
  while ((moduleMatch = moduleRegex.exec(arrayBody)) !== null) {
    const moduleKey = moduleMatch[1];
    const moduleStartInArray = moduleMatch.index;
    const moduleOpenBrace = arrayBody.indexOf("{", moduleStartInArray);
    const moduleEnd = findMatchingBrace(arrayBody, moduleOpenBrace);
    const moduleBlock = arrayBody.slice(moduleStartInArray, moduleEnd);
    const moduleLine = findLineNumber(raw, arrayOpen + 1 + moduleStartInArray);

    const modHasResourceKey = hasProperty(moduleBlock, "resourceKey");
    const modHasRequiredPerm = hasProperty(moduleBlock, "requiredPerm");

    if (!WHITELIST_MODULES.has(moduleKey) && !modHasResourceKey && !modHasRequiredPerm) {
      violations.push({
        key: moduleKey,
        line: moduleLine,
        message: `模块 "${moduleKey}" 缺少 resourceKey 或 requiredPerm`,
      });
    }

    // Find children: array inside this module object
    const childrenMatch = moduleBlock.match(/children\s*:\s*\[/);
    if (childrenMatch && childrenMatch.index !== undefined) {
      const childrenOpen = moduleBlock.indexOf("[", childrenMatch.index);
      // Find matching close bracket for children array
      let bracketCount = 1;
      let k = childrenOpen + 1;
      while (k < moduleBlock.length && bracketCount > 0) {
        if (moduleBlock[k] === "[") bracketCount++;
        else if (moduleBlock[k] === "]") bracketCount--;
        k++;
      }
      const childrenBody = moduleBlock.slice(childrenOpen + 1, k - 1);

      const childRegex = /\{\s*key:\s*["']([^"']+)["']/g;
      let childMatch;
      while ((childMatch = childRegex.exec(childrenBody)) !== null) {
        const childKey = childMatch[1];
        const childStartInChildren = childMatch.index;
        const childOpenBrace = childrenBody.indexOf("{", childStartInChildren);
        const childEnd = findMatchingBrace(childrenBody, childOpenBrace);
        const childBlock = childrenBody.slice(childStartInChildren, childEnd);
        const childLine = findLineNumber(
          raw,
          arrayOpen + 1 + moduleStartInArray + childrenOpen + 1 + childStartInChildren,
        );

        const childHasResourceKey = hasProperty(childBlock, "resourceKey");
        const childHasRequiredPerm = hasProperty(childBlock, "requiredPerm");

        if (!childHasResourceKey && !childHasRequiredPerm) {
          violations.push({
            key: `${moduleKey}.${childKey}`,
            line: childLine,
            message: `子模块 "${moduleKey}.${childKey}" 缺少 resourceKey 或 requiredPerm`,
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("✗ Module-nav access gate check failed.");
    for (const v of violations) {
      console.error(`  app/lib/module-nav.tsx:${v.line} — ${v.message}`);
    }
    process.exit(1);
  }

  console.log("✓ Module-nav access gate check passed.");
}

main();
