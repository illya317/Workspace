import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

function workspaceDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for UI component verification storage");
}

export function uiComponentVerifiedPath() {
  return path.join(workspaceDir(), "config", "ui-component-verified.json");
}

export async function readUiComponentVerifiedNames(): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await readFile(uiComponentVerifiedPath(), "utf8")) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const names = (raw as Record<string, unknown>).verified;
      if (Array.isArray(names)) {
        return new Set(names.map((name) => String(name)).filter(Boolean));
      }
    }
  } catch {
    // Missing or invalid config falls back to empty set.
  }
  return new Set();
}

export async function writeUiComponentVerifiedNames(names: Set<string>) {
  const filePath = uiComponentVerifiedPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const sorted = Array.from(names).sort();
  await writeFile(filePath, `${JSON.stringify({ verified: sorted }, null, 2)}\n`, "utf8");
}

export async function toggleUiComponentVerified(name: string): Promise<boolean> {
  const names = await readUiComponentVerifiedNames();
  const next = new Set(names);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  await writeUiComponentVerifiedNames(next);
  return next.has(name);
}
