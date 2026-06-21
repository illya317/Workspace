# 新模块接入清单

新增业务模块（非 UI 子页面）必须逐项完成。

如果只是给现有模块增加一个 Tab、子页面、审核流、规则页或 CRUD 能力，不要使用本清单，改看 `docs/existing-module-feature-checklist.md`。

## 1. 数据库

- [ ] Prisma model 定义，放 `prisma/models/<domain>.prisma`
- [ ] 运行迁移：`npx prisma db push`（开发期）或生成 migration
- [ ] 如需初始化数据，加 seed JSON 或 seed 脚本

## 2. RBAC 资源

- [ ] `scripts/seed-resources.ts` 注册资源树：
  - L1 模块资源：`maxRoleKey: "admin"`（业务动作上线后改）
  - 子页面/子功能按需加子资源
- [ ] 新增的子资源必须设 `parentKey` 指向正确的父资源
- [ ] `packages/platform/module-registry.ts` 注册模块，不能只在业务包本地定义
- [ ] `packages/<domain>/module.ts` 导出来自 registry 的 `moduleDefinition` / `resourceDefs` / `routes`
- [ ] `packages/platform/modules.tsx` 只消费 registry；`app/lib/module-nav.tsx` 只作为兼容出口

## 3. 页面

- [ ] `app/<domain>/page.tsx` 服务端组件 facade，只组合 `packages/<domain>/ui` 导出的组件
- [ ] 目录下有子页面的，加 `layout.tsx` 统一做路由级门禁：
  ```tsx
  import { requireResourceAccess } from "@workspace/platform/server/auth";
  export default async function Layout({ children }) {
    await requireResourceAccess("<resource.key>");
    return children;
  }
  ```
- [ ] 无子页面的 L1 页面直接用 `requireResourceAccess()` 或 `requireAuth()`

## 4. API

- [ ] `app/api/<domain>/route.ts` — 四件事：认证、参数校验、调 package service、返回 DTO
- [ ] GET → 至少 `access`；POST/PUT → `write`；DELETE → `delete`
- [ ] 权限入口必须使用 `packages/platform/server/auth/authorize.ts` 的 `authorize()`，或委托给 `@workspace/platform/server/auth` 中已经使用 `authorize()` 的 Platform wrapper
- [ ] API route 不超过 120 行，超了拆 service
- [ ] 复杂查询、导入、计算必须在 service 层

## 5. 业务服务

- [ ] `packages/<domain>/server/` — 查询、导入、计算、聚合、业务规则
- [ ] 单个 service 文件不超过 260 行
- [ ] 禁止在 API route 里写复杂计算

## 6. 架构文档

- [ ] `app/<domain>/ARCHITECTURE.md`：数据来源、事实/计算字段、权限模型、页面清单
- [ ] 更新 `AGENTS.md` 或 `docs/agent-handbook.md` 的关键路由表（如果模块增加新路由）

## 7. 构建验证（硬约束，不通过不能提交）

```bash
npx tsc --noEmit          # 类型检查
npm run lint -- --max-warnings=0  # Lint（含文件行数红线）
npm run build             # 构建
npm run arch:gate         # 唯一架构门禁：AST/DAG/module/auth/package 边界
```

## 红线速查

| 类型 | 上限 |
|------|------|
| 组件/hook | 220 行 |
| API route | 120 行 |
| Service | 260 行 |
| Lint warning | 0 |
| TypeScript error | 0 |
