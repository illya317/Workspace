import type { FKFieldConfig } from "../../types";

export function extractFK(form: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = { ...form };
  for (const k of keys) {
    const v = form[k];
    if (v && typeof v === "object" && v !== null && "id" in v) {
      out[k] = (v as Record<string, unknown>).id;
    }
  }
  return out;
}

export function fk(entity: string, displayField: string): FKFieldConfig {
  return { entity, displayField };
}
