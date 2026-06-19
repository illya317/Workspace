import { z } from "zod";

export type ParsedJson<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<ParsedJson<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "请求体必须是合法 JSON" };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: first?.message || "参数校验失败" };
  }

  return { ok: true, data: result.data };
}

const compatibilityProxyBodySchema = z.object({}).passthrough();

export const routeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateFieldBodySchema = z.object({
  field: z.string().min(1),
  value: z.unknown().optional(),
}).passthrough();

export const rowsRequestBodySchema = z.object({
  rows: z.unknown().optional(),
}).passthrough();

export async function validateCompatibilityProxyBody(request: Request): Promise<ParsedJson<Record<string, unknown>>> {
  if (!["POST", "PUT", "PATCH"].includes(request.method.toUpperCase())) {
    return { ok: true, data: {} };
  }

  return parseJson(request.clone(), compatibilityProxyBodySchema);
}

export function isValidDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === monthIndex &&
    parsed.getDate() === day
  );
}

export function rejectInvalidDateField(field: string, value: unknown, dateFields: readonly string[]) {
  if (dateFields.includes(field) && !isValidDateValue(value)) return null;
  return { field, value };
}
