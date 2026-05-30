<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# HR 项目架构

## 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`data/dev.db`)
- **认证**: JWT Cookie + API Key (个人)
- **部署**: `npm run build` → `./deploy.sh` (普通) / `./deploy.sh --push-db` (schema变更)

## 项目地图

本项目不是单一 HR 应用，而是会继续扩展 HR、财务、库存、合同、绩效、采购、生产等模块的内部管理系统。新增能力时先判断它属于哪一层：

| 层级 | 目录 | 职责 |
|---|---|---|
| 业务页面 | `app/<domain>/` | 页面、组件、hooks、types、领域 `ARCHITECTURE.md` |
| API | `app/api/<domain>/` | 鉴权、参数校验、调用 service、返回 DTO |
| 开发辅助 | `app/api/dev-login-bypass/` | 开发环境快速登录（仅本地） |
| 业务服务 | `server/services/<domain>/` | 查询、导入、计算、聚合、业务规则 |
| 认证权限 | `server/auth/`, `server/rbac/`, `lib/permissions.ts` | 登录、session、RBAC、资源树 |
| 数据库 | `prisma/` | Prisma schema、migration、seed |
| 共享前端 | `app/components/`, `app/hooks/` | 全站复用 UI 和 hooks |
| 共享工具 | `lib/` | 跨端类型、常量、Prisma client、历史工具 |
| 文档治理 | `docs/`, `app/*/ARCHITECTURE.md` | 项目地图和模块边界 |

新增业务模块必须按同一套目录契约落位。例如绩效模块应使用 `app/performance/`、`app/api/performance/`、`server/services/performance/`，采购模块应使用 `app/procurement/`、`app/api/procurement/`、`server/services/procurement/`。禁止把新模块塞进 HR、Finance 或通用 `lib/` 里借壳生长。

## 必读文档触发条件

Agent 不要只靠目录名猜架构。遇到下列任务时，必须先读对应文档，再改代码：

| 任务类型 | 必读文档 |
|---|---|
| 任何跨目录、跨模块、超过单文件的小改动 | `README.md`、`docs/architecture-governance.md` |
| 评估”现在架构怎么优化”或整理目录 | `docs/planning/architecture-optimization-roadmap.md`、`docs/architecture-governance.md` |
| 新增业务模块，例如绩效、采购、生产 | `README.md`、`docs/architecture-governance.md`、`docs/planning/new-domain-template.md`，并新建 `app/<domain>/ARCHITECTURE.md` |
| 修改 Prisma schema、migration、seed、导入脚本 | `docs/schema-governance.md`、`docs/database.md`、对应模块 `ARCHITECTURE.md` |
| 修改权限、授权、后台权限 UI、资源树 | `docs/security/rbac.md`、`docs/architecture-governance.md`、`lib/permissions.ts` |
| 修改 HR 模块 | `app/hr/ARCHITECTURE.md` |
| 修改财务成本模块 | `app/finance/cost/ARCHITECTURE.md` |
| 修改环境变量、`.env.example`、部署脚本、CI | `docs/ops/environment.md`、`docs/ops/deploy.md` |
| 使用 Next.js 路由、构建、缓存、Server Component 等框架能力 | 先读 `node_modules/next/dist/docs/` 里相关 Next.js 16 文档 |

如果任务同时命中多个条件，全部相关文档都要读。读完后在交付说明里写明参考了哪些文档，以及是否同步更新了文档。

## 新模块接入流程

1. 在 `app/lib/module-nav.tsx` 的 `MODULES` 数组注册新模块，设置 `requiredPerm` 权限字段。
2. 先更新 `README.md` 的模块地图和本文件的规则。
3. 创建或更新 `app/<domain>/ARCHITECTURE.md`，写清楚数据来源、事实字段、计算字段、权限、页面。
4. 在 `lib/permissions.ts` 注册资源 key，动作只用 `access / write / delete / admin`。
5. 设计 Prisma schema：DB 只保存事实字段、来源追溯和必要状态。
6. 在 `server/services/<domain>/` 写业务逻辑；API route 不写复杂计算。
7. 在 `app/api/<domain>/` 写 route handler，GET/POST/PUT/PATCH/DELETE 必须匹配权限动作。
8. 在 `app/<domain>/` 写 UI：模块首页用 `ModuleHome`，子页面用 `AppShell`，页面 facade 只组合组件和 hooks。
9. 交付前运行硬约束、lint、type-check、build，并提交一个清晰 commit。

核心原则：

```
DB 存事实。
Service 算结果。
API 返回 DTO。
UI 展示结果。
文档解释边界。
CI 拦住越界。
```

## 数据库模型

核心业务表（seed JSON 与表字段一一对应，除审计字段外）：

| 表 | JSON 来源 | 说明 |
|---|---|---|
| `Employee` | `employees.json` | 员工基础信息（16 字段） |
| `Employment` | `employments.json` | 雇佣信息（status/company/joinDate/leaveDate/contracts 等） |
| `EDP` | `employee_positions.json` | 员工-部门-岗位关联（`@@map("EmployeePosition")`） |
| `Department` | `department.json` | 部门树（扁平存储，parentId 推导自 children） |
| `Position` | `position.json` | 岗位 |
| `PositionDescription` | `position-descriptions/*.json` | 岗位说明书（details 为 JSON  blob） |
| `Company` | `companies.json` | 公司 |

**已删除的表/字段**：ManagementGroup（整张表）、Employee.deleted/deletedTime/deletedBy、EDP.system/center/sortOrder、Department.sortOrder 等。

**审计字段**（统一顺序：`editedBy → editor → editedAt → version → createdAt → updatedAt`）：Employee、Employment、Company、Department、Position、EDP、Project、EmployeeProject、PositionDescription、Report 均具备。

Schema 可视化文档：`docs/generated/tables.html`（自动生成，运行 `node scripts/gen-tables-html.js`）。

## Prisma Schema 规则

- 当前 schema 仍在 `prisma/schema.prisma`，新增领域前优先完成或遵守多文件 schema 治理计划。
- 目标结构是按领域拆分到 `prisma/models/*.prisma`，主 `prisma/schema.prisma` 只保留 `generator` 和 `datasource`。
- 所有 model 必须按领域归属：auth/rbac、hr、reports、works、finance-ledger、finance-cost、inventory、contracts、future domains。
- 每个 model 前必须有 `///` 注释，说明业务含义、数据来源、是否事实表。
- DB 默认只保存事实字段；合计、百分比、毛利、单位成本、未回款等派生结果必须放在 service 层计算。
- Finance Cost 禁止把 normalized JSON 原样映射成 DB schema。
- 修改 schema 后必须同步更新对应 `ARCHITECTURE.md` 和 `docs/database.md` 或 `docs/schema-governance.md`。

## 数据导入

源数据在 `prisma/seed-data/*.json`、`prisma/seed-data/position-descriptions/*.json` 和 `prisma/seed-data/department-descriptions/*.json`：

```
Company → Department → PositionDescription → Position → Employee → Employment → EDP
```

重置数据：`rm data/dev.db && npx prisma db push`

## 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 工作汇报 | `/reports` | 登录 |
| 历史记录 | `/history` | 登录 |
| 工作清单 | `/works` | 登录 |
| 人事行政 | `/hr` | `people.access` |
| 管理后台 | `/admin` | `system.admin` 或 `people.access` |
| API接入 | `/api-guide` | 登录 |
| 设置 | `/settings` | 登录 |
| 文档中心 | `/docs` | 登录 |
| 资料库 | `/library` | 登录 |
| 财务数据 | `/finance` | 登录 |
| 成本管理 | `/finance/cost` | `finance.access` 或 `finance.cost.access` |

## 认证方式

1. **网页版**: Cookie JWT (`token`)
2. **API接入**: `X-API-Key`(个人) + `X-Username` + `X-Password`
3. **权限校验**: `lib/auth.ts` — `authenticate()`, `checkPermission()`, `checkHRAccess()`

## API 权限规则

- 页面按钮隐藏不是安全边界，所有写入和删除必须在 API 层校验。
- GET 使用 `access`；POST/PUT/PATCH 使用 `write`；DELETE 使用 `delete`；授权和系统配置使用 `admin` 或 `system.admin`。
- 新 API route 只允许做四件事：认证、参数校验、调用 service、返回 DTO。
- 复杂查询、导入、汇总、派生字段计算必须放到 `server/services/<domain>/`。
- 旧兼容 API 可以保留代理，但新功能必须走领域入口，例如 HR 新接口走 `app/api/hr/*`，财务成本走 `app/api/finance/cost/*`。

---

# 业务规则

## 公司分组

- **体系判断**：通过 code 前缀，`isPharma(code)`（startsWith "PPA" / "04"）→ GMP/丰华制药，其余 → 常规体系/丰华生物。所有判断从 `lib/company.ts` 导入，禁止硬编码。
- **常量**：`CODE_TO_NAME`, `FENGHUA_BIO_GROUP`, `SHARED_GROUP_CODES`, `isPharma`, `isBio`

## 编码规则

- 部门：L1=`前缀001`，L2=`前缀100/200`，L3=`前缀101`
- 岗位：`GW-{dept}-{seq}`，GMP 岗位带 `PPA-` 前缀

---

# 前端规范

## 共享组件（必须使用，禁止重复造轮子）

| 组件 | 用途 | 导入 |
|------|------|------|
| `ConfirmModal` | 确认弹框 | `@/app/components/ConfirmModal` |
| `DetailModal` | 通用详情弹窗 | `@/app/components/DetailModal` |
| `EditToolbar` | 编辑工具栏（编辑→保存+取消+版本） | `@/app/components/EditToolbar` |
| `Toast` + `useToast` | 通知提示 | `@/app/components/Toast` + `@/app/hooks/useToast` |
| `FilterBar` | 筛选栏容器 | `@/app/components/FilterBar` |
| `SearchBox` | 统一搜索框（可配target/filters/debounce） | `@/app/components/SearchBox` |
| `TargetSwitcher` | 汇报对象两段选择器 | `@/app/components/TargetSwitcher` |

**规范**:
- 确认弹框 → `<ConfirmModal>`，禁止 `window.confirm`
- 通知 → `useToast()`，禁止裸 `setTimeout`
- 公司名/编码 → `lib/company` 导入，禁止硬编码
- API 鉴权 → `lib/auth.ts`
- 搜索 → `useSearch` hook 或 `<SearchBox>` 组件
- 当前用户类型 → `import { SessionUser } from "@/lib/types"`，禁止页面内重复定义 `interface User`
- 业务页面 facade 负责组合，不承载大段业务逻辑；超过 150 行应拆 components/hooks。
- 文件大小是硬约束：组件/hook 不超过 220 行，API route 不超过 120 行，service 不超过 260 行；超限时必须先拆分到红线内，不能用历史白名单放行。
- 新业务模块必须有 `types.ts`、必要 hooks/components，以及 `ARCHITECTURE.md`。
- 禁止在页面里直接堆 fetch、权限判断、复杂映射和计算；这些应分别下沉到 hook、API/service、权限 helper。

---

# lib/ 工具模块

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `lib/company.ts` | 公司常量/分组/体系判断 | `CODE_TO_NAME`, `FENGHUA_BIO_GROUP`, `SHARED_GROUP_CODES`, `resolveCompanyFilter`, `isPharma`, `isBio` |
| `lib/types.ts` | 共享类型 | `SessionUser`（当前用户，全站统一，禁止各处重复定义） |
| `lib/security.ts` | 登录安全 | `checkBruteForce`, `recordAttempt` |
| `lib/search.ts` | 拼音搜索 | `getInitials`, `matchEmployee` |
| `lib/auth.ts` | 认证鉴权 | `authenticate`, `checkPermission`, `checkHRAccess`, `checkWorksAccess` |
| `lib/access.ts` | 目标权限 | `getUserTargets`, `canAccessTarget`, `canSubmitToTarget` |
| `lib/permissions.ts` | RBAC常量 | `RES`(资源树), `ROLE`(5角色), `perm`(兼容) |
| `lib/period.ts` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPeriodOptions`, `PeriodType` |
| `server/services/finance-cost/` | 成本管理业务逻辑 | 汇总、导入、查询、计算 |
| `lib/prisma.ts` | 数据库 | `import { prisma } from "@/lib/prisma"` |
| `lib/useSearch.ts` | 统一搜索hook | `useSearch({ target, mode, filters, debounceMs })` |

## 硬约束

交付前必须运行：

```
npm run arch:check
npm run size:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

提交规则：

- 每次完成一个独立任务后要提交 commit。
- commit 前先看 `git status`，不要把无关文件、`.env`、数据库、`.DS_Store`、临时 planning 文件提交进去。
- 已有用户或其他 agent 的改动不得回滚；如需跨任务整理，单独开治理任务。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、AGENTS/CLAUDE 或对应 `ARCHITECTURE.md`。
