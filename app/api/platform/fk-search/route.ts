import { NextResponse } from "next/server";
import { HR_FK_DEFINITIONS } from "@workspace/hr/server/fk-registry";
import { authenticate } from "@workspace/platform/server/auth";
import { createFkRegistry, normalizeLifecycleScope, searchFkOptions } from "@workspace/platform/server/fk-registry";
import { WORK_FK_DEFINITIONS } from "@workspace/work/server/fk-registry";

const registry = createFkRegistry([...HR_FK_DEFINITIONS, ...WORK_FK_DEFINITIONS]);

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fkKey = searchParams.get("fkKey") || "";
  const keyword = searchParams.get("keyword") || "";
  const lifecycleScope = normalizeLifecycleScope(searchParams.get("lifecycleScope"));

  if (!fkKey) {
    return NextResponse.json({ error: "缺少 FK key" }, { status: 400 });
  }

  try {
    const items = await searchFkOptions(registry, { fkKey, keyword, lifecycleScope });
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FK 搜索失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
