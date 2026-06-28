import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

export type PositionDescriptionViewTemplate = {
  id: string;
  label: string;
  fields: string[];
};

function workspaceDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for position description templates");
}

export function positionDescriptionTemplatePath() {
  return path.join(workspaceDir(), "template", "hr", "position-description-view-templates.json");
}

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
  return input
    .map(normalizeTemplate)
    .filter((template): template is PositionDescriptionViewTemplate => Boolean(template));
}

export async function readPositionDescriptionTemplates() {
  try {
    const raw = JSON.parse(await readFile(positionDescriptionTemplatePath(), "utf8")) as unknown;
    if (Array.isArray(raw)) return normalizePositionDescriptionTemplates(raw);
    if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).templates)) {
      return normalizePositionDescriptionTemplates((raw as Record<string, unknown>).templates);
    }
  } catch {
    // Missing or invalid template files fall back to no custom templates.
  }
  return [];
}

export async function writePositionDescriptionTemplates(templates: PositionDescriptionViewTemplate[]) {
  const filePath = positionDescriptionTemplatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ templates }, null, 2)}\n`, "utf8");
}
