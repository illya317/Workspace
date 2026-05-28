# 新模块接入模板

新增业务模块（绩效、采购、生产等）时，按此模板落位。不要重新发明结构。

## 目录结构

```
app/<domain>/
  page.tsx              # Server Component，只负责鉴权和数据预取
  <Domain>Client.tsx   # Client Component，组合 UI
  types.ts              # 模块内共享类型
  ARCHITECTURE.md       # 模块架构说明（数据来源、事实字段、计算字段、权限）
  components/           # 模块内组件（≤220 行）
  hooks/                # 模块内 hooks（≤220 行）

app/api/<domain>/
  route.ts              # API 路由（≤120 行）：认证、校验、调 service、返回 DTO

server/services/<domain>/
  index.ts              # 公开接口
  queries.ts            # 查询、列表、详情
  mutations.ts          # 创建、更新、删除
  summary.ts            # 汇总、派生指标计算

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
3. DB 只保存事实字段；合计、百分比、毛利等派生结果放 `server/services/<domain>/summary.ts`
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
import { authenticate, checkPermission } from "@/lib/auth";
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
import { authenticate, checkPermission } from "@/lib/auth";
import * as service from "@/server/services/domain";

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
- [ ] 实现 `server/services/<domain>/*`
- [ ] 实现 `app/api/<domain>/route.ts`
- [ ] 实现 `app/<domain>/page.tsx` + `DomainClient.tsx`
- [ ] 运行硬约束：`npm run arch:check && npm run lint -- --max-warnings=0 && npx tsc --noEmit && npm run build`
