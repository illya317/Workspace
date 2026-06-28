# 新模块接入模板

新增业务模块（绩效、采购、生产等）时，按此模板落位。不要重新发明结构。

## 目录结构

```
packages/<domain>/
  module.ts             # moduleDef / routes / resourceDefs
  ui/                   # 主要页面和业务组件（新代码目标 ≤220 行）
  server/               # 查询、变更、导入、汇总、业务规则
  types/                # 模块共享类型
  constants/            # 模块常量和选项
  import/               # 导入清洗逻辑

app/api/modules/<domain>/<l2>/
  route.ts              # API 路由壳（≤120 行）：认证、校验、调 package service、返回 DTO

app/(modules)/<domain>/<l2>/
  page.tsx              # Server Component facade，只组合 package UI
  ARCHITECTURE.md       # 模块架构说明（数据来源、事实字段、计算字段、权限）

prisma/models/<domain>.prisma  # 领域模型（按 schema 治理规则）
```

## 权限注册

在 `packages/platform/module-registry.ts` 注册 L1/L2，并保持四件事统一：页面 route、导航 URL、resource/RBAC key、API prefix + guard。业务包 `module.ts` 只放本业务包实现和导出；需要同步 RBAC 常量时使用 `@workspace/platform/permissions`：

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
| UI 组件 | 新代码目标 220 行；package TSX lint 硬上限 500 行 | 拆子组件，但拆分必须缩小 interface 或提升 locality |
| UI hook | 新代码目标 220 行；package TSX lint 硬上限 500 行 | 拆辅助 hook，但避免纯搬家式 helper |
| API route | 120 行 | 下沉到 service |
| service | 新代码目标 260 行；package TS lint 硬上限 550 行 | 拆 queries/mutations/summary |
| Core package | 新代码目标 300 行；Core lint 硬上限 450 行；registry data 500 行 | Core UI/类型/配置按真实 seam 拆 |

## 最小可运行示例

### page.tsx

```tsx
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DomainClient } from "@workspace/<domain>/ui";

export default async function DomainPage() {
  const user = await requireRouteAccess("/<domain>/<l2>");
  return <DomainClient user={user} />;
}
```

### route.ts

```ts
import { z } from "zod";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import * as service from "@workspace/<domain>/server";

const querySchema = z.object({
  keyword: z.string().optional(),
}).passthrough();

const createSchema = z.object({
  name: z.string().trim().min(1),
}).strip();

export const GET = createApiRouteHandler({
  querySchema,
  queryError: "参数无效",
  handler: async ({ query }) => {
    const data = await service.listItems(query);
    return { items: data };
  },
});

export const POST = createApiRouteHandler({
  bodySchema: createSchema,
  bodyError: "参数无效",
  handler: async ({ user, body }) => service.createItem(body, user.userId),
});
```

业务 service 的写入入口返回 `ServiceResult<T>`：

```ts
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";

export async function createItem(input: CreateInput, userId: number): Promise<ServiceResult<{ item: ItemDto }>> {
  const command = validateCreateItem(input, userId);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const item = await prisma.item.create({ data: command.data });
  return serviceOk({ item });
}
```

`createApiRouteHandler()` 会把 service result 统一转换成 HTTP JSON：成功返回 `result.data`，失败返回 `{ error }` 和 `status ?? 400`。不要在 route 里重复写 `Response.json({ error })` 来处理 service result。

写入路径固定为 `Zod schema -> domain validator -> service/Prisma`：route schema 只验证请求形状并 strip，domain 层只 pick 业务字段和业务规则，service 负责事务和落库。

## 接入检查清单

- [ ] 更新 `README.md` 模块地图
- [ ] 创建模块或 L2 的 `ARCHITECTURE.md`
- [ ] 在 `packages/platform/module-registry.ts` 注册 L1/L2 的 `href`、`resourceKey`、`apiPrefixes` 或 `noApiReason`
- [ ] 设计 `prisma/models/<domain>.prisma`（事实字段 + 审计字段）
- [ ] 运行 `npm run db:validate && npm run schema:check`
- [ ] 实现 `packages/<domain>/server/*`
- [ ] 实现 `app/api/modules/<domain>/<l2>/route.ts`
- [ ] 实现 `packages/<domain>/ui` 组件，再由 `app/(modules)/<domain>/<l2>/page.tsx` 挂载
- [ ] 运行硬约束：`npm run arch:gate && npm run lint -- --max-warnings=0 && npx tsc --noEmit && npm run build`
