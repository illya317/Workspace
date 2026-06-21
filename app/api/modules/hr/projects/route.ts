// @deprecated 兼容入口，新代码请使用 /api/modules/work/plans。本文件纯代理，不再新增业务逻辑。
import { createCompatibilityProxyHandler } from "@workspace/platform/server/api";

const proxy = createCompatibilityProxyHandler("/api/modules/work/plans");

export const GET = proxy;
export const POST = proxy;
