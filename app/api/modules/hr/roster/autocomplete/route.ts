import { NextResponse } from "next/server";
import { HR_FK_REGISTRY } from "@workspace/hr/server/fk-registry";
import { normalizeLifecycleScope, searchFkOptions } from "@workspace/platform/server/fk-registry";
import { requireApiAccess, authorize, checkHRAccess } from "@workspace/platform/server/auth";
import { searchHrAutocomplete } from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  const { searchParams } = new URL(request.url);
  const fkKey = searchParams.get("fkKey") || "";
  const entity = searchParams.get("entity") || "";
  const keyword = searchParams.get("keyword") || "";
  const activeOnly = searchParams.get("active") === "1" || searchParams.get("activeOnly") === "1";
  const lifecycleScopeRaw = searchParams.get("lifecycleScope");
  const lifecycleScope = lifecycleScopeRaw ? normalizeLifecycleScope(lifecycleScopeRaw) : undefined;

  if (fkKey) {
    try {
      const definition = HR_FK_REGISTRY.require(fkKey);
      const allowed = await authorize({
        user: payload.userId,
        resourceKey: definition.permission.resourceKey,
        action: definition.permission.action,
      });
      if (!allowed) return jsonErrorResponse("无权限", 403);
      const params = Object.fromEntries(searchParams.entries());
      const items = await searchFkOptions(HR_FK_REGISTRY, { fkKey, keyword, lifecycleScope, userId: payload.userId, params });
      return NextResponse.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FK 搜索失败";
      return jsonErrorResponse(message, 400);
    }
  }

  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return jsonErrorResponse("无权限", 403);
  }

  const result = await searchHrAutocomplete(entity, keyword, activeOnly);
  if (result.status === "unsupported") {
    return jsonErrorResponse("不支持的实体类型", 400);
  }
  return NextResponse.json({ items: result.items });
}
