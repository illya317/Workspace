import {
  coreUiComponentRegistry,
  registeredCoreUiComponentNames,
} from "../../packages/core/ui/component-registry";
import type { CoreUiComponentRegistration } from "../../packages/core/ui/component-registry";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const TIER_ORDER: Record<string, number> = {
  foundation: 0,
  primitive: 1,
  assembly: 2,
  frame: 3,
};
const ROOT = path.resolve(__dirname, "../..");
const CORE_UI_DIR = path.join(ROOT, "packages/core/ui");
const CORE_UI_INDEX = path.join(CORE_UI_DIR, "index.ts");
const SOURCE_EXTENSIONS = [".tsx", ".ts"];

type CoreUiExportMaps = {
  sourceByName: Map<string, string>;
  defaultNameByModule: Map<string, string>;
};

function normalizeSourcePath(modulePath: string) {
  const absoluteBase = path.resolve(CORE_UI_DIR, modulePath);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${absoluteBase}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return absoluteBase;
}

function collectCoreUiExportMaps(): CoreUiExportMaps {
  const sourceByName = new Map<string, string>();
  const defaultNameByModule = new Map<string, string>();
  const indexSource = readFileSync(CORE_UI_INDEX, "utf8");
  const sourceFile = ts.createSourceFile(CORE_UI_INDEX, indexSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith("./")) continue;
    const sourcePath = normalizeSourcePath(modulePath);

    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text;
      sourceByName.set(exportedName, sourcePath);
      if (element.propertyName?.text === "default") {
        defaultNameByModule.set(sourcePath, exportedName);
      }
    }
  }

  return { sourceByName, defaultNameByModule };
}

function resolveCoreUiImportPath(importerPath: string, specifier: string) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const absoluteBase = path.resolve(path.dirname(importerPath), specifier);
    for (const extension of SOURCE_EXTENSIONS) {
      const candidate = `${absoluteBase}${extension}`;
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
  if (specifier.startsWith("@workspace/core/ui/")) {
    return normalizeSourcePath(`./${specifier.slice("@workspace/core/ui/".length)}`);
  }
  return null;
}

function findDirectRegisteredCoreUiImports(
  sourcePath: string,
  exportMaps: CoreUiExportMaps,
  byName: Map<string, CoreUiComponentRegistration>,
) {
  const targets = new Set<string>();
  const source = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;

    const specifier = statement.moduleSpecifier.text;
    const resolvedImportPath = resolveCoreUiImportPath(sourcePath, specifier);
    if (resolvedImportPath) {
      const defaultTarget = exportMaps.defaultNameByModule.get(resolvedImportPath);
      if (defaultTarget && importClause.name && byName.has(defaultTarget)) targets.add(defaultTarget);
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (byName.has(importedName)) targets.add(importedName);
      }
    }
  }

  return [...targets].sort();
}

export function validateCoreUiRegistry() {
  const errors: string[] = [];
  const byName = new Map<string, CoreUiComponentRegistration>();
  const exportMaps = collectCoreUiExportMaps();

  for (const component of coreUiComponentRegistry) {
    const registration = component as CoreUiComponentRegistration;
    byName.set(registration.name, registration);
  }

  // 1. 引用的名字必须存在
  for (const registration of byName.values()) {
    const allTargets = [
      ...(registration.composes ?? []),
      ...(registration.foundations ?? []),
      ...(registration.includes ?? []),
    ];
    for (const target of allTargets) {
      if (!registeredCoreUiComponentNames.has(target)) {
        errors.push(`${registration.name} 引用了未注册的 core UI 入口：${target}`);
      }
    }
  }

  // 2. composes/includes 不能成环
  function visit(name: string, path: string[], seen: Set<string>) {
    if (seen.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = path.slice(cycleStart).concat(name);
      errors.push(`composes/includes 出现循环：${cycle.join(" -> ")}`);
      return;
    }
    const registration = byName.get(name);
    if (!registration) return;
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      visit(target, [...path, name], new Set(seen).add(name));
    }
  }
  for (const registration of byName.values()) {
    visit(registration.name, [], new Set());
  }

  // 3. foundation 不能反向依赖 primitive/assembly/frame
  //    foundation 只能有 foundations，且目标也必须是 foundation
  for (const registration of byName.values()) {
    if (registration.tier === "foundation") {
      if ((registration.composes && registration.composes.length > 0) || (registration.includes && registration.includes.length > 0)) {
        errors.push(`${registration.name} 是 foundation，不能声明 composes/includes`);
      }
      for (const target of registration.foundations ?? []) {
        const targetReg = byName.get(target);
        if (targetReg && targetReg.tier !== "foundation") {
          errors.push(`${registration.name}.foundations 指向了非 foundation 入口 ${target}（${targetReg.tier}）`);
        }
      }
    }
  }

  // 4. 非 foundation 不能通过 composes/includes 依赖 foundation
  //    应该使用 foundations 字段
  for (const registration of byName.values()) {
    if (registration.tier === "foundation") continue;
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      const targetReg = byName.get(target);
      if (targetReg && targetReg.tier === "foundation") {
        errors.push(`${registration.name}（${registration.tier}）通过 composes/includes 依赖了 foundation ${target}，应改为 foundations 字段`);
      }
    }
  }

  // 5. 同一来源的目标不能重复；同一目标不能同时出现在 composes/includes 和 foundations 中
  for (const registration of byName.values()) {
    const targets = new Set<string>();
    const check = (target: string, field: string) => {
      if (targets.has(target)) {
        errors.push(`${registration.name} 在多个关系字段中重复声明了 ${target}`);
      }
      targets.add(target);
    };
    for (const target of registration.composes ?? []) check(target, "composes");
    for (const target of registration.includes ?? []) check(target, "includes");
    for (const target of registration.foundations ?? []) check(target, "foundations");
  }

  // 6. 层级方向：composes/includes 的目标 tier 不能高于来源（不能反向依赖）
  for (const registration of byName.values()) {
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      const targetReg = byName.get(target);
      if (!targetReg) continue;
      if (TIER_ORDER[targetReg.tier] > TIER_ORDER[registration.tier]) {
        errors.push(`${registration.name}（${registration.tier}）composes/includes 了更高层 ${target}（${targetReg.tier}）`);
      }
    }
  }

  // 7. 实现代码里的 direct core UI imports 必须写入 registry 关系。
  //    只检查“一个源文件只承载一个注册项”的情况，避免 Card.tsx 这类多 entry 文件误报。
  const namesBySource = new Map<string, string[]>();
  for (const registration of byName.values()) {
    const sourcePath = exportMaps.sourceByName.get(registration.name);
    if (!sourcePath) continue;
    const list = namesBySource.get(sourcePath) ?? [];
    list.push(registration.name);
    namesBySource.set(sourcePath, list);
  }
  for (const [sourcePath, names] of namesBySource) {
    if (names.length !== 1) continue;
    const sourceName = names[0]!;
    const registration = byName.get(sourceName);
    if (!registration) continue;

    const declaredTargets = new Set([
      ...(registration.composes ?? []),
      ...(registration.foundations ?? []),
      ...(registration.includes ?? []),
    ]);
    const actualTargets = findDirectRegisteredCoreUiImports(sourcePath, exportMaps, byName)
      .filter((target) => target !== sourceName);
    for (const target of actualTargets) {
      if (declaredTargets.has(target)) continue;
      const targetReg = byName.get(target);
      const field = targetReg?.tier === "foundation" ? "foundations" : "composes";
      errors.push(`${sourceName} 在 ${path.relative(ROOT, sourcePath)} 中直接使用了 ${target}，但 registry 未声明 ${field}: ["${target}"]`);
    }
  }

  return errors;
}

export function checkCoreUiRegistry() {
  const errors = validateCoreUiRegistry();
  if (errors.length === 0) {
    console.log("✓ Core UI registry relation validation passed");
    return true;
  }

  console.error("✗ Core UI registry relation validation failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  return false;
}
