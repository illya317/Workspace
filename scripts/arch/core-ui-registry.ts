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

type SourceAnalysis = {
  sourceFile: ts.SourceFile;
  importTargetByLocalName: Map<string, string>;
  topLevelDeclarationByName: Map<string, ts.Node>;
  defaultExportDeclaration?: ts.Node;
  registeredNamesInSource: Set<string>;
};

function normalizeSourcePath(modulePath: string) {
  const absoluteBase = path.resolve(CORE_UI_DIR, modulePath);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${absoluteBase}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return absoluteBase;
}

function createSourceFile(sourcePath: string) {
  const source = readFileSync(sourcePath, "utf8");
  return ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

function findNamedExportSource(exportedName: string, sourcePath: string, seen = new Set<string>()): string | null {
  if (seen.has(sourcePath)) return null;
  seen.add(sourcePath);

  const sourceFile = createSourceFile(sourcePath);

  for (const statement of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === exportedName && hasExportModifier(statement)) {
      return sourcePath;
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportedName) {
          return sourcePath;
        }
      }
    }
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith("./")) continue;
    const nextSourcePath = normalizeSourcePath(modulePath);
    const exportClause = statement.exportClause;

    if (exportClause && ts.isNamedExports(exportClause)) {
      for (const element of exportClause.elements) {
        if (element.name.text !== exportedName) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === "default") return nextSourcePath;
        const resolved = findNamedExportSource(importedName, nextSourcePath, seen);
        return resolved ?? nextSourcePath;
      }
      continue;
    }

    if (!exportClause) {
      const resolved = findNamedExportSource(exportedName, nextSourcePath, seen);
      if (resolved) return resolved;
    }
  }

  return null;
}

function collectCoreUiExportMaps(): CoreUiExportMaps {
  const sourceByName = new Map<string, string>();
  const defaultNameByModule = new Map<string, string>();
  const sourceFile = createSourceFile(CORE_UI_INDEX);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith("./")) continue;
    const sourcePath = normalizeSourcePath(modulePath);

    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text;
      const importedName = element.propertyName?.text ?? element.name.text;
      const actualSourcePath = importedName === "default"
        ? sourcePath
        : findNamedExportSource(importedName, sourcePath) ?? sourcePath;
      sourceByName.set(exportedName, actualSourcePath);
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

function collectSourceAnalysis(
  sourcePath: string,
  exportMaps: CoreUiExportMaps,
  byName: Map<string, CoreUiComponentRegistration>,
): SourceAnalysis {
  const importTargetByLocalName = new Map<string, string>();
  const topLevelDeclarationByName = new Map<string, ts.Node>();
  const registeredNamesInSource = new Set<string>();
  const sourceFile = createSourceFile(sourcePath);
  let defaultExportDeclaration: ts.Node | undefined;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) continue;

      const specifier = statement.moduleSpecifier.text;
      const resolvedImportPath = resolveCoreUiImportPath(sourcePath, specifier);
      if (resolvedImportPath) {
        const defaultTarget = exportMaps.defaultNameByModule.get(resolvedImportPath);
        if (defaultTarget && importClause.name && byName.has(defaultTarget)) {
          importTargetByLocalName.set(importClause.name.text, defaultTarget);
        }
      }

      const namedBindings = importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (element.isTypeOnly) continue;
          const importedName = element.propertyName?.text ?? element.name.text;
          if (byName.has(importedName)) importTargetByLocalName.set(element.name.text, importedName);
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) topLevelDeclarationByName.set(statement.name.text, statement);
      if (hasExportModifier(statement) && hasDefaultModifier(statement)) {
        defaultExportDeclaration = statement;
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          topLevelDeclarationByName.set(declaration.name.text, declaration);
        }
      }
    }
  }

  for (const [name, registeredSourcePath] of exportMaps.sourceByName) {
    if (registeredSourcePath === sourcePath && byName.has(name)) registeredNamesInSource.add(name);
  }
  for (const name of topLevelDeclarationByName.keys()) {
    if (byName.has(name)) registeredNamesInSource.add(name);
  }

  return {
    sourceFile,
    importTargetByLocalName,
    topLevelDeclarationByName,
    defaultExportDeclaration,
    registeredNamesInSource,
  };
}

function getRegisteredEntryNode(
  name: string,
  sourcePath: string,
  analysis: SourceAnalysis,
  exportMaps: CoreUiExportMaps,
) {
  const namedDeclaration = analysis.topLevelDeclarationByName.get(name);
  if (namedDeclaration) return namedDeclaration;
  if (exportMaps.defaultNameByModule.get(sourcePath) === name) return analysis.defaultExportDeclaration;
  return undefined;
}

function findRegisteredCoreUiDependenciesForEntry(
  name: string,
  sourcePath: string,
  analysis: SourceAnalysis,
  exportMaps: CoreUiExportMaps,
) {
  const targets = new Set<string>();
  const root = getRegisteredEntryNode(name, sourcePath, analysis, exportMaps);
  if (!root) return [];

  const visitedLocalHelpers = new Set<string>();

  function scan(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      const importedTarget = analysis.importTargetByLocalName.get(node.text);
      if (importedTarget && importedTarget !== name) {
        targets.add(importedTarget);
        return;
      }

      if (analysis.registeredNamesInSource.has(node.text) && node.text !== name) {
        targets.add(node.text);
        return;
      }

      const localDeclaration = analysis.topLevelDeclarationByName.get(node.text);
      if (localDeclaration && !visitedLocalHelpers.has(node.text) && !analysis.registeredNamesInSource.has(node.text)) {
        visitedLocalHelpers.add(node.text);
        scan(localDeclaration);
        return;
      }
    }

    ts.forEachChild(node, scan);
  }

  scan(root);
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

  // 7. 实现代码里的 core UI 依赖必须写入 registry 关系。
  //    按导出入口归因；同文件私有 helper 会递归追踪，同文件已注册入口只记直接依赖，避免把间接依赖摊平。
  const namesBySource = new Map<string, string[]>();
  for (const registration of byName.values()) {
    const sourcePath = exportMaps.sourceByName.get(registration.name);
    if (!sourcePath) continue;
    const list = namesBySource.get(sourcePath) ?? [];
    list.push(registration.name);
    namesBySource.set(sourcePath, list);
  }
  for (const [sourcePath, names] of namesBySource) {
    const analysis = collectSourceAnalysis(sourcePath, exportMaps, byName);
    for (const sourceName of names) {
      const registration = byName.get(sourceName);
      if (!registration) continue;
      const declaredTargets = new Set([
        ...(registration.composes ?? []),
        ...(registration.foundations ?? []),
        ...(registration.includes ?? []),
      ]);
      const actualTargets = findRegisteredCoreUiDependenciesForEntry(sourceName, sourcePath, analysis, exportMaps)
        .filter((target) => target !== sourceName);

      for (const target of actualTargets) {
        if (declaredTargets.has(target)) continue;
        const targetReg = byName.get(target);
        const field = targetReg?.tier === "foundation" ? "foundations" : "composes";
        errors.push(`${sourceName} 在 ${path.relative(ROOT, sourcePath)} 中使用了 ${target}，但 registry 未声明 ${field}: ["${target}"]`);
      }
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
