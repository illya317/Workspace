import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import {
  buildPositionDescriptionTemplateSaveCommand,
  normalizePositionDescriptionTemplates,
  type PositionDescriptionViewTemplate,
} from "./domain/position-description-template-validation";
export { normalizePositionDescriptionTemplates } from "./domain/position-description-template-validation";
export type { PositionDescriptionViewTemplate } from "./domain/position-description-template-validation";

function workspaceDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for position description templates");
}

export function positionDescriptionTemplatePath() {
  return path.join(workspaceDir(), "template", "hr", "position-description-view-templates.json");
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

async function writePositionDescriptionTemplates(templates: PositionDescriptionViewTemplate[]) {
  const filePath = positionDescriptionTemplatePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ templates }, null, 2)}\n`, "utf8");
}

export async function executePositionDescriptionTemplateSaveCommand(input: unknown) {
  const command = buildPositionDescriptionTemplateSaveCommand(input);
  if (!command.ok) return { success: false as const, error: command.issue.message, status: command.issue.status };
  await writePositionDescriptionTemplates(command.data.templates);
  return { success: true as const, templates: command.data.templates };
}
