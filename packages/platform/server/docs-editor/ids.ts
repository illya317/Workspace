export const GENERATED_QC_SPACE_ID = "qc-official";
export const GENERATED_QC_TEMPLATE_PREFIX = "generated-qc:";

export function isGeneratedQcTemplateId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(GENERATED_QC_TEMPLATE_PREFIX);
}

export function numberFromString(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function templateIdFromString(value: string | number | null | undefined) {
  if (isGeneratedQcTemplateId(value)) return value;
  return numberFromString(value) ?? 0;
}
