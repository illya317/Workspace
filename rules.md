# HR 项目约束规则

> **最后更新**: 2026-05-30
>
> 硬约束 = 真正挡 `commit / CI`，由 `scripts/check/` 脚本强制执行，exit code ≠ 0 即失败。
> 软约束 = 靠 `CLAUDE.md`、`AGENTS.md`、架构文档约束 agent 行为，不自动阻断。

---

## 🔴 硬约束（CI 会挡住）

以下检查全部由脚本强制执行。任何一个失败，commit/CI 都不会通过。

### 1. `env:check` — 环境变量

脚本: `scripts/check/check-env.js`

| 规则 | 说明 |
|------|------|
| `.env.example` 必须存在 | 项目根目录 |
| `NEXTAUTH_SECRET` 写在 `.env.example` | 必填 key |
| `DATABASE_URL` 写在 `.env.example` | 必填 key |
| `.env` 不能被 staged | `git diff --cached` 中不允许出现 `.env` |
| 本地 `.env` 有真实 `NEXTAUTH_SECRET` | 非 placeholder，长度 ≥ 16；CI 环境检查环境变量 |

### 2. `arch:check` — 架构治理

脚本: `scripts/check/check-architecture-governance.js`

| 规则 | 说明 |
|------|------|
| `CLAUDE.md` 必须存在 | 项目根目录 |
| `docs/architecture-governance.md` 必须存在 | 架构治理文档 |
| `CLAUDE.md` 必须包含关键章节 | `## 项目地图`、`## 新模块接入流程`、`## Prisma Schema 规则`、`## API 权限规则`、`## 硬约束` |
| 敏感文件不能被 git tracked | `.env`、`prisma/dev.db`、`.DS_Store`、`task_plan.md`、`findings.md`、`progress.md` |
| `app/api/<root>` 必须是已登记 domain | 新 API 根目录需在 `ALLOWED_API_ROOTS` 白名单中注册 |
| 文件行数软警告 | `app/`、`server/`、`lib/` 下文件超过 300 行会 **warn**（不阻断，仅提示） |

### 3. `api:check` — API 路由治理

脚本: `scripts/check/check-api-routes.js`

| 规则 | 说明 |
|------|------|
| 旧兼容路由必须是纯代理 | `/api/employees`、`/api/positions`、`/api/departments` 等旧入口只能转发请求 |
| 旧路由必须有 `@deprecated` 标记 | 代码中显式标注 |
| 旧路由禁止直接写 Prisma、权限校验、CRUD | 检测 `prisma.`、`checkPermission`、`NextResponse.json` 等模式 |
| 新 API 必须在已知 domain 前缀下 | 如 `admin/`、`hr/`、`finance/`、`inventory/`、`contracts/` 等 |

### 4. `docs:check` — 架构文档

脚本: `scripts/check/check-architecture-docs.js`

| 规则 | 说明 |
|------|------|
| 7 个业务模块必须有 `ARCHITECTURE.md` | `app/admin`、`app/contracts`、`app/finance`、`app/hr`、`app/inventory`、`app/reports`、`app/works` |
| 未知新目录会警告 | 不在已知列表中的 `app/` 子目录会提示是否需要 `ARCHITECTURE.md` |

### 5. `db:validate` — 数据库校验

脚本: `prisma validate --schema=./prisma`

| 规则 | 说明 |
|------|------|
| Prisma schema 必须合法 | 语法、关系、字段类型全部正确 |

### 6. `schema:check` — Schema 治理

脚本: `scripts/check/check-schema-governance.js`

| 规则 | 说明 |
|------|------|
| `prisma/schema.prisma` 不能放 model | 只允许 `generator` 和 `datasource` |
| model 必须放在 `prisma/models/*.prisma` | 多文件 schema 结构 |
| 每个 model 前必须有 `///` 注释 | 说明业务含义、数据来源 |
| 单文件 ≤ 350 行 | 超过直接失败 |
| `finance-cost.prisma` 禁止派生字段名 | `total`、`rate`、`unitCost`、`grossProfit`、`margin` 等 |
| `finance-cost` 必须有 `sourceFile`/`sourceSheet`/`sourceRow` | 追溯字段 |
| 修改 `finance-cost.prisma` 时必须有对应架构文档 | staged 时检查 `app/finance/cost/ARCHITECTURE.md` |

### 7. `size:check` — 文件大小红线

脚本: `scripts/check/check-file-size.js`

| 文件类型 | 上限 | 匹配规则 |
|----------|------|----------|
| API route | ≤ 120 行 | `app/api/**/route.ts` |
| React 组件 / hook | ≤ 220 行 | `app/**/*.tsx` |
| Service | ≤ 260 行 | `server/**/*.ts` |

> **无历史白名单。** 任何超限文件都必须拆分到红线内，没有例外。

### 8. `lint` — ESLint

```
npm run lint -- --max-warnings=0
```

warning 也算失败。不允许任何 lint warning 或 error。

### 9. `tsc` — TypeScript 类型检查

```
npx tsc --noEmit
```

任何类型错误都会失败。

### 10. `build` — 构建

```
npm run build
```

Prisma generate + Next.js build 必须通过。

---

## 🟡 软约束（靠文档/规则约束 agent）

以下规则主要靠 `CLAUDE.md`、`AGENTS.md`、`docs/architecture-governance.md` 和本文件约束 agent 行为。目前不自动阻断 CI，但违反会导致架构腐化、代码审查被拒。

### 开工前

| 规则 | 来源 |
|------|------|
| 按任务类型读对应文档再动手 | `CLAUDE.md` 必读文档触发条件表 |
| 跨目录/跨模块改动先读 `docs/architecture-governance.md` | `CLAUDE.md` |
| 不确定文件放哪里时先查项目地图 | `docs/architecture-governance.md` §1 |

### 模块落位

| 规则 | 来源 |
|------|------|
| 新模块必须按 `app/<domain>` + `app/api/<domain>` + `server/services/<domain>` + `ARCHITECTURE.md` 落位 | `CLAUDE.md` 项目地图、`docs/architecture-governance.md` §2-3 |
| 禁止把新模块塞进 HR、Finance 或 `lib/` 里借壳生长 | `CLAUDE.md` |
| 新模块接入按 10 步清单执行 | `docs/architecture-governance.md` §3 |

### 数据层

| 规则 | 来源 |
|------|------|
| DB 只存事实字段 | `CLAUDE.md`、`docs/architecture-governance.md` §4 |
| 计算字段（合计、百分比、毛利、单位成本等）放 service | `CLAUDE.md`、`docs/architecture-governance.md` §4 |
| 必须入库追溯字段：`sourceFile`、`sourceSheet`、`sourceRow` | `docs/architecture-governance.md` §4 |

### API 层

| 规则 | 来源 |
|------|------|
| API route 只做五件事：认证 → 权限 → 参数校验 → 调用 service → 返回 DTO | `CLAUDE.md`、`docs/architecture-governance.md` §5 |
| GET → `access`，POST/PUT/PATCH → `write`，DELETE → `delete` | `CLAUDE.md`、`docs/architecture-governance.md` §5 |
| 新功能走领域入口（`/api/hr/*`、`/api/finance/*` 等） | `CLAUDE.md`、`docs/architecture-governance.md` §7 |

### 前端层

| 规则 | 来源 |
|------|------|
| 页面 facade 不承载复杂业务逻辑 | `CLAUDE.md` 前端规范 |
| 确认弹窗用 `<ConfirmModal>`，禁止 `window.confirm` | `CLAUDE.md` 前端规范 |
| 通知用 `useToast` | `CLAUDE.md` 前端规范 |
| 公司名/编码从 `lib/company` 导入，禁止硬编码 | `CLAUDE.md` 前端规范 |
| 当前用户类型用 `SessionUser`（`@/lib/types`），禁止页面内重复定义 | `CLAUDE.md` 前端规范 |

### 提交规范

| 规则 | 来源 |
|------|------|
| 每个独立任务独立 commit | `CLAUDE.md` 硬约束 |
| commit 前先看 `git status`，不提交无关文件、`.env`、数据库、临时文件 | `CLAUDE.md` 硬约束 |
| 已有他人改动不得回滚 | `CLAUDE.md` |
| 修改 schema、权限、导入流程、架构边界时同步文档 | `CLAUDE.md`、`docs/architecture-governance.md` §0 |

---

---

## 检查命令速查

```bash
# 全部硬约束（建议 CI 中按此顺序跑）
npm run env:check      # 环境变量
npm run arch:check     # 架构治理
npm run api:check      # API 路由
npm run docs:check     # 架构文档
npm run db:validate    # Prisma schema 合法性
npm run schema:check   # Schema 治理
npm run size:check     # 文件大小
npm run lint -- --max-warnings=0  # ESLint
npx tsc --noEmit       # TypeScript
npm run build          # 构建
```
