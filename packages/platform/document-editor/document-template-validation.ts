import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "../server/domain-validation";
import { normalizeDocumentFormulaRules } from "./document-template-formula-validation";
import { normalizeDocumentSlotPayload } from "./document-template-slot-normalization";

const deprecatedFormulaKindKey = ["formula", "Kind"].join("");
const referenceAliasPattern = /^[xyp]\d+$/i;

type ReferenceCandidate = { alias: string; fieldKey: string; context: string };

export function normalizeDocumentTemplatePayload(
  document: unknown,
  fieldModel: unknown,
): DomainValidationResult<{ document: unknown; fieldModel: unknown }> {
  const slots = normalizeDocumentSlotPayload(document, fieldModel);
  if (slots.ok === false) return failFrom(slots);
  const formulas = normalizeDocumentFormulaRules(slots.data.document, slots.data.fieldModel);
  if (formulas.ok === false) return failFrom(formulas);
  const normalizedDocument = normalizeDocumentReferences(formulas.data.document, formulas.data.fieldModel);
  if (normalizedDocument.ok === false) return failFrom(normalizedDocument);
  return okCommand({ document: normalizedDocument.data, fieldModel: formulas.data.fieldModel });
}

function normalizeDocumentReferences(value: unknown, fieldModel?: unknown): DomainValidationResult<unknown> {
  if (value === undefined) return okCommand(undefined);
  const candidates = collectReferenceCandidates(value);
  const byFieldKey = new Set([...candidates.map((candidate) => candidate.fieldKey), ...collectFieldModelKeys(fieldModel)]);
  const byAlias = new Map<string, string>();
  const byContextFieldKey = new Map<string, Set<string>>();
  const byContextAlias = new Map<string, Map<string, string>>();
  candidates.forEach((candidate) => {
    if (!byAlias.has(candidate.alias)) byAlias.set(candidate.alias, candidate.fieldKey);
    const fieldKeys = byContextFieldKey.get(candidate.context) ?? new Set<string>();
    fieldKeys.add(candidate.fieldKey);
    byContextFieldKey.set(candidate.context, fieldKeys);
    const contextMap = byContextAlias.get(candidate.context) ?? new Map<string, string>();
    if (!contextMap.has(candidate.alias)) contextMap.set(candidate.alias, candidate.fieldKey);
    byContextAlias.set(candidate.context, contextMap);
  });
  return normalizeReferenceNodes(value, { byAlias, byContextAlias, byContextFieldKey, byFieldKey });
}

function collectReferenceCandidates(value: unknown) {
  const candidates: ReferenceCandidate[] = [];
  walkDocumentJson(value, (node) => {
    const alias = referenceAlias(node.alias);
    const fieldKey = stringField(node.fieldKey);
    if (!alias || !fieldKey || isReferenceNode(node)) return;
    candidates.push({ alias, fieldKey, context: slotContextLabel(node) });
  });
  return candidates;
}

function collectFieldModelKeys(value: unknown) {
  if (!isRecord(value)) return [];
  const keys = new Set<string>();
  const fields = value.fields;
  if (Array.isArray(fields)) {
    fields.forEach((field) => {
      if (!isRecord(field)) return;
      const key = stringField(field.fieldKey) || stringField(field.key);
      if (key) keys.add(key);
    });
  } else if (isRecord(fields)) {
    Object.keys(fields).forEach((key) => keys.add(key));
  }
  const formulas = value.formulas;
  if (isRecord(formulas)) Object.keys(formulas).forEach((key) => keys.add(key));
  return Array.from(keys);
}

function normalizeReferenceNodes(
  value: unknown,
  context: {
    byAlias: Map<string, string>;
    byContextAlias: Map<string, Map<string, string>>;
    byContextFieldKey: Map<string, Set<string>>;
    byFieldKey: Set<string>;
  },
): DomainValidationResult<unknown> {
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const normalized = normalizeReferenceNodes(item, context);
      if (normalized.ok === false) return failFrom(normalized);
      items.push(normalized.data);
    }
    return okCommand(items);
  }
  if (!isRecord(value)) return okCommand(value);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === deprecatedFormulaKindKey) continue;
    const normalized = normalizeReferenceNodes(item, context);
    if (normalized.ok === false) return failFrom(normalized);
    next[key] = normalized.data;
  }
  if (!isReferenceNode(next)) return okCommand(next);

  const referenceFieldKey = stringField(next.referenceFieldKey);
  if (!referenceFieldKey) return failCommand("请输入引用来源编号", 400, "document.referenceFieldKey");
  const nodeContext = slotContextLabel(next);
  const fieldKeys = nodeContext ? context.byContextFieldKey.get(nodeContext) ?? new Set<string>() : context.byFieldKey;
  if (fieldKeys.has(referenceFieldKey) || context.byFieldKey.has(referenceFieldKey) || isSystemReference(referenceFieldKey)) {
    return okCommand({ ...next, referenceFieldKey });
  }
  const alias = referenceAlias(referenceFieldKey);
  if (!alias) return failCommand("请输入引用来源编号", 400, "document.referenceFieldKey");
  const resolved = nodeContext ? context.byContextAlias.get(nodeContext)?.get(alias) : context.byAlias.get(alias);
  if (!resolved) return failCommand(`本检测项目内不存在引用来源编号：${alias}`, 400, "document.referenceFieldKey");
  return okCommand({ ...next, referenceFieldKey: resolved });
}

function walkDocumentJson(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkDocumentJson(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  Object.values(value).forEach((item) => walkDocumentJson(item, visit));
}

function referenceAlias(value: unknown) {
  const text = stringField(value)?.toLowerCase();
  return text && referenceAliasPattern.test(text) ? text : "";
}

function isReferenceNode(node: Record<string, unknown>) {
  return node.slotKind === "reference" || !!stringField(node.referenceFieldKey);
}

function isSystemReference(referenceFieldKey: string) {
  return referenceFieldKey.startsWith("auth/");
}

function slotContextLabel(node: Record<string, unknown>) {
  const metadata = isRecord(node.metadata) ? node.metadata : {};
  const source = isRecord(metadata.source) ? metadata.source : metadata;
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

function failFrom<T>(result: { ok: false; issue: DomainValidationIssue }): DomainValidationResult<T> {
  return { ok: false, issue: result.issue };
}
