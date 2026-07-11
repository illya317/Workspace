import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "./auth";
import type { AuthPayload } from "./auth-token";
import { normalizeLifecycleScope, searchFkOptions, type FkRegistry, type FkSearchParams } from "./fk-registry";
import { jsonErrorResponse } from "./api";

export const referenceOptionsQuerySchema = z.object({
  fkKey: z.string().min(1),
  keyword: z.string().catch(""),
  lifecycleScope: z.string().optional(),
}).passthrough();

type ReferenceOptionsQuery = z.infer<typeof referenceOptionsQuerySchema>;

export function createReferenceOptionsRoute({
  registry,
  scope,
  validate,
}: {
  registry: FkRegistry;
  scope: string;
  validate: (input: unknown) => { success: true; data: ReferenceOptionsQuery } | { success: false };
}) {
  return async function GET(request: Request, user?: AuthPayload) {
    const payload = user ?? await authenticate(request);
    if (!payload) return jsonErrorResponse("未登录", 401);

    const { searchParams } = new URL(request.url);
    const parsed = validate(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) return jsonErrorResponse("参数错误", 400);
    const params = referenceSearchParams(searchParams);

    try {
      const definition = registry.require(parsed.data.fkKey);
      if (definition.scope !== scope) return jsonErrorResponse("无权限", 403);
      if (!(await authorize({ user: payload.userId, ...definition.permission }))) {
        return jsonErrorResponse("无权限", 403);
      }

      const items = await searchFkOptions(registry, {
        fkKey: parsed.data.fkKey,
        keyword: parsed.data.keyword,
        lifecycleScope: parsed.data.lifecycleScope ? normalizeLifecycleScope(parsed.data.lifecycleScope) : undefined,
        userId: payload.userId,
        params,
      });
      return NextResponse.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : "候选项查询失败";
      return jsonErrorResponse(message, 400);
    }
  };
}

function referenceSearchParams(searchParams: URLSearchParams): FkSearchParams {
  const params: FkSearchParams = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "fkKey" || key === "keyword" || key === "lifecycleScope") continue;
    params[key] = value;
  }
  return params;
}
