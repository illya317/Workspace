// @deprecated 兼容入口，新代码请使用 /api/hr/* 替代。此文件不再新增业务逻辑。
// ⚠️ 已迁移到 /api/work/plan-members，本文件保留兼容期

import { NextResponse } from "next/server";
import { validateCompatibilityProxyBody } from "@workspace/platform/server/api";

async function proxy(request: Request) {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const url = new URL(request.url);
  const target = new URL("/api/work/plan-members", url.origin);
  target.search = url.search;
  const body = ["POST", "PUT", "PATCH"].includes(request.method)
    ? request.body
    : undefined;
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body,
    // @ts-expect-error duplex for Node.js stream forwarding
    duplex: "half",
  });
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}
