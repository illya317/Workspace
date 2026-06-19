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
