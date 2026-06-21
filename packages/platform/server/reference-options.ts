import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "./auth";
import type { AuthPayload } from "./auth-token";
import { WORKSPACE_FK_REGISTRY } from "./fk-registrations";
import { normalizeLifecycleScope, searchFkOptions } from "./fk-registry";

export const referenceOptionsQuerySchema = z.object({
  fkKey: z.string().min(1),
  keyword: z.string().catch(""),
  lifecycleScope: z.string().optional(),
}).passthrough();

type ReferenceOptionsQuery = z.infer<typeof referenceOptionsQuerySchema>;

export function createReferenceOptionsRoute({
  scope,
  validate,
}: {
  scope: string;
  validate: (input: unknown) => { success: true; data: ReferenceOptionsQuery } | { success: false };
}) {
  return async function GET(request: Request, user?: AuthPayload) {
    const payload = user ?? await authenticate(request);
    if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const parsed = validate(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });

    try {
      const definition = WORKSPACE_FK_REGISTRY.require(parsed.data.fkKey);
      if (definition.scope !== scope) return NextResponse.json({ error: "无权限" }, { status: 403 });
      if (!(await authorize({ user: payload.userId, ...definition.permission }))) {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }

      const items = await searchFkOptions(WORKSPACE_FK_REGISTRY, {
        fkKey: parsed.data.fkKey,
        keyword: parsed.data.keyword,
        lifecycleScope: normalizeLifecycleScope(parsed.data.lifecycleScope),
      });
      return NextResponse.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : "候选项查询失败";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}
