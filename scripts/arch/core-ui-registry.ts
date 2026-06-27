import {
  CORE_UI_SHOWCASE_MAX_LEVEL,
  coreUiComponentRegistry,
  isCoreUiComponentVisibleInShowcase,
  registeredCoreUiComponentNames,
  resolveCoreUiComponentUiLevel,
} from "../../packages/core/ui/component-registry";
import type { CoreUiComponentRegistration } from "../../packages/core/ui/component-registry";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const CORE_UI_DIR = path.join(ROOT, "packages/core/ui");
const CORE_UI_INDEX = path.join(CORE_UI_DIR, "index.ts");
const SOURCE_EXTENSIONS = [".tsx", ".ts"];
const ALLOWED_UI_LEVELS = new Set([1, 2, 3, 4]);
const CORE_UI_L1_PUBLIC_ENTRY_NAMES = new Set([
  "DataSurface",
  "FormSurface",
  "PageSurface",
  "useFeedback",
]);

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

  // 1. uiLevel 是展示治理硬约束：L1 名单精确匹配；L4+ 不能进入组件库主展示。
  const resolvedL1Names = new Set<string>();
  for (const registration of byName.values()) {
    const explicitUiLevel = (registration as { uiLevel?: unknown }).uiLevel;
    if (explicitUiLevel !== undefined && !ALLOWED_UI_LEVELS.has(explicitUiLevel as number)) {
      errors.push(`${registration.name}.uiLevel 必须是 1/2/3/4，当前为 ${String(explicitUiLevel)}`);
      continue;
    }

    const resolvedUiLevel = resolveCoreUiComponentUiLevel(registration);
    if (!ALLOWED_UI_LEVELS.has(resolvedUiLevel)) {
      errors.push(`${registration.name} 解析后的 uiLevel 必须是 1/2/3/4，当前为 ${String(resolvedUiLevel)}`);
    }

    if (resolvedUiLevel === 1) resolvedL1Names.add(registration.name);

    const shouldBeHiddenFromShowcase = resolvedUiLevel > CORE_UI_SHOWCASE_MAX_LEVEL;
    if (shouldBeHiddenFromShowcase && isCoreUiComponentVisibleInShowcase(registration)) {
      errors.push(`${registration.name} 是 L${resolvedUiLevel}，必须从 UI 组件库主展示隐藏`);
    }
  }
  for (const expectedName of CORE_UI_L1_PUBLIC_ENTRY_NAMES) {
    if (!resolvedL1Names.has(expectedName)) {
      errors.push(`Core UI L1 缺少公开入口 ${expectedName}`);
    }
  }
  for (const actualName of resolvedL1Names) {
    if (!CORE_UI_L1_PUBLIC_ENTRY_NAMES.has(actualName)) {
      errors.push(`${actualName} 不能声明或解析为 uiLevel: 1；L1 仅允许 PageSurface/FormSurface/DataSurface/useFeedback`);
    }
  }

  const visibleShowcaseRoots = [...byName.values()]
    .filter(isCoreUiComponentVisibleInShowcase)
    .map((registration) => registration.name)
    .sort();
  for (const rootName of visibleShowcaseRoots) {
    const root = byName.get(rootName);
    if (!root) continue;
    const rootLevel = resolveCoreUiComponentUiLevel(root);
    if (rootLevel > CORE_UI_SHOWCASE_MAX_LEVEL) {
      errors.push(`${root.name} 是 L${rootLevel}，不能作为 UI 组件库主展示根节点`);
    }
    const directTargets = [
      ...(root.composes ?? []),
      ...(root.foundations ?? []),
      ...(root.includes ?? []),
    ];
    for (const targetName of directTargets) {
      const target = byName.get(targetName);
      if (!target || !isCoreUiComponentVisibleInShowcase(target)) continue;
      const targetLevel = resolveCoreUiComponentUiLevel(target);
      if (targetLevel > CORE_UI_SHOWCASE_MAX_LEVEL) {
        errors.push(`${root.name} 的组件库主展示直接关系暴露了 L${targetLevel} 入口 ${target.name}`);
      }
    }
  }

  // 2. 引用的名字必须存在
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

  // 2b. Agent 暴露路径必须指向真实入口；关键能力域只能有一个直接入口。
  const directEntriesByOwner = new Map<string, string[]>();
  for (const registration of byName.values()) {
    const exposure = registration.agentExposure;
    if (!exposure) {
      errors.push(`${registration.name} 缺少 agentExposure`);
      continue;
    }
    if (exposure.mode === "via" && !byName.has(exposure.entry)) {
      errors.push(`${registration.name}.agentExposure 指向未注册入口 ${exposure.entry}`);
    }
    if (exposure.mode === "direct") {
      const owner = registration.ownerL2 ?? "unknown";
      directEntriesByOwner.set(owner, [...(directEntriesByOwner.get(owner) ?? []), registration.name]);
    }
  }
  const canonicalDirectEntries: Record<string, string[]> = {
    "common.input": ["InputControl"],
    "common.selection": ["SelectorPanel"],
  };
  for (const [ownerL2, allowed] of Object.entries(canonicalDirectEntries)) {
    const actual = directEntriesByOwner.get(ownerL2) ?? [];
    const unexpected = actual.filter((name) => !allowed.includes(name));
    if (unexpected.length > 0) {
      errors.push(`${ownerL2} 只能通过 ${allowed.join(", ")} 作为直接入口，当前多出 ${unexpected.join(", ")}`);
    }
  }

  // 3. composes/includes 不能成环
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

  // 4. Foundation entry 不能声明 composes/includes，且 foundations 目标也必须是 Foundation。
  for (const registration of byName.values()) {
    if (registration.accessLayer === "foundation") {
      if ((registration.composes && registration.composes.length > 0) || (registration.includes && registration.includes.length > 0)) {
        errors.push(`${registration.name} 是 foundation，不能声明 composes/includes`);
      }
      for (const target of registration.foundations ?? []) {
        const targetReg = byName.get(target);
        if (targetReg && targetReg.accessLayer !== "foundation") {
          errors.push(`${registration.name}.foundations 指向了非 foundation 入口 ${target}（${targetReg.accessLayer}）`);
        }
      }
    }
  }

  // 5. 非 Foundation 不能通过 composes/includes 依赖 Foundation，应该使用 foundations 字段。
  for (const registration of byName.values()) {
    if (registration.accessLayer === "foundation") continue;
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      const targetReg = byName.get(target);
      if (targetReg && targetReg.accessLayer === "foundation") {
        errors.push(`${registration.name}（${registration.accessLayer}）通过 composes/includes 依赖了 foundation ${target}，应改为 foundations 字段`);
      }
    }
  }

  // 6. 同一来源的目标不能重复；同一目标不能同时出现在 composes/includes 和 foundations 中
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
        const field = targetReg?.accessLayer === "foundation" ? "foundations" : "composes";
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
