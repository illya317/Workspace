// @deprecated 兼容入口，新代码请使用 /api/hr/positions。本文件纯代理，不再新增业务逻辑。
import { createCompatibilityProxyHandler } from "@workspace/platform/server/api";

const proxy = createCompatibilityProxyHandler("/api/hr/positions", { defaultPageSize: 99999 });

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
