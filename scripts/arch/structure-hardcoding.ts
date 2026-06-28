import ts from "typescript";

type SourceInfo = {
  relPath: string;
  sourceFile: ts.SourceFile;
};

export type BusinessVisualTokenHardcoding = {
  file: string;
  signals: string[];
};

export type CoreBusinessFactLiteral = {
  file: string;
  literal: string;
  signal: string;
};

export type ComponentLocalUiConfig = {
  file: string;
  name: string;
  kind: string;
  itemCount: number;
};

const BUSINESS_VISUAL_TOKEN_SCAN_ROOTS = [
  /^app\/\(modules\)\//,
  /^packages\/(administration|external|finance|hr|library|production|work)\/ui\//,
];
const CORE_BUSINESS_FACT_SCAN_ROOTS = [
  /^packages\/core\/ui\/(?!component-registry)(?!.*showcase)/,
];
const CORE_BUSINESS_FACT_SIGNALS: Array<{ signal: string; regex: RegExp }> = [
  { signal: "hr-domain", regex: /\b(HR|Employee|Department|Position|Roster)\b|员工|部门|岗位|人事/ },
  { signal: "finance-domain", regex: /\b(Finance|Budget|Ledger|Voucher|Account|Statement)\b|财务|预算|凭证|科目|报表/ },
  { signal: "production-domain", regex: /\b(Production|Qc|Quality|Batch|Template)\b|生产|质检|批次|模板/ },
  { signal: "work-domain", regex: /\b(Project|Task|Meeting|WorkReport)\b|项目|任务|会议|汇报/ },
  { signal: "library-domain", regex: /\b(Library|DocumentTemplate)\b|资料库|文档模板/ },
  { signal: "external-domain", regex: /\b(Customer|Supplier|Investor)\b|客户|供应商|投资人/ },
];
const LOCAL_UI_CONFIG_NAME_RULES: Array<{ kind: string; regex: RegExp }> = [
  { kind: "columns", regex: /(columns|columnDefs)$/i },
  { kind: "fields", regex: /(fields|fieldSpecs|formFields|filterFields)$/i },
  { kind: "actions", regex: /(actions|toolbarItems|menuItems)$/i },
  { kind: "tabs", regex: /(tabs|tabItems|sections)$/i },
  { kind: "options", regex: /(options|optionGroups|choices)$/i },
];

function isBusinessVisualTokenScanFile(file: SourceInfo) {
  if (!file.relPath.endsWith(".tsx")) return false;
  return BUSINESS_VISUAL_TOKEN_SCAN_ROOTS.some((pattern) => pattern.test(file.relPath));
}

function isCoreBusinessFactScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  return CORE_BUSINESS_FACT_SCAN_ROOTS.some((pattern) => pattern.test(file.relPath));
}

function classNameText(attribute: ts.JsxAttribute, sourceFile: ts.SourceFile) {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return initializer.getText(sourceFile);
  if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return initializer.expression.getText(sourceFile);
}

function visualTokenHardcodingSignals(className: string) {
  const signals: string[] = [];

  if (/\b(?:h|w|min-h|min-w|max-h|max-w|size)-\[[^\]]*(?:px|rem|vh|vw|%)\]/.test(className)) {
    signals.push("arbitrary-size-token");
  }
  if (/\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y)-\[[^\]]*(?:px|rem)\]/.test(className)) {
    signals.push("arbitrary-spacing-token");
  }
  if (/\b(?:text|bg|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]/.test(className)) {
    signals.push("arbitrary-color-token");
  }
  if (/\b(?:rounded|shadow)-\[[^\]]+\]/.test(className)) {
    signals.push("arbitrary-shape-token");
  }

  return signals;
}

export function findBusinessVisualTokenHardcoding(files: SourceInfo[]) {
  const drift: BusinessVisualTokenHardcoding[] = [];

  for (const file of files) {
    if (!isBusinessVisualTokenScanFile(file)) continue;

    const signals = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const property of node.attributes.properties) {
          if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;
          if (property.name.text === "className") {
            for (const signal of visualTokenHardcodingSignals(classNameText(property, file.sourceFile))) {
              signals.add(signal);
            }
          }
          if (property.name.text === "style") {
            signals.add("inline-style-token");
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
    if (signals.size > 0) {
      drift.push({ file: file.relPath, signals: [...signals].sort() });
    }
  }

  return drift.sort((left, right) => left.file.localeCompare(right.file));
}

function normalizeLiteralText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function findCoreBusinessFactLiterals(files: SourceInfo[]) {
  const drift: CoreBusinessFactLiteral[] = [];

  for (const file of files) {
    if (!isCoreBusinessFactScanFile(file)) continue;

    const seen = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const literal = normalizeLiteralText(node.text);
        if (literal.length >= 2) {
          for (const rule of CORE_BUSINESS_FACT_SIGNALS) {
            if (!rule.regex.test(literal)) continue;
            const key = `${file.relPath}:${rule.signal}:${literal}`;
            if (!seen.has(key)) {
              seen.add(key);
              drift.push({ file: file.relPath, literal, signal: rule.signal });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  return drift.sort((left, right) => `${left.file}:${left.signal}:${left.literal}`.localeCompare(`${right.file}:${right.signal}:${right.literal}`));
}

function localUiConfigKind(name: string) {
  return LOCAL_UI_CONFIG_NAME_RULES.find((rule) => rule.regex.test(name))?.kind ?? null;
}

function topLevelUiConfigItemCount(node: ts.Expression) {
  const expression = ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? node.expression : node;
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.length;
  if (ts.isObjectLiteralExpression(expression)) return expression.properties.length;
  return 0;
}

export function findComponentLocalUiConfigs(files: SourceInfo[]) {
  const drift: ComponentLocalUiConfig[] = [];

  for (const file of files) {
    if (!isBusinessVisualTokenScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst) continue;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const kind = localUiConfigKind(declaration.name.text);
        if (!kind) continue;
        const itemCount = topLevelUiConfigItemCount(declaration.initializer);
        if (itemCount < 3) continue;
        drift.push({
          file: file.relPath,
          name: declaration.name.text,
          kind,
          itemCount,
        });
      }
    }
  }

  return drift.sort((left, right) => `${left.file}:${left.name}`.localeCompare(`${right.file}:${right.name}`));
}
