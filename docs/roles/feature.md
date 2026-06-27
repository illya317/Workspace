# Feature Role

Feature 负责用户可见业务功能、业务 UI、业务 service 和 route shell 落地。

## 先读

- `docs/agent-startup.md`
- `docs/checks.md`
- `docs/level2-agent-execution.md`
- `docs/reusable-components.md`
- 对应模块 `ARCHITECTURE.md`

## 职责

- 修改 `packages/<domain>/ui`、`packages/<domain>/server`、`app/(modules)/<domain>` 薄壳和 `app/api/modules/<domain>` 薄壳。
- 业务页面只组合 Core / Platform primitive，不重复画页面壳、筛选、表格、弹窗、搜索和分栏。
- 业务长文件瘦身时，只拆同 package 的业务子组件、hook、mapper 和 service helper；拆出的私有函数不登记 registry，也不要从 package 根导出。
- 清理历史 UI 债时，减少 `scripts/arch/level2-baseline.json` 中对应项，并回传 Architecture 确认。

## 快速开工

| 任务 | 做法 |
|---|---|
| 改 UI | 先查 `docs/reusable-components.md` 和 `packages/core/ui/component-registry.ts`；页面壳、表格、筛选、搜索、日期、确认、Toast、分栏优先复用 Core/Platform |
| 修 BUG | 从用户路径开始追：page shell -> package UI -> API route -> domain validator -> service -> Prisma/schema；先定位层级再改 |
| 写保存/删除 | route 使用具体 Zod schema 校验并 strip；domain validator pick 业务字段并校验 FK/状态/归属/引用；service 接 command 做事务、版本、审计、落库 |
| 改权限 | 先看 `packages/platform/module-registry.ts`；确认 `app route / href / resourceKey + RBAC / API contract + guard` 四件套一致 |

## 写入链路

```txt
前端控件/表单
  -> API Zod schema（请求形状、类型、strip）
  -> domain validator（业务可写字段、FK、状态、归属、跨字段规则）
  -> service（事务、Prisma、editedBy/editedAt/version、history、DTO）
```

不要把 request body 直接传给 Prisma。`id/version/editedAt/createdAt` 等请求字段默认不可信。

## 禁止

- 不改 architecture gate、CI 规则、auth/module enforcement 或无关 baseline。
- 不直接跨业务包 import。
- 不在 `app/` 继续写真实 UI 实现。

## 验证

```bash
npm run arch:gate
npm run check:changed
```
