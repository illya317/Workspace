<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# HR 项目架构

## 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`prisma/dev.db`)
- **认证**: JWT Cookie + API Key (个人)
- **部署**: `npm run build` → `./deploy.sh` (普通) / `./deploy.sh --push-db` (schema变更)

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

Schema 可视化文档：`docs/tables.html`（自动生成，运行 `node scripts/gen-tables-html.js`）。

## 数据导入

源数据在 `prisma/seed/*.json` 和 `web/position-descriptions/*.json`，通过 `scripts/import-seed.js` 导入：

```
Company → Department → PositionDescription → Position → Employee → Employment → EDP
```

重置数据：`rm prisma/dev.db && npx prisma db push && node scripts/import-seed.js`

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
| 财务数据 | `/finance` | 登录 |

## 认证方式

1. **网页版**: Cookie JWT (`token`)
2. **API接入**: `X-API-Key`(个人) + `X-Username` + `X-Password`
3. **权限校验**: `lib/auth.ts` — `authenticate()`, `checkPermission()`, `checkHRAccess()`

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

## 子 Agent

- 复杂任务优先拆 Sub Agent 并行执行
- **分配子 Agent 时必须告知 `@SUBAGENT.md`**

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
| `lib/prisma.ts` | 数据库 | `import { prisma } from "@/lib/prisma"` |
| `lib/useSearch.ts` | 统一搜索hook | `useSearch({ target, mode, filters, debounceMs })` |
