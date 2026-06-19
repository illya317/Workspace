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

在 `lib/permissions.ts` 添加资源 key：

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
| 组件 | 220 行 | 拆子组件 |
| hook | 220 行 | 拆辅助 hook |
| API route | 120 行 | 下沉到 service |
| service | 260 行 | 拆 queries/mutations/summary |

## 最小可运行示例

### page.tsx

```tsx
import { authenticate, checkPermission } from "@workspace/platform/server/auth";
import { redirect } from "next/navigation";
import DomainClient from "./DomainClient";

export default async function DomainPage() {
  const payload = await authenticate();
  if (!payload) redirect("/login");
  if (!(await checkPermission(payload.userId, "domain", "access"))) {
    redirect("/portal");
  }
  return <DomainClient />;
}
```

### route.ts

```ts
import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@workspace/platform/server/auth";
import * as service from "@workspace/<domain>/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "domain", "access"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const data = await service.listItems();
  return NextResponse.json({ items: data });
}
```

## 接入检查清单

- [ ] 更新 `README.md` 模块地图
- [ ] 创建 `app/<domain>/ARCHITECTURE.md`
- [ ] 在 `lib/permissions.ts` 注册资源 key
- [ ] 设计 `prisma/models/<domain>.prisma`（事实字段 + 审计字段）
- [ ] 运行 `npm run db:validate && npm run schema:check`
- [ ] 实现 `packages/<domain>/server/*`
- [ ] 实现 `app/api/<domain>/route.ts`
- [ ] 实现 `app/<domain>/page.tsx` + `DomainClient.tsx`
- [ ] 运行硬约束：`npm run arch:check && npm run lint -- --max-warnings=0 && npx tsc --noEmit && npm run build`
