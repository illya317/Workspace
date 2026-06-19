# 架构治理规则

这份文档是给人和 agent 共用的“放东西地图”。项目现在还小，正适合把边界一次定清楚；以后增加绩效、采购、生产、更多财务数据时，按这套规则扩展，不靠临时感觉堆文件。

## 0. 文档索引和阅读条件

Agent 开工前先判断任务类型，再读对应文档。不要等改完才补文档。

| 什么时候必须读 | 先读哪些文档 | 读完要确认什么 |
|---|---|---|
| 不确定文件该放哪里、要跨多个目录改动 | `README.md`、`docs/architecture-governance.md` | 这个改动属于哪个 domain，是否需要 service/API/UI/schema 同步 |
| 用户问”现状怎么优化”、整理目录、拆文件、处理治理债 | `docs/planning/architecture-optimization-roadmap.md` | 属于哪个 Phase，能否拆成独立 commit |
| 新增绩效、采购、生产或其他业务模块 | `README.md`、本文件 | 是否建立 `packages/<domain>`、`app/<domain>/` 路由壳、`app/api/<domain>/` API 壳、`app/<domain>/ARCHITECTURE.md` |
| 修改数据库 schema、Prisma、多文件 schema、seed | `docs/schema-governance.md`、`docs/database.md` | 是否只存事实字段，是否更新对应架构文档和检查脚本 |
| 导入 Excel/JSON/外部数据 | `docs/schema-governance.md`、对应模块 `ARCHITECTURE.md` | raw/normalized/DB 分层是否清楚，计算字段是否避免入库 |
| 修改权限、账号、后台授权、资源树 | `docs/security/rbac.md`、`docs/agent-handbook.md` 的 API 权限规则 | 页面权限和 API 权限是否一致，是否注册资源 key |
| 修改 HR | `app/hr/ARCHITECTURE.md` | 是否符合 HR 数据、审计、组件拆分规则 |
| 修改财务成本 | `app/finance/cost/ARCHITECTURE.md` | 是否保持 DB 存事实、Service 算结果、source 可追溯 |
| 修改环境变量或部署 | `docs/ops/environment.md`、`docs/ops/deploy.md` | `.env.example`、CI、deploy 是否同步 |
| 修改 Next.js 路由、构建、缓存、Server Component | `node_modules/next/dist/docs/` 相关文档 | 是否符合当前 Next.js 16 行为 |

如果一个任务命中多个条件，必须读多个文档。交付时需要说明“参考文档”和“是否更新文档”。如果代码改动导致文档过期，任务不算完成。

## 1. 判断一个改动属于哪一层

任何任务开始前，先判断它主要属于哪一层：

| 层 | 典型问题 | 应放位置 |
|---|---|---|
| 业务领域 | HR、财务成本、库存、合同、绩效、采购、生产 | `packages/<domain>/`, `app/<domain>/`, `app/api/<domain>/` |
| 平台能力 | 登录、权限、账号、审计、模块注册、Portal | `packages/platform/` |
| Core 通用能力 | 下拉、筛选、搜索、日期、确认弹窗、通用表格、字段展示 | `packages/core/` |
| 数据模型 | 表、字段、索引、迁移、seed | `prisma/`, `prisma/seed-data/`, `scripts/import-*` |
| 文档治理 | 模块边界、数据来源、导入流程、验收标准 | `README.md`, `docs/`, `app/*/ARCHITECTURE.md` |

如果一个任务横跨两层，先写计划，拆成多个 commit。不要一次让 agent 同时改 schema、导入、API、UI、权限和部署脚本。

## 2. 业务模块目录契约

每个业务模块都应形成同一组入口：

```txt
packages/<domain>/
  module.ts
  ui/
  server/
  types/
  constants/
  import/

app/<domain>/
  page.tsx
  ARCHITECTURE.md

app/api/<domain>/
  route.ts or nested route.ts
```

不是每个模块第一天都要建满所有文件，但新增代码时必须往这个方向收敛。

## 3. 新业务模块接入清单

新增绩效、采购、生产等模块时，执行 agent 必须按顺序完成：

1. 更新 `README.md` 的“当前业务模块”或“未来模块”说明。
2. 更新 `AGENTS.md` 或 `docs/agent-handbook.md` 的模块规则。
3. 创建 `app/<domain>/ARCHITECTURE.md`。
4. 在 `lib/permissions.ts` 注册资源树。
5. 设计 Prisma model，明确事实字段和计算字段。
6. 在 `packages/<domain>/server/` 写业务逻辑。
7. 在 `packages/<domain>/ui/` 写主要 UI。
8. 在 `app/api/<domain>/` 写 API route 壳。
9. 补测试或检查命令。
10. 独立提交 commit。

## 4. 数据和 schema 原则

DB 不等于 Excel，也不等于 normalized JSON。

必须入库：

- 人工录入或外部系统提供的事实字段。
- 业务主键或稳定关联字段。
- `sourceFile`、`sourceSheet`、`sourceRow`、`importId` 等追溯字段。
- 必要状态字段，例如 `status`、`importedAt`、`createdAt`。

默认不入库：

- 合计、小计、总计。
- 百分比、占比、完成率。
- 未回款、毛利、单位成本、趋势。
- 任何能由事实字段稳定计算出来的值。

不确定的原始行可以先放 `rawPayload`，但不能为了还原 Excel 样子把几十个不稳定列都建成 schema。

公司、组织、租户相关的专有事实必须数据化，不能散落在代码里。具体公司名、公司编码、管理体系、查询分组、共享编码池、特殊公司判断等信息应来自 `Company` 表或对应 seed/migration 输入；应用代码只保留通用机制，通过领域 service/helper 查询、缓存和派生。

## 5. API 规则

API route 只做：

1. 认证。
2. 权限。
3. 参数校验。
4. 调用 service。
5. 返回 DTO。

权限动作：

| HTTP 方法 | 权限动作 |
|---|---|
| GET | `access` |
| POST | `write` |
| PUT | `write` |
| PATCH | `write` |
| DELETE | `delete` |

授权、系统配置、权限管理使用 `admin` 或 `system.admin`。

## 6. 文件大小红线

| 类型 | 硬上限 | 处理方式 |
|---|---:|---|
| 页面 facade | 150 行 | 拆 components/hooks |
| React 组件 | 220 行 | 拆子组件 |
| hook | 220 行 | 拆 data/edit/filter/table |
| API route | 120 行 | 逻辑移到 service |
| service | 260 行 | 按 queries/summary/import 拆 |
| Prisma 单领域文件 | 350 行 | 按领域继续拆 |

文件大小红线由 `npm run size:check` 强制执行，不设历史白名单。任何超限文件都必须先拆分到红线内，任务才允许继续交付或提交。

## 7. 兼容入口规则

项目里已有一些旧 API 兼容入口，例如 `/api/employees`、`/api/positions`、`/api/departments`。这些入口只能代理或兼容旧调用。

新代码必须使用领域入口：

- HR：`/api/hr/*`
- 财务：`/api/finance/*`
- 财务成本：`/api/finance/cost/*`
- 库存：`/api/inventory/*` 已关闭，仅返回 `410 Gone`
- 合同：`/api/contracts/*`

未来绩效、采购、生产也必须各自有独立领域入口，不要塞进 HR 或 Finance。

## 8. Package 边界规则

package 依赖必须单向：

```txt
app/* route shell
  -> @workspace/platform
  -> @workspace/<domain>
  -> @workspace/core
```

- `@workspace/core` 禁止依赖 platform、业务包、`@/app`、Prisma、权限和业务事实。
- `@workspace/platform` 可以聚合业务包注册信息并拥有平台 server runtime 契约，例如 Prisma client、权限、审计；但禁止直接 import 业务页面或业务 service。
- `@workspace/hr`、`@workspace/production`、`@workspace/finance` 之间禁止直接互相 import。
- 业务包需要认证或权限检查时应通过 `@workspace/platform/server/auth`，不要直接 import `@/lib/auth`。
- 业务包需要通用字段级 CRUD helper 时应通过 `@workspace/platform/server/crud-factory` 并在本领域封装，例如 HR 使用 `packages/hr/server/crud.ts`；不要直接 import `@/lib/crud`。
- 业务包需要访问数据库时应通过 `@workspace/platform/server/prisma`，不要直接 import `@/lib/prisma` 或 generated Prisma client。
- 业务包需要写审计快照时应通过 `@workspace/platform/server/history`，不要直接 import app-root `@/lib/history`。
- 业务包需要解析 FK 快照展示名时应通过 `@workspace/platform/server/resolve-fk`，不要直接 import app-root `@/lib/resolve-fk`。
- API route 只做认证、权限、参数校验、调用 service、返回 DTO；复杂业务逻辑必须进入领域 service 或业务包。
- `app/lib/module-nav.tsx` 只是兼容出口，模块真实注册来源是 `packages/platform/modules.tsx` 和各业务包。
- 模块注册的 `href` 和 `routes` 只写不带 basePath 的站内绝对路径，例如 `/hr/roster`；禁止把 `@workspace/*` package 名或 `/workspace` basePath 写入 URL。

这些规则由 `npm run arch:check` 中的 module registry、resource registry 和 package boundary 检查执行。

## 9. Agent 交付要求

每次交付必须说明：

- 改了哪些文件。
- 属于哪个业务领域或平台能力。
- 跑了哪些检查。
- 是否改了 schema、权限、导入流程或架构文档。
- 有哪些遗留风险。

改完一个独立任务后要 commit。不要把多个无关任务混成一个 commit。

## 10. 当前已知治理债

这些不是马上阻断业务的错误，但后续应逐步清理：

- `prisma/schema.prisma` 已经很长，应按领域拆分。
- `app/api/hr/*` 和部分旧 API 入口并存，旧入口应逐步降级为兼容代理。
- `app/admin` 里旧权限 tab 文件仍存在，统一权限矩阵稳定后可以删除。
- `lib/` 中有部分 server-only 逻辑，新代码优先放到 `server/`。
- `scripts/` 需要继续区分 check/import/migrate/generate。

治理债应单独开任务处理，不要混在业务功能 PR 里偷偷改。
