// @deprecated 兼容入口，新代码请使用 /api/hr/positions/[id] 替代。此文件不再新增业务逻辑。
import { NextResponse } from "next/server";
import { z } from "zod";
import { createProxyHandler } from "@/lib/proxy-route";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
const proxy = createProxyHandler("/api/hr/positions");

async function proxyWithValidatedId(request: Request, params: Promise<{ id: string }>) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  return proxy(request, { params: Promise.resolve({ id: String(parsedParams.data.id) }) });
}

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyWithValidatedId(request, params);
}

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyWithValidatedId(request, params);
}
