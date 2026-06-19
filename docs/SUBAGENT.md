# Sub Agent 速查

> 当前日期以系统提示为准，不要猜测。

## 当前方向

Workspace 正在按 **Core / Platform / Apps** 拆分。Sub agent 不要按旧模式继续把业务逻辑写进 `app/`、`lib/` 或 `server/services/`。

| 层 | 位置 | 写什么 |
|---|---|---|
| Core | `packages/core/` | 通用 UI、表格、筛选、表单字段、日期、FK 搜索、tag 输入、routing/search helper |
| Platform | `packages/platform/` | 登录后平台壳、模块注册聚合、导航、权限资源、审计、用户、Portal、server runtime 契约 |
| Apps | `packages/hr/`, `packages/production/`, `packages/finance/` | 各业务模块自己的 `ui/server/types/constants/import/module` |
| Route shell | `app/<domain>/`, `app/api/<domain>/` | Next 页面/API 壳。只做挂载、认证、权限、参数校验、调用 package service、返回 DTO |

## 必须遵守

- 新通用能力进 `packages/core`；平台能力进 `packages/platform`；HR/生产/财务业务代码进对应业务包。
- API route 只做认证、权限、参数校验、调用 service、返回 DTO。
- 业务包需要认证/权限时使用 `@workspace/platform/server/auth`。
- 业务包需要 Prisma 时使用 `@workspace/platform/server/prisma`。
- 业务包需要审计快照时使用 `@workspace/platform/server/history`。
- 业务包需要通用 CRUD helper 时通过 `@workspace/platform/server/crud-factory`，并在本业务包封装 wrapper。
- HR/Production/Finance 之间不能直接互相 import。
- Core 不能依赖 Platform、业务包、Prisma、权限、业务事实或 `@/` app-root alias。
- 公司名、编码、管理体系、查询分组、共享编码池等事实来自 `Company` 表或 seed/migration 输入，代码只通过领域 service/helper 派生。
- 确认弹框用 Core 的 `ConfirmModal`/`ConfirmProvider`，禁止 `window.confirm`。
- 改完至少按风险运行 `npm run arch:gate`、`npm run lint -- --max-warnings=0`、`npm run typecheck:quick`。

## 常用入口

| 能力 | 首选入口 |
|---|---|
| 通用 UI | `@workspace/core/ui` |
| Toast hook | `@workspace/core/hooks` |
| 通用路由 helper | `@workspace/core/routing` |
| 通用文本/拼音搜索 | `@workspace/core/search` |
| 平台壳 UI | `@workspace/platform/ui` |
| 模块注册/导航 | `@workspace/platform` |
| 权限/认证 | `@workspace/platform/server/auth` |
| Prisma runtime | `@workspace/platform/server/prisma` |
| 审计历史 | `@workspace/platform/server/history` |
| FK 显示名解析 | `@workspace/platform/server/resolve-fk` |
| HR 业务 | `@workspace/hr`、`@workspace/hr/server`、`@workspace/hr/ui` |
| 生产业务 | `@workspace/production` |
| 财务业务 | `@workspace/finance` |

## 验证命令

```bash
npm run arch:gate
npm run lint -- --max-warnings=0
npm run typecheck:quick
npm run build
```

本地开发只允许一个 3000 端口 dev 服务。检查：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```
