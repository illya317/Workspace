// @deprecated 兼容入口，新代码请使用 /api/hr/positions。本文件纯代理，不再新增业务逻辑。
import { NextResponse } from "next/server";
import { validateCompatibilityProxyBody } from "@workspace/platform/server/api";

async function proxy(request: Request) {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const url = new URL(request.url);
  const target = new URL("/api/hr/positions", url.origin);
  target.search = url.search;
  if (!url.searchParams.has("pageSize")) {
    target.searchParams.set("pageSize", "99999");
  }
  const body = ["POST", "PUT", "PATCH"].includes(request.method)
    ? await request.text()
    : undefined;
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body,
  });
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}

export async function PUT(request: Request) {
  return proxy(request);
}

export async function DELETE(request: Request) {
  return proxy(request);
}
