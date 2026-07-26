import { isDeepStrictEqual } from "node:util";

export type QcTemplateStructurePatch =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "copy" | "move"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };

const allowedRoots = new Set(["document", "fieldModel"]);
const unsafeSegments = new Set(["__proto__", "prototype", "constructor"]);
const MAX_INSPECTION_CHARS = 40_000;
const MAX_OUTLINE_CHILDREN = 120;
const MAX_TEMPLATE_PAYLOAD_CHARS = 10_000_000;

export function inspectQcTemplateStructure(input: {
  document: unknown;
  fieldModel: unknown;
  path: string;
  view: "outline" | "value";
}) {
  const root = { document: input.document, fieldModel: input.fieldModel };
  const segments = parsePointer(input.path);
  if (!segments.ok) return segments;
  const resolved = readPointer(root, segments.segments);
  if (!resolved.ok) return resolved;
  const outline = outlineValue(resolved.value, input.path);
  if (input.view === "outline") return { ok: true as const, ...outline };
  const serialized = safeJson(resolved.value);
  if (!serialized.ok) return serialized;
  if (serialized.value.length > MAX_INSPECTION_CHARS) {
    return {
      ok: true as const,
      ...outline,
      valueOmitted: true,
      message: `该子树约 ${serialized.value.length} 字符，超过单次读取上限；请按 outline 中的子路径继续查看。`,
    };
  }
  return { ok: true as const, ...outline, value: resolved.value, valueOmitted: false };
}

export function applyQcTemplateStructurePatches(input: {
  document: unknown;
  fieldModel: unknown;
  patches: QcTemplateStructurePatch[];
}) {
  const root: Record<string, unknown> = {
    document: structuredClone(input.document),
    fieldModel: structuredClone(input.fieldModel),
  };
  for (const [index, patch] of input.patches.entries()) {
    const result = applyPatch(root, patch);
    if (!result.ok) {
      return { ok: false as const, error: `结构补丁 ${index + 1} 执行失败：${result.error}` };
    }
  }
  if (!isRecord(root.document) || !isRecord(root.fieldModel)) {
    return { ok: false as const, error: "结构补丁必须保留 document 和 fieldModel 两个 JSON 对象" };
  }
  const payload = safeJson(root);
  if (!payload.ok) return payload;
  if (payload.value.length > MAX_TEMPLATE_PAYLOAD_CHARS) {
    return { ok: false as const, error: "结构补丁后的模板过大，请拆分或删除不再需要的内容" };
  }
  const structureIssue = validateEditableStructure(root.document, root.fieldModel);
  if (structureIssue) return { ok: false as const, error: structureIssue };
  return {
    ok: true as const,
    document: root.document,
    fieldModel: root.fieldModel,
    applied: input.patches.map(patchSummary),
  };
}

function applyPatch(root: Record<string, unknown>, patch: QcTemplateStructurePatch) {
  const path = parsePointer(patch.path);
  if (!path.ok) return path;
  if (patch.op === "test") {
    const current = readPointer(root, path.segments);
    if (!current.ok) return current;
    return isDeepStrictEqual(current.value, patch.value)
      ? { ok: true as const }
      : { ok: false as const, error: `路径 ${patch.path} 的当前值与 test 预期不一致` };
  }
  if (patch.op === "copy" || patch.op === "move") {
    const from = parsePointer(patch.from);
    if (!from.ok) return from;
    if (patch.op === "move" && isSameOrDescendant(path.segments, from.segments)) {
      return { ok: false as const, error: "不能把节点移动到自身或其子节点" };
    }
    const source = readPointer(root, from.segments);
    if (!source.ok) return source;
    const value = structuredClone(source.value);
    if (patch.op === "move") {
      const removed = removePointer(root, from.segments);
      if (!removed.ok) return removed;
    }
    return addPointer(root, path.segments, value);
  }
  if (patch.op === "remove") return removePointer(root, path.segments);
  if (patch.op === "replace" && "value" in patch) {
    return replacePointer(root, path.segments, structuredClone(patch.value));
  }
  if (patch.op === "add" && "value" in patch) {
    return addPointer(root, path.segments, structuredClone(patch.value));
  }
  return { ok: false as const, error: `不支持的结构操作：${patch.op}` };
}

function parsePointer(path: string) {
  if (!path.startsWith("/") || path === "/") {
    return { ok: false as const, error: "结构路径必须从 /document 或 /fieldModel 开始" };
  }
  const rawSegments = path.slice(1).split("/");
  const segments: string[] = [];
  for (const raw of rawSegments) {
    if (/~(?![01])/u.test(raw)) return { ok: false as const, error: `结构路径包含无效转义：${path}` };
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (unsafeSegments.has(segment)) return { ok: false as const, error: `结构路径包含不安全字段：${segment}` };
    segments.push(segment);
  }
  if (!allowedRoots.has(segments[0] ?? "")) {
    return { ok: false as const, error: "只能修改模板的 document 或 fieldModel" };
  }
  return { ok: true as const, segments };
}

function readPointer(root: unknown, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = arrayIndex(segment, current.length, false);
      if (!index.ok) return index;
      current = current[index.index];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { ok: false as const, error: `结构路径不存在：/${segments.map(escapePointer).join("/")}` };
    }
    current = current[segment];
  }
  return { ok: true as const, value: current };
}

function parentPointer(root: Record<string, unknown>, segments: string[]) {
  if (segments.length === 0) return { ok: false as const, error: "不能修改模板根对象" };
  const parentSegments = segments.slice(0, -1);
  const parent = readPointer(root, parentSegments);
  if (!parent.ok) return parent;
  return { ok: true as const, parent: parent.value, key: segments.at(-1)! };
}

function addPointer(root: Record<string, unknown>, segments: string[], value: unknown) {
  const target = parentPointer(root, segments);
  if (!target.ok) return target;
  if (Array.isArray(target.parent)) {
    if (target.key === "-") {
      target.parent.push(value);
      return { ok: true as const };
    }
    const index = arrayIndex(target.key, target.parent.length, true);
    if (!index.ok) return index;
    target.parent.splice(index.index, 0, value);
    return { ok: true as const };
  }
  if (!isRecord(target.parent)) return { ok: false as const, error: "add 的父路径不是对象或数组" };
  target.parent[target.key] = value;
  return { ok: true as const };
}

function replacePointer(root: Record<string, unknown>, segments: string[], value: unknown) {
  const target = parentPointer(root, segments);
  if (!target.ok) return target;
  if (Array.isArray(target.parent)) {
    const index = arrayIndex(target.key, target.parent.length, false);
    if (!index.ok) return index;
    target.parent[index.index] = value;
    return { ok: true as const };
  }
  if (!isRecord(target.parent) || !Object.hasOwn(target.parent, target.key)) {
    return { ok: false as const, error: "replace 的目标路径不存在" };
  }
  target.parent[target.key] = value;
  return { ok: true as const };
}

function removePointer(root: Record<string, unknown>, segments: string[]) {
  if (segments.length === 1) return { ok: false as const, error: "不能删除 document 或 fieldModel 根对象" };
  const target = parentPointer(root, segments);
  if (!target.ok) return target;
  if (Array.isArray(target.parent)) {
    const index = arrayIndex(target.key, target.parent.length, false);
    if (!index.ok) return index;
    target.parent.splice(index.index, 1);
    return { ok: true as const };
  }
  if (!isRecord(target.parent) || !Object.hasOwn(target.parent, target.key)) {
    return { ok: false as const, error: "remove 的目标路径不存在" };
  }
  delete target.parent[target.key];
  return { ok: true as const };
}

function arrayIndex(segment: string, length: number, allowEnd: boolean) {
  if (!/^(0|[1-9]\d*)$/u.test(segment)) return { ok: false as const, error: `数组下标无效：${segment}` };
  const index = Number(segment);
  const limit = allowEnd ? length : length - 1;
  return index <= limit
    ? { ok: true as const, index }
    : { ok: false as const, error: `数组下标越界：${segment}` };
}

function outlineValue(value: unknown, path: string) {
  if (Array.isArray(value)) {
    const children = value.slice(0, MAX_OUTLINE_CHILDREN).map((item, index) => outlineChild(item, `${path}/${index}`, String(index)));
    return { path, kind: "array" as const, size: value.length, truncated: value.length > children.length, children };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).slice(0, MAX_OUTLINE_CHILDREN);
    const children = entries.map(([key, item]) => outlineChild(item, `${path}/${escapePointer(key)}`, key));
    return { path, kind: "object" as const, size: Object.keys(value).length, truncated: Object.keys(value).length > children.length, children };
  }
  return { path, kind: primitiveKind(value), size: 1, truncated: false, children: [], value };
}

function validateEditableStructure(document: Record<string, unknown>, fieldModel: Record<string, unknown>) {
  if (!Array.isArray(document.blocks)) return "document.blocks 必须是数组";
  const blockIds = new Set<string>();
  for (const [blockIndex, block] of document.blocks.entries()) {
    const path = `document.blocks[${blockIndex}]`;
    if (!isRecord(block) || typeof block.id !== "string" || !block.id.trim()) return `${path}.id 必须是非空字符串`;
    if (blockIds.has(block.id)) return `${path}.id 与其他区块重复`;
    blockIds.add(block.id);
    if (block.type === "heading") {
      if (![1, 2, 3, 4].includes(Number(block.level)) || typeof block.text !== "string") return `${path} 标题结构无效`;
      continue;
    }
    if (block.type === "paragraph") {
      const issue = validateParts(block.parts, `${path}.parts`);
      if (issue) return issue;
      continue;
    }
    if (block.type === "table") {
      if (!Array.isArray(block.rows)) return `${path}.rows 必须是数组`;
      for (const [rowIndex, row] of block.rows.entries()) {
        if (!isRecord(row) || !Array.isArray(row.cells)) return `${path}.rows[${rowIndex}].cells 必须是数组`;
        for (const [cellIndex, cell] of row.cells.entries()) {
          const cellPath = `${path}.rows[${rowIndex}].cells[${cellIndex}]`;
          if (!isRecord(cell)) return `${cellPath} 必须是对象`;
          const issue = validateParts(cell.parts, `${cellPath}.parts`);
          if (issue) return issue;
        }
      }
      continue;
    }
    if (block.type === "attachment") {
      if (typeof block.title !== "string" || typeof block.text !== "string" || typeof block.fieldKey !== "string") {
        return `${path} 附件结构无效`;
      }
      continue;
    }
    if (block.type !== "pageBreak") return `${path}.type 不受支持`;
  }
  if (!Array.isArray(fieldModel.fields) && !isRecord(fieldModel.fields)) {
    return "fieldModel.fields 必须是对象或数组";
  }
  const fields = Array.isArray(fieldModel.fields) ? fieldModel.fields : Object.values(fieldModel.fields);
  if (fields.some((field) => !isRecord(field))) return "fieldModel.fields 中的字段必须是对象";
  if (fieldModel.formulas !== undefined && !isRecord(fieldModel.formulas)) {
    return "fieldModel.formulas 必须是对象";
  }
  if (isRecord(fieldModel.formulas) && Object.values(fieldModel.formulas).some((formula) => !isRecord(formula))) {
    return "fieldModel.formulas 中的公式必须是对象";
  }
  if (fieldModel.formulaTemplates !== undefined && !Array.isArray(fieldModel.formulaTemplates)) {
    return "fieldModel.formulaTemplates 必须是数组";
  }
  if (Array.isArray(fieldModel.formulaTemplates) && fieldModel.formulaTemplates.some((template) => !isRecord(template))) {
    return "fieldModel.formulaTemplates 中的模板必须是对象";
  }
  return null;
}

function validateParts(parts: unknown, path: string) {
  if (!Array.isArray(parts)) return `${path} 必须是数组`;
  for (const [index, part] of parts.entries()) {
    if (!isRecord(part)) return `${path}[${index}] 必须是对象`;
    if (part.type === "text") {
      if (typeof part.text !== "string") return `${path}[${index}].text 必须是字符串`;
      continue;
    }
    if (!["fieldSlot", "formulaSlot", "dateSlot", "signatureSlot"].includes(String(part.type))) {
      return `${path}[${index}].type 不受支持`;
    }
    if (typeof part.fieldKey !== "string" || !part.fieldKey.trim()) return `${path}[${index}].fieldKey 必须是非空字符串`;
  }
  return null;
}

function outlineChild(value: unknown, path: string, key: string) {
  if (Array.isArray(value)) return { key, path, kind: "array", size: value.length, summary: null };
  if (isRecord(value)) {
    const summary = [value.type, value.id, value.title, value.label, value.fieldKey, value.name]
      .find((item): item is string => typeof item === "string" && Boolean(item.trim())) ?? null;
    return { key, path, kind: "object", size: Object.keys(value).length, summary };
  }
  const text = typeof value === "string" && value.length > 160 ? `${value.slice(0, 157)}...` : value;
  return { key, path, kind: primitiveKind(value), size: 1, summary: text };
}

function patchSummary(patch: QcTemplateStructurePatch) {
  return {
    op: patch.op,
    path: patch.path,
    ...("from" in patch ? { from: patch.from } : {}),
  };
}

function safeJson(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? { ok: true as const, value: serialized }
      : { ok: false as const, error: "目标结构不是可序列化 JSON" };
  } catch {
    return { ok: false as const, error: "目标结构不是可序列化 JSON" };
  }
}

function isSameOrDescendant(path: string[], from: string[]) {
  return path.length >= from.length && from.every((segment, index) => path[index] === segment);
}

function escapePointer(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function primitiveKind(value: unknown) {
  return value === null ? "null" : typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
