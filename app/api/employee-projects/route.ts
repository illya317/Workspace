// @deprecated 兼容入口，新代码请使用 /api/hr/* 替代。此文件不再新增业务逻辑。
// ⚠️ 已迁移到 /api/work/plan-members，本文件保留兼容期

import { createCompatibilityProxyHandler } from "@workspace/platform/server/api";

const proxy = createCompatibilityProxyHandler("/api/work/plan-members");

export const GET = proxy;
export const POST = proxy;
