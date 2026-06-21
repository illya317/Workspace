import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { WORKSPACE_FK_REGISTRY } from "@workspace/platform/server/fk-registrations";
import { normalizeLifecycleScope, searchFkOptions } from "@workspace/platform/server/fk-registry";

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
    const items = await searchFkOptions(WORKSPACE_FK_REGISTRY, { fkKey, keyword, lifecycleScope });
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FK 搜索失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
