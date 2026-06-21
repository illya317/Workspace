import { NextResponse } from "next/server";
import { HR_FK_DEFINITIONS } from "@workspace/hr/server/fk-registry";
import { createFkRegistry, normalizeLifecycleScope, searchFkOptions } from "@workspace/platform/server/fk-registry";
import { requireApiAccess, authorize, checkHRAccess } from "@workspace/platform/server/auth";
import { searchHrAutocomplete } from "@workspace/hr/server";

const registry = createFkRegistry(HR_FK_DEFINITIONS);

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  const { searchParams } = new URL(request.url);
  const fkKey = searchParams.get("fkKey") || "";
  const entity = searchParams.get("entity") || "";
  const keyword = searchParams.get("keyword") || "";
  const activeOnly = searchParams.get("active") === "1" || searchParams.get("activeOnly") === "1";
  const lifecycleScope = normalizeLifecycleScope(searchParams.get("lifecycleScope"));

  if (fkKey) {
    try {
      const definition = registry.require(fkKey);
      const allowed = await authorize({
        user: payload.userId,
        resourceKey: definition.permission.resourceKey,
        action: definition.permission.action,
      });
      if (!allowed) return NextResponse.json({ error: "无权限" }, { status: 403 });
      const items = await searchFkOptions(registry, { fkKey, keyword, lifecycleScope });
      return NextResponse.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FK 搜索失败";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const result = await searchHrAutocomplete(entity, keyword, activeOnly);
  if (result.status === "unsupported") {
    return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });
  }
  return NextResponse.json({ items: result.items });
}
