import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";
import { searchHrAutocomplete } from "@workspace/hr/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity") || "";
  const keyword = searchParams.get("keyword") || "";
  const activeOnly = searchParams.get("active") === "1" || searchParams.get("activeOnly") === "1";

  const result = await searchHrAutocomplete(entity, keyword, activeOnly);
  if (result.status === "unsupported") {
    return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });
  }
  return NextResponse.json({ items: result.items });
}
