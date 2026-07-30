import type { FieldConfig, TabConfig } from "@workspace/hr/types";

export interface GenericTabCrudPermissions {
  canCreate: boolean;
  canDelete: boolean;
}

export function resolveGenericTabCrudCapabilities(
  config: Pick<TabConfig, "canCreate" | "canDelete">,
  permissions?: GenericTabCrudPermissions,
) {
  return {
    canCreate: permissions?.canCreate === true && config.canCreate === true,
    canDelete: permissions?.canDelete === true && config.canDelete === true,
  };
}

export function genericTabCreateFields(fields: FieldConfig[]) {
  return fields.filter((field) => !field.hidden && (field.editable === true || field.createOnly === true));
}

export function emptyGenericTabCreateDraft(fields: FieldConfig[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === "boolean" ? false : ""]));
}

export function isGenericTabCreateReady(fields: FieldConfig[], draft: Record<string, unknown>) {
  return fields.filter((field) => field.required).every((field) => hasCreateValue(field, draft[field.key]));
}

export function buildGenericTabCreateBody(config: Pick<TabConfig, "buildCreateBody">, draft: Record<string, unknown>) {
  return config.buildCreateBody ? config.buildCreateBody(draft) : { ...draft };
}

export function buildGenericTabDeleteRequest(
  config: Pick<TabConfig, "apiPath" | "rowPath">,
  row: Record<string, unknown>,
) {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("记录ID无效");
  const version = Number(row.version);
  const headers: Record<string, string> = {};
  if (Number.isInteger(version) && version >= 0) headers["If-Match"] = String(version);
  return {
    path: config.rowPath?.(id) ?? `${config.apiPath}/${id}`,
    headers,
  };
}

function hasCreateValue(field: FieldConfig, value: unknown) {
  if (field.type === "fk") {
    if (typeof value === "number") return Number.isInteger(value) && value > 0;
    return Boolean(
      value
      && typeof value === "object"
      && "id" in value
      && Number.isInteger(Number((value as { id?: unknown }).id))
      && Number((value as { id?: unknown }).id) > 0,
    );
  }
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}
