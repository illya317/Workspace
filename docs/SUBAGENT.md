# Sub Agent 速查

> 当前日期以系统提示为准，不要猜测。

## 当前方向

Workspace 正在按 **Core / Platform / Apps** 拆分。Sub agent 不要按旧模式继续把业务逻辑写进 `app/`、`lib/` 或 `server/services/`。

| 层 | 位置 | 写什么 |
|---|---|---|
| Core | `packages/core/` | 通用 UI、表格、筛选、表单字段、日期、FK 搜索、tag 输入、routing/search helper |
| Platform | `packages/platform/` | 登录后平台壳、模块注册聚合、导航、权限资源、审计、用户、Portal、server runtime 契约 |
| Apps | `packages/hr/`, `packages/production/`, `packages/finance/`, `packages/work/`, `packages/administration/`, `packages/library/` | 各业务模块自己的 `ui/server/types/constants/import/module` |
| Route shell | `app/<domain>/`, `app/api/<domain>/` | Next 页面/API 壳。只做挂载、认证、权限、参数校验、调用 package service、返回 DTO |

## 角色分流

| 你接到的任务 | 应按什么角色做 | 先读 |
|---|---|---|
| 改架构规则、gate、registry、API contract、baseline、边界文档 | Architecture | `docs/agent-startup.md`、`docs/architecture-governance.md` |
| 执行 Architecture 拆出的 Level 2 任务包 | Feature / Data / Ops | `docs/level2-agent-execution.md`、对应模块 `ARCHITECTURE.md` |
| 改 HR/Finance/Production/Work 页面、service、route shell | Feature | `docs/agent-startup.md`、对应模块 `ARCHITECTURE.md` |
| 改 Prisma、seed、导入、生成脚本、生成 JSON/cache | Data | `docs/agent-startup.md`、`docs/schema-governance.md` |
| 改 CI、部署、环境变量、脚本运行方式 | Ops/CI | `docs/agent-startup.md`、`docs/ops/deploy.md` |

## 收到 Architecture 任务包时

任务包是执行边界，不是建议清单。

1. 先读 `docs/level2-agent-execution.md`，确认动作类型、目标层、依赖顺序和 baseline 权限。
2. 只改任务包列出的文件或同一动作明确需要的紧邻文件。
3. 按 `依赖` 顺序做，不要跳过“先补 service/Core 入口，再缩薄 route/UI，最后删旧代码/ratchet baseline”。
4. 如果执行中发现必须修改 `scripts/arch/*`、`scripts/check/*`、`packages/platform/module-registry.ts`、`packages/platform/api-registry.ts` 或 baseline，先停下同步 Architecture。
5. 如果发现目标文件已有别的 agent 改动，先读差异并顺着它继续；无法合并时回传，不要覆盖。
6. 交付时说明：完成了哪些文件动作、跑了哪些验证、是否留下风险。

任务包必须至少包含：

```txt
目标 / 范围 / 文件 / 动作 / 目标层 / 依赖 / 禁止触碰 / 验证 / 风险
```

## 必须遵守

- 新通用能力进 `packages/core`；平台能力进 `packages/platform`；HR/生产/财务业务代码进对应业务包。
- API route 只做认证、权限、参数校验、调用 service、返回 DTO。
- 业务包需要认证/权限时使用 `@workspace/platform/server/auth`。
- 业务包需要 Prisma 时使用 `@workspace/platform/server/prisma`。
- 业务包需要审计快照时使用 `@workspace/platform/server/history`。
- 业务包需要通用 CRUD helper 时通过 `@workspace/platform/server/crud-factory`，并在本业务包封装 wrapper。
- HR/Production/Finance 之间不能直接互相 import。
- Work/Administration/Library 也是业务包，不能和 HR/Production/Finance 互相直接 import。
- Core 不能依赖 Platform、业务包、Prisma、权限、业务事实或 `@/` app-root alias。
- 公司名、编码、管理体系、查询分组、共享编码池等事实来自 `Company` 表或 seed/migration 输入，代码只通过领域 service/helper 派生。
- 确认弹框用 Core 的 `ConfirmModal`/`ConfirmProvider`，禁止 `window.confirm`。
- 改完至少按风险运行 `npm run arch:gate`、`npm run lint -- --max-warnings=0`、`npm run typecheck:quick`。
- 不要新增平行架构检查；所有强制边界必须进入唯一 `npm run arch:gate`。
- 不要为新违规扩写 baseline。只有任务明确要求 ratchet 历史债时，才修改 baseline，并且只能减少计数或删除已迁移项。
- 不要把 Work 当作 Project 包处理；工作计划、工作清单、工作汇报、历史记录归 `packages/work`。
- 不要提交当前并行线程范围之外的脏文件，尤其是 Work 体验、Production/QC 生成脚本和生成物。

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
| 工作管理业务 | `@workspace/work` |
| 行政合同业务 | `@workspace/administration` |
| 资料库业务 | `@workspace/library` |

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
