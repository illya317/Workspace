import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export type PositionDescriptionViewTemplate = {
  id: string;
  label: string;
  fields: string[];
};

function normalizeTemplate(input: unknown): PositionDescriptionViewTemplate | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const id = String(data.id || "").trim();
  const label = String(data.label || "").trim();
  const fields = Array.isArray(data.fields)
    ? Array.from(new Set(data.fields.map((field) => String(field || "").trim()).filter(Boolean)))
    : [];
  if (!id || !label || fields.length === 0) return null;
  return { id, label, fields };
}

export function normalizePositionDescriptionTemplates(input: unknown): PositionDescriptionViewTemplate[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeTemplate).filter((item): item is PositionDescriptionViewTemplate => Boolean(item));
}

export function buildPositionDescriptionTemplateSaveCommand(input: unknown) {
  if (!Array.isArray(input)) return failCommand("岗位说明模板必须是数组", 400, "templates");
  const templates = normalizePositionDescriptionTemplates(input);
  if (templates.length !== input.length) return failCommand("岗位说明模板存在无效条目", 400, "templates");
  return okCommand({ templates });
}
