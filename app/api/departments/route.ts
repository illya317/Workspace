// @deprecated 兼容入口，新代码请使用 /api/hr/* 替代。此文件不再新增业务逻辑。
// ⚠️ 已迁移到 /api/hr/departments，本文件保留兼容期
import { NextResponse } from "next/server";
import { validateCompatibilityProxyBody } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/hr/departments", url.origin);
  target.search = url.search;
  target.searchParams.set("pageSize", "99999");
  return fetch(target, { headers: request.headers });
}

export async function POST(request: Request) {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const url = new URL(request.url);
  const target = new URL("/api/hr/departments", url.origin);
  return fetch(target, {
    method: "POST",
    headers: request.headers,
    body: await request.text(),
  });
}
