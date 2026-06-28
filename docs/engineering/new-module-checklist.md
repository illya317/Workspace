# 新模块接入清单

新增业务模块（非 UI 子页面）必须逐项完成。

如果只是给现有模块增加一个 Tab、子页面、审核流、规则页或 CRUD 能力，不要使用本清单，改看 `docs/engineering/existing-module-feature-checklist.md`。

## 1. 数据库

- [ ] Prisma model 定义，放 `prisma/models/<domain>.prisma`
- [ ] 运行迁移：`npx prisma db push`（开发期）或生成 migration
- [ ] 如需初始化数据，加 seed JSON 或 seed 脚本

## 2. RBAC 资源

- [ ] L2 先按用户认知钉死：L2 = `moduleDef.children[*]` 中的业务入口单元，不按 resource key 点号数量猜。
- [ ] 每个 L2 必须具备四件套：直接二级 app route、同名 RBAC resource、明确 API contract 前缀或 `noApiReason`、权限页可授权资源。
- [ ] L2 的 `resourceKey` 必须等于 `module.key + "." + child.key`，例如 `finance.statementConfig`；多个页面不能共用一个模糊 resource。
- [ ] L1/L2 主资源由 `packages/platform/module-registry.ts` 自动派生；不要在业务包 `resourceDefs` 或 seed 里重复注册主资源。
- [ ] 新增的 L2 必须在 registry child 中写明 `resourceKey`、`href`、`apiPrefixes` 或 `noApiReason`；`scripts/seed-resources.ts` 会按 registry 同步 DB 资源。
- [ ] L2 以下 capability 才进入 `resourceDefs`；需要权限继承时才设 `parentKey`，不应继承 owner 权限的独立能力必须保持 `parentKey` 为空。
- [ ] L2 以下 capability 不进入全局页面 L2；它必须声明 `capabilityOwnerKey` 指向已注册 L2。如果不能继承父资源权限但仍归属模块启停，保持 `parentKey` 为空并设置 `runtimeParentKey` 指向 owner，例如全量查看、导出或跨对象辅助权限
- [ ] `packages/platform/module-registry.ts` 注册模块，不能只在业务包本地定义
- [ ] `packages/<domain>/module.ts` 导出来自 registry 的 `moduleDefinition` / `resourceDefs` / `routes`
- [ ] `packages/platform/modules.tsx` 只消费 registry；`app/lib/module-nav.tsx` 只作为兼容出口
- [ ] 删除 L1/L2 时同步删除真实 app route、API route、registry child/resourceKey、docs 和引用；不要保留 hidden/disabled 旧 resource 或 410 旧 API contract，除非任务明确要求兼容。

## 3. 页面

- [ ] `app/(modules)/<domain>/<l2>/page.tsx` 服务端组件 facade，只组合 `packages/<domain>/ui` 导出的组件
- [ ] L2 app route 必须是直接二级路径，例如 `/production/qc-batches`，禁止用嵌套三级路径作为 L2。
- [ ] 目录下有子页面的，加 `layout.tsx` 统一做路由级门禁：
  ```tsx
  import { requireRouteAccess } from "@workspace/platform/server/auth";
  export default async function Layout({ children }) {
    await requireRouteAccess("<href>");
    return children;
  }
  ```
- [ ] 无子页面的 L1/L2 页面直接用 `requireRouteAccess("<href>")`；不要在页面手写 resource key。

## 4. API

- [ ] `app/api/modules/<domain>/<l2>/route.ts` — 先调用 `requireApiAccess(request)` 或 `with-auth` wrapper，再做 Zod 参数校验、调 package service、返回 DTO。
- [ ] 每个 L2 在 registry child 上声明 `apiPrefixes`；没有 API 时写清 `noApiReason`。宽泛 `/api/modules/<domain>` 不能作为 L2 最终契约。
- [ ] GET → 至少 `access`；POST/PUT → `write`；DELETE → `delete`
- [ ] route 入口不得裸用 `authenticate()`、不得手写 resource key 作为主门禁；resource/action 必须由 registry API contract 派生。
- [ ] 写入请求固定走 `Zod schema -> domain validator -> service/Prisma`：route schema 只校验请求形状并 strip，domain validator pick 可写字段并检查 FK/状态/归属/跨字段规则，service 负责事务、版本、审计和落库。
- [ ] API route 不超过 120 行，超了拆 service
- [ ] 复杂查询、导入、计算必须在 service 层

## 5. 业务服务

- [ ] `packages/<domain>/server/` — 查询、导入、计算、聚合、业务规则
- [ ] 单个 service 文件以 260 行为新代码目标；package TS lint 硬上限 550 行
- [ ] 禁止在 API route 里写复杂计算

## 6. 架构文档

- [ ] 模块或 L2 的 `ARCHITECTURE.md`：数据来源、事实/计算字段、权限模型、页面清单
- [ ] 更新 `AGENTS.md` 或 `docs/engineering/agent-handbook.md` 的关键路由表（如果模块增加新路由）

## 7. 构建验证（硬约束，不通过不能提交）

```bash
npx tsc --noEmit          # 类型检查
npm run lint:changed      # Lint（含文件行数红线；不含净增行 gate）
npm run build             # 构建
npm run arch:gate         # 唯一架构门禁：AST/DAG/module/auth/package 边界
```

## 红线速查

| 类型 | 上限 |
|------|------|
| 页面 facade | 150 行 |
| UI 组件/hook | 新代码目标 220 行；package TSX lint 硬上限 500 行 |
| API route | 120 行 |
| Server service | 新代码目标 260 行；package TS lint 硬上限 550 行 |
| Core package | 新代码目标 300 行；Core lint 硬上限 450 行；registry data 500 行 |
| Lint warning | 0 |
| TypeScript error | 0 |
