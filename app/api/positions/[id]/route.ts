// @deprecated 兼容入口，新代码请使用 /api/hr/positions/[id] 替代。此文件不再新增业务逻辑。
import { createValidatedIdProxyHandler } from "@workspace/platform/server/api";

const proxy = createValidatedIdProxyHandler("/api/hr/positions");

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxy(request, { params });
}

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxy(request, { params });
}
