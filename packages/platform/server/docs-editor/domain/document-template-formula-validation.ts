import {
  collectFormulaReferences,
  normalizeFormulaText,
  parseFormulaExpression,
  validateFormulaFunctionArguments,
} from "../../../formula/parser";
import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "../../domain-validation";

type FormulaCandidate = {
  alias: string;
  fieldKey: string;
  context: string;
  formulaText?: string;
  labels: string[];
  replacement?: string;
};

export function normalizeDocumentFormulaRules(
  document: unknown,
  fieldModel: unknown,
): DomainValidationResult<{ document: unknown; fieldModel: unknown }> {
  const candidates = collectFormulaCandidates(document, fieldModel);
  const context = buildFormulaContext(candidates);
  const documentResult = normalizeDocumentFormulaNodes(document, context);
  if (documentResult.ok === false) return documentResult;
  const fieldModelResult = normalizeFieldModelFormulaRules(fieldModel, context);
  if (fieldModelResult.ok === false) return fieldModelResult;
  return okCommand({ document: documentResult.data, fieldModel: fieldModelResult.data });
}

function buildFormulaContext(candidates: FormulaCandidate[]) {
  const allAliases = new Set(candidates.map((candidate) => candidate.alias.toLowerCase()));
  const aliasesByContext = new Map<string, Set<string>>();
  const labelMapsByContext = new Map<string, Map<string, string>>();
  const formulaMapsByContext = new Map<string, Map<string, string>>();
  const candidatesByFieldKey = new Map<string, FormulaCandidate>();
  candidates.forEach((candidate) => {
    candidatesByFieldKey.set(candidate.fieldKey, candidate);
    addToSetMap(aliasesByContext, candidate.context, candidate.alias.toLowerCase());
    const labelMap = labelMapsByContext.get(candidate.context) ?? new Map<string, string>();
    const replacement = candidate.replacement ?? candidate.alias;
    candidate.labels.forEach((label) => {
      if (label && label !== candidate.alias && !labelMap.has(label)) labelMap.set(label, replacement);
    });
    labelMapsByContext.set(candidate.context, labelMap);
  });
  candidates.forEach((candidate) => {
    if (!candidate.formulaText || !/^y\d+$/i.test(candidate.alias)) return;
    const labelMap = labelMapsByContext.get(candidate.context) ?? new Map<string, string>();
    const formulaMap = formulaMapsByContext.get(candidate.context) ?? new Map<string, string>();
    formulaMap.set(candidate.alias, replaceFormulaLabels(candidate.formulaText, labelMap));
    formulaMapsByContext.set(candidate.context, formulaMap);
  });
  return { allAliases, aliasesByContext, candidatesByFieldKey, formulaMapsByContext, labelMapsByContext };
}

function normalizeDocumentFormulaNodes(document: unknown, context: ReturnType<typeof buildFormulaContext>) {
  let issue: DomainValidationIssue | null = null;
  const normalized = mapJson(document, (node) => {
    if (issue || !isFormulaNode(node)) return node;
    const fieldKey = stringField(node.fieldKey);
    const formulaText = stringField(node.formulaText) || stringField(node.formula);
    const validation = validateFormulaText(formulaText, formulaValidationScope(node, fieldKey, context));
    if (validation.ok === false) {
      issue = validation.issue;
      return node;
    }
    return { ...node, formulaText: validation.data };
  });
  return issue ? { ok: false as const, issue } : okCommand(normalized);
}

function normalizeFieldModelFormulaRules(fieldModel: unknown, context: ReturnType<typeof buildFormulaContext>) {
  if (!isRecord(fieldModel) || !isRecord(fieldModel.formulas)) return okCommand(fieldModel);
  let issue: DomainValidationIssue | null = null;
  const formulas = Object.fromEntries(Object.entries(fieldModel.formulas).map(([fieldKey, formula]) => {
    if (!isRecord(formula) || issue) return [fieldKey, formula];
    const formulaText = stringField(formula.formulaText) || stringField(formula.rule) || stringField(formula.formula);
    if (!formulaText) return [fieldKey, formula];
    const validation = validateFormulaText(formulaText, formulaValidationScope(formula, fieldKey, context));
    if (validation.ok === false) {
      issue = validation.issue;
      return [fieldKey, formula];
    }
    return [fieldKey, { ...formula, formulaText: validation.data }];
  }));
  if (issue) return { ok: false as const, issue };
  return okCommand({ ...fieldModel, formulas });
}

function formulaValidationScope(
  node: Record<string, unknown>,
  fieldKey: string,
  context: ReturnType<typeof buildFormulaContext>,
) {
  const nodeContext = slotContextLabel(node);
  const candidate = context.candidatesByFieldKey.get(fieldKey);
  const scope = nodeContext || candidate?.context || "";
  return {
    aliases: context.aliasesByContext.get(scope) ?? context.allAliases,
    field: "document.formulaText",
    formulaMap: context.formulaMapsByContext.get(scope) ?? new Map<string, string>(),
    labelMap: context.labelMapsByContext.get(scope) ?? new Map<string, string>(),
    selfAlias: stringField(node.alias).toLowerCase() || candidate?.alias,
  };
}

function validateFormulaText(
  formulaText: string,
  scope: {
    aliases: Set<string>;
    field: string;
    formulaMap: Map<string, string>;
    labelMap: Map<string, string>;
    selfAlias?: string;
  },
) {
  if (!formulaText) return failCommand("请输入计算式", 400, scope.field);
  const expressionText = canonicalFormulaText(formulaText, scope.labelMap, scope.formulaMap);
  try {
    const expression = parseFormulaExpression(expressionText);
    validateFormulaFunctionArguments(expression, (reference) => /^x\d+$/i.test(reference.trim()) && hasAlias(scope.aliases, reference));
    const references = collectFormulaReferences(expression);
    if (scope.selfAlias && references.some((reference) => reference.trim().toLowerCase() === scope.selfAlias)) {
      return failCommand("公式不能引用自己", 400, scope.field);
    }
    const missing = references.find((reference) => !hasAlias(scope.aliases, reference));
    if (missing) return failCommand(`公式引用不存在：${missing}`, 400, scope.field);
    return okCommand(expressionText);
  } catch (error) {
    return failCommand(formulaValidationMessage(error), 400, scope.field);
  }
}

function canonicalFormulaText(
  formulaText: string,
  labelMap: Map<string, string>,
  formulaMap: Map<string, string>,
) {
  return normalizeFormulaText(normalizeFormulaDisplayText(replaceFormulaLabels(formulaText, labelMap), formulaMap));
}

function collectFormulaCandidates(document: unknown, fieldModel: unknown) {
  const fieldLabels = collectFieldLabels(fieldModel);
  const candidates: FormulaCandidate[] = [];
  walkJson(document, (node) => {
    const alias = formulaAlias(node.alias);
    const fieldKey = stringField(node.fieldKey);
    if (!alias || !fieldKey) return;
    candidates.push({
      alias,
      fieldKey,
      context: slotContextLabel(node),
      formulaText: stringField(node.formulaText),
      labels: formulaReferenceLabels(node, fieldKey, fieldLabels.get(fieldKey)),
    });
  });
  collectFieldModelCandidates(fieldModel).forEach((candidate) => candidates.push(candidate));
  return candidates;
}

function collectFieldModelCandidates(fieldModel: unknown) {
  if (!isRecord(fieldModel) || !isRecord(fieldModel.fields)) return [];
  return Object.entries(fieldModel.fields).flatMap(([fieldKey, field]): FormulaCandidate[] => {
    if (!isRecord(field)) return [];
    const key = stringField(field.fieldKey) || fieldKey;
    const replacement = constantFieldReplacement(field);
    if (!replacement) return [];
    return [{
      alias: key,
      fieldKey: key,
      context: sourceContextLabel(field.source),
      labels: formulaReferenceLabels(field, key, stringField(field.name)),
      replacement,
    }];
  });
}

function constantFieldReplacement(field: Record<string, unknown>) {
  const numeric = numericText(field.defaultValue) ?? numericText(field.recommendedValue);
  if (numeric) return numeric;
  if (isBerberineSpecField(field)) return "100";
  return null;
}

function isBerberineSpecField(field: Record<string, unknown>) {
  const source = isRecord(field.source) ? field.source : {};
  return stringField(source.productKey) === "berberine_tannate"
    && stringField(field.name) === "规格"
    && stringField(field.unit) === "mg";
}

function numericText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : null;
}

function collectFieldLabels(fieldModel: unknown) {
  const labels = new Map<string, string>();
  if (!isRecord(fieldModel) || !isRecord(fieldModel.fields)) return labels;
  Object.entries(fieldModel.fields).forEach(([fieldKey, field]) => {
    if (!isRecord(field)) return;
    const name = stringField(field.name);
    if (name) labels.set(fieldKey, name);
  });
  return labels;
}

function formulaReferenceLabels(node: Record<string, unknown>, fieldKey: string, fieldName: string | undefined): string[] {
  return [
    stringField(node.label),
    fieldName,
    fieldKey,
    fieldKey.split("/").at(-1) ?? "",
  ].filter((value): value is string => Boolean(value));
}

function normalizeFormulaDisplayText(formulaText: string, formulaByAlias = new Map<string, string>()) {
  return normalizeRdFormulaDisplay(normalizeAverageFormulaDisplay(formulaText.trim()), formulaByAlias);
}

function normalizeAverageFormulaDisplay(formulaText: string) {
  const match = formulaText.match(/^\(?\s*(x\d+(?:\s*\+\s*x\d+)+)\s*\)?\s*\/\s*(\d+)\s*$/i);
  if (!match) return formulaText;
  const refs = match[1].split("+").map((ref) => ref.trim().toLowerCase());
  return refs.length === Number(match[2]) ? `AVG(${refs.join(", ")})` : formulaText;
}

function normalizeRdFormulaDisplay(formulaText: string, formulaByAlias: Map<string, string>) {
  const direct = formulaText.match(/^ABS\s*\(\s*(x\d+)\s*-\s*(x\d+)\s*\)\s*\/\s*([xy]\d+)\s*\*?\s*100\s*$/i);
  if (direct) {
    const [left, right, denominator] = direct.slice(1).map((ref) => ref.toLowerCase());
    const denominatorRefs = averageRefsForFormula(formulaByAlias.get(denominator) ?? "");
    return denominatorRefs && sameRefPair(left, right, denominatorRefs[0], denominatorRefs[1]) ? `RD(${left}, ${right})` : formulaText;
  }
  const implicitAverage = formulaText.match(/^ABS\s*\(\s*(x\d+)\s*-\s*(x\d+)\s*\)\/\(?\(?\s*(x\d+)\s*\+\s*(x\d+)\s*\)?\/2\s*\)?\*?100\s*$/i);
  if (!implicitAverage) return formulaText;
  const [left, right, avgLeft, avgRight] = implicitAverage.slice(1).map((ref) => ref.toLowerCase());
  return sameRefPair(left, right, avgLeft, avgRight) ? `RD(${left}, ${right})` : formulaText;
}

function averageRefsForFormula(formulaText: string) {
  const normalized = normalizeAverageFormulaDisplay(formulaText.trim());
  const match = normalized.match(/^AVG\s*\(\s*(x\d+)\s*,\s*(x\d+)\s*\)$/i);
  return match ? [match[1].toLowerCase(), match[2].toLowerCase()] as const : null;
}

function sameRefPair(left: string, right: string, otherLeft: string, otherRight: string) {
  return (left === otherLeft && right === otherRight) || (left === otherRight && right === otherLeft);
}

function replaceFormulaLabels(formulaText: string, labels: Map<string, string>) {
  return formulaText.split(/(\{[^}]*\}|\[[^\]]*\])/g).map((part) => {
    if (/^(?:\{[^}]*\}|\[[^\]]*\])$/.test(part)) return part;
    return [...labels.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .reduce((text, [label, alias]) => text.replace(new RegExp(escapeRegExp(label), "g"), alias), part);
  }).join("");
}

function mapJson(value: unknown, visit: (node: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => mapJson(item, visit));
  if (!isRecord(value)) return value;
  const next = visit(value);
  return Object.fromEntries(Object.entries(next).map(([key, item]) => [key, mapJson(item, visit)]));
}

function walkJson(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  Object.values(value).forEach((item) => walkJson(item, visit));
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function isFormulaNode(node: Record<string, unknown>) {
  return !stringField(node.referenceFieldKey) && (node.slotKind === "formula" || node.type === "formulaSlot");
}

function hasAlias(aliases: Set<string>, reference: string) {
  return aliases.has(reference.trim().toLowerCase());
}

function formulaAlias(value: unknown) {
  const text = stringField(value)?.toLowerCase();
  return text && /^[xyz]\d+$/i.test(text) ? text : "";
}

function slotContextLabel(node: Record<string, unknown>) {
  const metadata = isRecord(node.metadata) ? node.metadata : {};
  const source = isRecord(metadata.source) ? metadata.source : metadata;
  return sourceContextLabel(source);
}

function sourceContextLabel(source: unknown) {
  if (!isRecord(source)) return "";
  const product = stringField(source.productName);
  const stage = stringField(source.stageLabel);
  const sequence = stringField(source.sequence);
  const test = stringField(source.testName);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formulaValidationMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid formula expression.";
  if (message.includes("Unsupported formula function")) return "公式函数不支持";
  if (message.includes("only accepts x inputs")) return "该函数只能引用输入项 x";
  if (message.includes("Unexpected trailing expression")) return "计算式后面有多余内容";
  if (message.includes("Expected value")) return "计算式不完整";
  if (message.includes("Expected")) return "计算式括号或运算符不完整";
  if (message.includes("Unclosed")) return "计算式括号或引用未闭合";
  if (message.includes("Unexpected token")) return "计算式包含无法识别的字符";
  return `计算式无效：${message}`;
}
