# 新模块接入模板

新增业务模块（绩效、采购、生产等）时，按此模板落位。不要重新发明结构。

## 目录结构

```
packages/<domain>/
  module.ts             # moduleDef / routes / resourceDefs
  ui/                   # 主要页面和业务组件（≤220 行）
  server/               # 查询、变更、导入、汇总、业务规则
  types/                # 模块共享类型
  constants/            # 模块常量和选项
  import/               # 导入清洗逻辑

app/api/<domain>/
  route.ts              # API 路由壳（≤120 行）：认证、校验、调 package service、返回 DTO

app/<domain>/
  page.tsx              # Server Component facade，只组合 package UI
  ARCHITECTURE.md       # 模块架构说明（数据来源、事实字段、计算字段、权限）

prisma/models/<domain>.prisma  # 领域模型（按 schema 治理规则）
```

## 权限注册

在业务包 `module.ts` 的 `resourceDefs` 添加资源 key；需要同步 RBAC 常量时使用 `@workspace/platform/permissions`：

```
<domain>
<domain>.<submodule>
```

动作只用 4 个：
- `access` — GET
- `write` — POST/PUT/PATCH
- `delete` — DELETE
- `admin` — 授权和系统配置

## Prisma Schema 规则

1. 模型写入 `prisma/models/<domain>.prisma`，**不要**写回 `prisma/schema.prisma`
2. 每个 model 前必须有 `///` 注释，说明业务含义和数据来源
3. DB 只保存事实字段；合计、百分比、毛利等派生结果放 `packages/<domain>/server/summary.ts`
4. 包含审计字段：`editedBy → editor → editedAt → version → createdAt → updatedAt`

## 文件大小硬约束

| 类型 | 上限 | 超限处理 |
|---|---|---|
| 页面 facade | 150 行 | 拆 components/hooks |
| UI 组件 | 新代码目标 220 行；迁移期 package TSX lint fallback 400 行 | 拆子组件 |
| UI hook | 新代码目标 220 行；迁移期 package TSX lint fallback 400 行 | 拆辅助 hook |
| API route | 120 行 | 下沉到 service |
| service | 新代码目标 260 行；迁移期 package TS lint fallback 450 行 | 拆 queries/mutations/summary |
| Core package | 300 行 | Core UI/类型/配置都按 Core fallback |

## 最小可运行示例

### page.tsx

```tsx
import { requireResourceAccess } from "@/server/auth/guard";
import { DomainClient } from "@workspace/<domain>/ui";

export default async function DomainPage() {
  const user = await requireResourceAccess("<domain>");
  return <DomainClient user={user} />;
}
```

### route.ts

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requireAuthorized } from "@workspace/platform/server/auth";
import * as service from "@workspace/<domain>/server";

const querySchema = z.object({
  keyword: z.string().optional(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    await requireAuthorized({ user: payload.userId, resourceKey: "<domain>", action: "access" });
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    keyword: searchParams.get("keyword") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const data = await service.listItems(parsed.data);
  return NextResponse.json({ items: data });
}
```

## 接入检查清单

- [ ] 更新 `README.md` 模块地图
- [ ] 创建 `app/<domain>/ARCHITECTURE.md`
- [ ] 在 `packages/<domain>/module.ts` 的 `resourceDefs` 注册资源 key
- [ ] 设计 `prisma/models/<domain>.prisma`（事实字段 + 审计字段）
- [ ] 运行 `npm run db:validate && npm run schema:check`
- [ ] 实现 `packages/<domain>/server/*`
- [ ] 实现 `app/api/<domain>/route.ts`
- [ ] 实现 `packages/<domain>/ui` 组件，再由 `app/<domain>/page.tsx` 挂载
- [ ] 运行硬约束：`npm run arch:gate && npm run lint -- --max-warnings=0 && npx tsc --noEmit && npm run build`
