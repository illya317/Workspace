# 现状架构优化路线图

> 历史路线图说明：本文记录早期治理过程。涉及新模块目录、service 位置和包边界时，以 `docs/module-boundaries.md`、`docs/architecture-governance.md`、`docs/reusable-components.md` 为准；不要按本文早期 `server/services/<domain>` 模板新增业务代码。

这份文档回答一个问题：项目现在已经有 HR、财务、库存、合同、权限、周报等模块，文件夹开始变多，后续还会加绩效、采购、生产。现状应该怎么优化，避免小项目一开始就留下大项目的病根。

## 总原则

不要为了“看起来整齐”做大搬家。优化顺序应是：

1. 先加规则和硬约束。
2. 再梳理入口和文档。
3. 再拆超长文件。
4. 再迁移旧 API。
5. 最后做目录大调整。

每一步都要能单独提交、单独回滚、单独验证。

## 整改前现状（历史参考）

| 问题 | 整改前状态 | 当前状态 |
|---|---|---|
| 业务模块继续增加 | 已有 HR、Finance、Inventory、Contracts，后续还会有绩效、采购、生产 | ✅ 新模块模板已确定，新增模块有标准目录和权限契约 |
| Prisma schema 过长 | `prisma/schema.prisma` 已超过 800 行 | ✅ 已按领域拆分为 `prisma/models/*.prisma`，主文件只保留 generator/datasource |
| API 入口并存 | 有 `/api/modules/hr/roster/*`，也有 `/api/modules/hr/roster`、`/api/modules/hr/roster/positions` 等旧入口 | ✅ 旧入口已改为纯代理，前端已全部迁移到 `/api/modules/hr/roster/*` |
| admin 旧权限文件残留 | 新权限矩阵已存在，但旧 ByUser/ByPosition 等文件还在 | ✅ 旧权限文件已删除，权限页只剩用户账号 + 权限管理两个主 tab |
| 超长文件仍存在 | `PermissionsTab.tsx`、`usePermissionsTab.ts`、`CodeTable.tsx` 超过 300 行 | ✅ 已拆分：PermissionsTab 132 行、usePermissionsTab 203 行、CodeTable 152 行 |
| service 层不均匀 | finance-cost 已开始有 service，但其他模块仍有 API/页面承担业务逻辑 | ✅ admin permission-grants 已下沉到 `server/services/admin/`，finance-cost 持续维护 |
| docs 分散 | README、AGENTS、ARCHITECTURE、docs 各有一部分 | ✅ README 为项目地图，AGENTS 只做入口，docs/ 放治理规则，各模块自有 ARCHITECTURE.md |
| 脚本混杂 | `scripts/` 同时有 check/import/migrate/generate | ✅ 已分类为 `scripts/check/`、`scripts/import/`、`scripts/migrate/`、`scripts/generate/`、`scripts/seed/`，命名规则已落地 |
| 模块边界 | `app/`、`server/`、`lib/` 直接承载所有模块 | ✅ 已建立 `packages/core/platform/hr/production/finance` 的三层五包边界，先拆注册和依赖方向，不拆部署 |

## 优化路线

### Phase 0：先保护地基

目标：让 agent 不能继续乱放。

已完成：

- `README.md` 改成项目地图。
- `AGENTS.md` 增加入口规则，细则沉到 `docs/agent-handbook.md`。
- 新增 `docs/architecture-governance.md`。
- 新增 `npm run arch:gate`。
- pre-commit 和 CI 接入 `arch:gate`。
- 新增 `npm run schema:check`，检查 Prisma model 是否按领域、是否有注释、是否同步文档。

后续补强：

- API route governance 已归入 `npm run arch:gate`，检查新 API 是否落在允许的 domain 下，并保证 legacy API 只做代理。
- 新增 `npm run docs:check`，检查新增 domain 是否有 `ARCHITECTURE.md`。

验收：

```bash
npm run arch:gate
npm run schema:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

### Phase 1：统一项目地图

目标：让人和 agent 都知道“东西在哪”。

要做：

- `README.md` 只放项目总地图。
- `docs/architecture-governance.md` 放长期规则。
- `docs/planning/architecture-optimization-roadmap.md` 放现状优化路线图。
- 每个业务模块必须有自己的 `ARCHITECTURE.md`：
  - `app/hr/ARCHITECTURE.md`
  - `app/finance/cost/ARCHITECTURE.md`
  - 后续：`app/performance/ARCHITECTURE.md`
  - 后续：`app/procurement/ARCHITECTURE.md`
  - 后续：`app/production/ARCHITECTURE.md`

不做：

- 不把所有细节塞进 README。
- 不让 agent 只靠读代码猜架构。

### Phase 2：Prisma schema 按领域拆分 ✅ 已完成

目标：避免所有业务表继续堆到一个文件。

完成状态：

- Prisma 已从 5.22.0 升级到 6.19.3。
- `prisma/schema.prisma` 已瘦身至只保留 generator / datasource。
- 模型已按领域拆分：
  ```txt
  prisma/models/auth-rbac.prisma
  prisma/models/system.prisma
  prisma/models/reports.prisma
  prisma/models/works.prisma
  prisma/models/hr.prisma
  prisma/models/finance-ledger.prisma
  prisma/models/finance-cost.prisma
  prisma/models/inventory.prisma
  prisma/models/contracts.prisma
  ```
- 每个 model 前已加 `///` 注释。
- 新增 `docs/schema-governance.md` 和 `scripts/check-schema-governance.js`（7 条硬约束）。
- pre-commit 和 CI 已接入 `db:validate` + `schema:check`。

后续不再允许：

- 新 model 写回 `prisma/schema.prisma`。
- finance-cost 模型出现派生字段名。
- 修改 schema 不更新对应 `ARCHITECTURE.md`。

验收：

```bash
npm run db:validate
npm run schema:check
npx prisma generate
npx tsc --noEmit
npm run build
```

### Phase 3：API 入口治理 ✅ 已完成

目标：新代码只走领域 API，旧 API 逐步降级为兼容代理。

标准入口：

| 领域 | 新入口 |
|---|---|
| HR | `/api/modules/hr/roster/*` |
| 财务总账 | `/api/modules/finance/*` |
| 财务成本 | `/api/modules/finance/cost/*` |
| 合同 | `/api/modules/administration/contracts/*` |
| 绩效 | `/api/performance/*` |
| 采购 | `/api/procurement/*` |
| 生产 | `/api/modules/production/*` |

完成状态：

- 新增 `/api/modules/hr/roster`：承载原 `/api/modules/hr/roster` 的花名册扁平化 + Excel 导出逻辑。
- 新增 `/api/modules/hr/roster/employees/search`：员工搜索（含岗位展开）。
- 旧入口已全部改为纯代理：
  - `/api/modules/hr/roster` → `/api/modules/hr/roster`
  - `/api/modules/hr/roster/employees/search` → `/api/modules/hr/roster/employees/search`
  - `/api/modules/hr/roster/autocomplete` → `/api/modules/hr/roster/autocomplete`
  - `/api/modules/hr/roster/positions` → `/api/modules/hr/roster/positions`
  - `/api/modules/hr/roster/edps` → `/api/modules/hr/roster/edps`
  - `/api/modules/hr/roster/departments` → `/api/modules/hr/roster/departments`
  - `/api/modules/work/plans` → `/api/modules/hr/roster/projects`
  - `/api/modules/work/plan-members` → `/api/modules/hr/roster/employee-projects`
- 前端已全部迁移到 `/api/modules/hr/roster/*`：
  - HR 实体搜索走 `@workspace/hr/ui` 的 `EntitySearchInput` 和 `@workspace/hr/server` 的搜索 service
  - `RosterTab.tsx` → `/api/modules/hr/roster`
  - `useCodeData.ts` → `/api/modules/hr/roster`
- `docs/generated/api.md` 已更新：旧 API 单独列为"兼容层（已废弃）"。

遗留注意：

- `/api/modules/hr/roster` 目前 159 行，超过 API route 120 行硬约束，需后续拆分为 `server/services/hr/roster.ts`。

验收：

```bash
rg '/api/modules/hr/roster|/api/modules/hr/roster/positions|/api/modules/hr/roster/departments' app/ --type-add 'web:*.{ts,tsx}' -tweb
# 只剩纯代理文件和文档中的兼容层说明
```

### Phase 4：超长文件拆分

目标：先拆最容易继续变坏的文件。

优先级：

| 优先级 | 文件 | 建议 |
|---|---|---|
| P1 | `packages/platform/ui/admin/tabs/PermissionsTab.tsx` | 拆资源树、矩阵表、详情抽屉、单元格 |
| P1 | `packages/platform/ui/admin/hooks/usePermissionsTab.ts` | 拆 subjects、grants、filters、mutations |
| P2 | `app/hr/code/CodeTable.tsx` | 拆表头、行、分页、弹窗调度 |
| P2 | `app/hr/tabConfigs.ts` | 按 HR 实体拆配置 |
| P3 | 旧 admin ByUser/ByPosition/ByDepartment 文件 | 新矩阵稳定后删除 |

拆分规则：

- 页面 facade 不超过 150 行。
- 组件不超过 220 行。
- hook 不超过 220 行。
- API route 不超过 120 行。
- service 不超过 260 行。

验收：

```bash
npm run arch:gate
npm run lint -- --max-warnings=0
npx tsc --noEmit
```

### Phase 5：service 层补齐

目标：让业务逻辑从页面/API 中下沉到 service。

历史目标结构（已被 Phase 6 的 `packages/<domain>/server` 方向替代）：

```txt
server/services/hr/
server/services/finance-ledger/
server/services/finance-cost/
server/services/inventory/
server/services/contracts/
server/services/reports/
server/services/works/
```

迁移原则：

- API route 不直接做复杂 Prisma 查询组合。
- 派生指标、汇总、导入、批量更新放 service。
- 页面不直接计算业务口径。
- service 返回 DTO，不把 Prisma 原对象裸传给 UI。

### Phase 6：三层五包边界 ✅ 已启动

目标：先把代码所有权和依赖方向拆清楚，但仍保持一个 Workspace Next 服务、一个数据库和现有 URL。

已完成：

- 新增 `packages/core`，定义模块注册、资源注册、API guard 的基础契约。
- 新增 `packages/platform`，聚合模块注册并生成导航入口。
- 新增 `packages/hr`、`packages/production`、`packages/finance`，各自导出业务包注册信息。
- `app/lib/module-nav.tsx` 降级为兼容出口，真实注册来源切到 `packages/platform/modules.tsx`。
- 新增 package 边界检查，接入 `npm run arch:gate`。
- 新增 `docs/module-boundaries.md`。

后续：

- Core 逐步接收通用字段输入、日期、FK 搜索、tag 输入、表格、筛选、确认弹窗。
- HR 先作为样板，把 UI、server、import、types、constants 逐步迁入 `packages/hr`。
- Production、Finance 按 HR 样板迁移。

优先迁移：

1. finance-cost：已经开始做，继续保持。
2. inventory reports。
3. HR analytics。
4. admin permissions。

### Phase 6：scripts 目录治理

目标：脚本越来越多时不乱。

建议结构：

```txt
scripts/check/
scripts/import/
scripts/migrate/
scripts/generate/
scripts/seed/
```

短期可以先不搬文件，但新增脚本命名必须遵守：

- `check-*.js`：硬约束检查。
- `import-*.js/ts/py`：数据导入。
- `migrate-*.ts/js`：一次性迁移。
- `gen-*.js/ts`：生成文档或快照。
- `seed-*.ts/js`：种子数据。

以后脚本变多再物理移动。

### Phase 7：新增模块标准模板

目标：绩效、采购、生产不要重新发明结构。

现行新模块模板见 `docs/planning/new-domain-template.md`。页面/API 只保留 Next 壳，真实 UI/service 放 `packages/<domain>`。

权限模板：

```txt
<domain>
<domain>.<submodule>
```

动作只用：

```txt
access / write / delete / admin
```

## 建议执行顺序

不要一口气全做。推荐拆成这些独立任务：

- [x] `chore(docs): add project map and architecture roadmap`
- [x] `chore(schema): split prisma schema by domain`
- [x] `chore(api): mark legacy HR APIs as compatibility routes`（Phase 3）
- [x] `fix(api): complete Phase 3 rework — migrate frontend to /api/modules/hr/roster/*, old routes pure proxy, docs updated`
- [x] `refactor(admin): split permissions matrix files`（Phase 4）
- [x] `refactor(hr-code): finish code table decomposition`（Phase 4）
- [x] `chore(service): migrate admin permission-grants to service layer`（Phase 5）
- [x] `chore(scripts): classify scripts and add naming rules`（Phase 6）
- [x] `feat(template): add new domain module checklist`（Phase 7）

每个任务都独立验证和提交。

## 给 Agent 的一句话

新增业务能力时，不要问“放哪个现成文件最方便”，要问：

```txt
这是哪个 domain？
事实数据在哪？
计算逻辑在哪？
API 权限是什么？
UI 只展示什么？
文档更新了吗？
硬约束能过吗？
```

答不上来，就先补架构说明，不要先写代码。
