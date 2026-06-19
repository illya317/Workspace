// @deprecated 兼容入口，新代码请使用 /api/hr/edps/[id] 替代。此文件不再新增业务逻辑。
import { NextResponse } from "next/server";
import { createProxyHandler } from "@/lib/proxy-route";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const proxy = createProxyHandler("/api/hr/edps");

async function proxyWithValidatedId(request: Request, params: Promise<{ id: string }>) {
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  return proxy(request, { params: Promise.resolve({ id: String(parsedParams.data.id) }) });
}

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyWithValidatedId(request, params);
}

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyWithValidatedId(request, params);
}
