# Feature Role

Feature 负责用户可见业务功能、业务 UI、业务 service 和 route shell 落地。普通业务 UI、页面体验、表单、列表、弹窗和交互流程默认归 Feature。

## 先读

- `docs/engineering/agent-startup.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/structure-agent-execution.md`
- `docs/engineering/reusable-components.md`
- 对应模块 `ARCHITECTURE.md`

## 职责

- 修改 `packages/<domain>/ui`、`packages/<domain>/server`、`app/(modules)/<domain>` 薄壳和 `app/api/modules/<domain>` 薄壳。
- 业务页面只组合 Core / Platform primitive，不重复画页面壳、筛选、表格、弹窗、搜索和分栏。
- 日常 UI 改造归 Feature。任务明确包含 UI-system/Architecture 授权时，负责 UI 的 agent 可以同步修改 `packages/core/ui` 的结构声明、registry 和 gate；只能补 section/form/table/selector/展开区等可复用结构，不能增加颜色、间距、圆角、阴影、单字段、单 cell、单 label/icon 或业务专属 kind。
- 业务长文件瘦身时，只拆同 package 的业务子组件、hook、mapper 和 service helper；拆出的私有函数不登记 registry，也不要从 package 根导出。
- 清理历史 UI 债时必须跑 `gate:ui`；raw Surface 与 helper purity 不设 baseline，不能靠更新 JSON 接受新债。
- 维护对应模块 `ARCHITECTURE.md` / `MODULE.md` 和用户/产品说明；业务流程、状态机、审批流、财务/生产/HR 等不可从 UI 一眼看懂的规则变化必须同步文档。

## 快速开工

| 任务 | 做法 |
|---|---|
| 改 UI | 先查 `docs/engineering/reusable-components.md` 和 `packages/core/ui/registry/component-registry.ts`；页面壳、表格、筛选、搜索、日期、确认、Toast、分栏优先复用 Core/Platform |
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
- 不把单个业务页面的 UI 需求包装成 Core UI contract 变更，除非已有跨模块复用证据或 Architecture 明确要求。

## 验证

```bash
npm run arch:gate
npm run check:changed
```

`check:changed` 不包含净增行 gate。清债、重构或达到复杂度上限后的专项任务跑 `npm run check:refactor`；需要查看总行数预算时再跑 `npm run complexity:line-budget` 并说明使用的 `NET_LINE_GROWTH_LIMIT`。
