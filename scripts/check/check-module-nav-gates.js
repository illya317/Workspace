#!/usr/bin/env node

/**
 * 硬约束：module-nav.tsx 中的每个模块/子模块必须配置 resourceKey。
 * settings 模块作为白名单放行（个人设置类页面天然登录可见）。
 *
 * 实现：使用 TypeScript AST 精确区分父对象自身属性与 children 数组内部，
 * 避免文本正则把子模块的 resourceKey 误算到父模块上。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const NAV_PATH = path.join(ROOT, "app", "lib", "module-nav.tsx");

const WHITELIST_MODULES = new Set(["settings"]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseNavFile(filePath) {
  const ts = require("typescript");
  const text = readText(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return { ts, sourceFile, text };
}

function getLine(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function getPropertyName(ts, prop) {
  if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
    if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
      return prop.name.text;
    }
  }
  if (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) {
    if (ts.isStringLiteral(prop.name.expression)) {
      return prop.name.expression.text;
    }
  }
  return undefined;
}

function getObjectProperty(ts, obj, name) {
  if (!ts.isObjectLiteralExpression(obj)) return undefined;
  for (const prop of obj.properties) {
    const propName = getPropertyName(ts, prop);
    if (propName === name) return prop;
  }
  return undefined;
}

function getKeyValue(ts, obj) {
  const keyProp = getObjectProperty(ts, obj, "key");
  if (!keyProp) return undefined;
  if (ts.isPropertyAssignment(keyProp)) {
    if (ts.isStringLiteral(keyProp.initializer)) {
      return keyProp.initializer.text;
    }
  }
  if (ts.isShorthandPropertyAssignment(keyProp) && ts.isIdentifier(keyProp.name)) {
    return keyProp.name.text;
  }
  return undefined;
}

function hasOwnGate(ts, obj) {
  if (!ts.isObjectLiteralExpression(obj)) return false;
  for (const prop of obj.properties) {
    const propName = getPropertyName(ts, prop);
    if (propName === "resourceKey") {
      return true;
    }
  }
  return false;
}

function collectViolations(ts, sourceFile, arrayNode, pathPrefix, violations) {
  if (!arrayNode) return;
  if (!ts.isArrayLiteralExpression(arrayNode)) return;

  for (const element of arrayNode.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;

    const key = getKeyValue(ts, element);
    const fullKey = pathPrefix ? `${pathPrefix}.${key}` : key;
    const line = getLine(sourceFile, element.getStart(sourceFile));

    const isWhitelisted = !pathPrefix && WHITELIST_MODULES.has(key);
    if (!isWhitelisted && !hasOwnGate(ts, element)) {
      violations.push({
        key: fullKey,
        line,
        message: `${pathPrefix ? "子模块" : "模块"} "${fullKey}" 缺少 resourceKey`,
      });
    }

    const childrenProp = getObjectProperty(ts, element, "children");
    if (childrenProp && ts.isPropertyAssignment(childrenProp)) {
      const childrenInit = childrenProp.initializer;
      if (ts.isArrayLiteralExpression(childrenInit)) {
        collectViolations(ts, sourceFile, childrenInit, key, violations);
      }
    }
  }
}

function findModulesArray(ts, sourceFile) {
  let modulesArray = null;

  function visit(node) {
    if (modulesArray) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "MODULES" &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      modulesArray = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return modulesArray;
}

function runCheck(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`✗ module-nav file not found: ${filePath}`);
    process.exit(1);
  }

  const { ts, sourceFile } = parseNavFile(filePath);
  const modulesArray = findModulesArray(ts, sourceFile);

  if (!modulesArray) {
    console.error("✗ MODULES array not found in module-nav.tsx");
    process.exit(1);
  }

  const violations = [];
  collectViolations(ts, sourceFile, modulesArray, "", violations);

  if (violations.length > 0) {
    console.error("✗ Module-nav access gate check failed.");
    for (const v of violations) {
      console.error(`  app/lib/module-nav.tsx:${v.line} — ${v.message}`);
    }
    return { ok: false, violations };
  }

  return { ok: true, violations: [] };
}

function main() {
  const result = runCheck(NAV_PATH);
  if (result.ok) {
    console.log("✓ Module-nav access gate check passed.");
  } else {
    process.exit(1);
  }
}

// ─── Fixture tests ─────────────────────────────────────────

function runFixtures() {
  const ts = require("typescript");

  function makeSource(text) {
    return ts.createSourceFile("fixture.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  }

  function expectResult(text, expectedOk, label) {
    const sourceFile = makeSource(text);
    const modulesArray = findModulesArray(ts, sourceFile);
    if (!modulesArray) {
      console.error(`  ✗ fixture "${label}": MODULES array not found`);
      return false;
    }
    const violations = [];
    collectViolations(ts, sourceFile, modulesArray, "", violations);
    const ok = violations.length === 0;
    if (ok !== expectedOk) {
      console.error(
        `  ✗ fixture "${label}": expected ${expectedOk ? "pass" : "fail"}, got ${ok ? "pass" : "fail"}`,
      );
      if (violations.length) {
        for (const v of violations) {
          console.error(`      line ${v.line}: ${v.message}`);
        }
      }
      return false;
    }
    console.log(`  ✓ fixture "${label}" ${expectedOk ? "passes" : "fails"} as expected`);
    return true;
  }

  const fixtures = [
    {
      label: "parent missing gate, child has gate → fail",
      text: `export const MODULES: any[] = [
        { key: "finance", label: "财务", href: "/finance", icon: null, color: "amber",
          children: [
            { key: "tax", label: "税务", href: "/finance/tax", resourceKey: "finance.tax" },
          ],
        },
      ];`,
      expectedOk: false,
    },
    {
      label: "parent has gate, child has gate → pass",
      text: `export const MODULES: any[] = [
        { key: "finance", label: "财务", href: "/finance", icon: null, color: "amber", resourceKey: "finance",
          children: [
            { key: "tax", label: "税务", href: "/finance/tax", resourceKey: "finance.tax" },
          ],
        },
      ];`,
      expectedOk: true,
    },
    {
      label: "settings module without gate → pass",
      text: `export const MODULES: any[] = [
        { key: "settings", label: "设置", href: "/settings", icon: null, color: "orange" },
      ];`,
      expectedOk: true,
    },
    {
      label: "parent missing gate, no children → fail",
      text: `export const MODULES: any[] = [
        { key: "library", label: "资料库", href: "/library", icon: null, color: "orange" },
      ];`,
      expectedOk: false,
    },
    {
      label: "child missing gate → fail",
      text: `export const MODULES: any[] = [
        { key: "finance", label: "财务", href: "/finance", icon: null, color: "amber", resourceKey: "finance",
          children: [
            { key: "tax", label: "税务", href: "/finance/tax" },
          ],
        },
      ];`,
      expectedOk: false,
    },
  ];

  console.log("Running fixtures...");
  let allPassed = true;
  for (const f of fixtures) {
    if (!expectResult(f.text, f.expectedOk, f.label)) {
      allPassed = false;
    }
  }
  return allPassed;
}

if (process.argv.includes("--fixtures")) {
  const ok = runFixtures();
  process.exit(ok ? 0 : 1);
} else {
  main();
}
