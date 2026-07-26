import "server-only";

export type WorkspaceAnalysisNestedValueRow = {
  readonly path: string;
  readonly valueKind: "null" | "text" | "number" | "boolean" | "array" | "object";
  readonly textValue: string | null;
  readonly numberValue: number | null;
  readonly booleanValue: boolean | null;
};

/**
 * Turns a public nested DTO value into stable scalar rows without interpreting
 * domain-owned keys. Owners add their own parent identifiers before exposing
 * the rows as a child analysis source.
 */
export function flattenWorkspaceAnalysisNestedValue(
  value: unknown,
  rootPath = "$",
): WorkspaceAnalysisNestedValueRow[] {
  const rows: WorkspaceAnalysisNestedValueRow[] = [];
  visit(value, rootPath, rows, new WeakSet<object>());
  return rows;
}

function visit(
  value: unknown,
  path: string,
  rows: WorkspaceAnalysisNestedValueRow[],
  ancestors: WeakSet<object>,
) {
  if (value === null || value === undefined) {
    rows.push(row(path, "null", null));
    return;
  }
  if (typeof value === "string") {
    rows.push(row(path, "text", value));
    return;
  }
  if (typeof value === "number") {
    rows.push({ path, valueKind: "number", textValue: String(value), numberValue: value, booleanValue: null });
    return;
  }
  if (typeof value === "boolean") {
    rows.push({ path, valueKind: "boolean", textValue: String(value), numberValue: null, booleanValue: value });
    return;
  }
  if (value instanceof Date) {
    rows.push(row(path, "text", value.toISOString()));
    return;
  }
  if (typeof value !== "object") {
    rows.push(row(path, "text", String(value)));
    return;
  }
  if (ancestors.has(value)) {
    throw new Error(`经营分析嵌套值存在循环引用: ${path}`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (value.length === 0) rows.push(row(path, "array", "[]"));
    else value.forEach((item, index) => visit(item, `${path}[${index}]`, rows, ancestors));
  } else {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) rows.push(row(path, "object", "{}"));
    else for (const [key, child] of entries) visit(child, appendMember(path, key), rows, ancestors);
  }
  ancestors.delete(value);
}

function appendMember(path: string, key: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function row(
  path: string,
  valueKind: WorkspaceAnalysisNestedValueRow["valueKind"],
  textValue: string | null,
): WorkspaceAnalysisNestedValueRow {
  return { path, valueKind, textValue, numberValue: null, booleanValue: null };
}
