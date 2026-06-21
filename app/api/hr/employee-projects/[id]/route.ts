// @deprecated 兼容入口，新代码请使用 /api/work/plan-members/:id。本文件纯代理，不再新增业务逻辑。
import { createValidatedIdProxyHandler } from "@workspace/platform/server/api";

const proxy = createValidatedIdProxyHandler("/api/work/plan-members");

export const PUT = proxy;
export const DELETE = proxy;
