import type { FKFieldConfig } from "../../types";

export function extractFK(form: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = { ...form };
  for (const key of keys) {
    const value = form[key];
    if (value && typeof value === "object" && "id" in value) {
      out[key] = (value as Record<string, unknown>).id;
    }
  }
  return out;
}

export function fk(entity: string, displayField: string): FKFieldConfig {
  return { entity, displayField };
}
