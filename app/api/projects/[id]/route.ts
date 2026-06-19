// @deprecated 兼容入口，新代码请使用 /api/hr/* 替代。此文件不再新增业务逻辑。
import { createProxyHandler } from "@/lib/proxy-route";

export const PUT = createProxyHandler("/api/work/plans");
export const DELETE = createProxyHandler("/api/work/plans");
