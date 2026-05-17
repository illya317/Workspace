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

- 筛选按一级（丰华生物体系/丰华制药），显示按二级公司名
- 所有常量从 `lib/company.ts` 导入

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

## 子 Agent

- 复杂任务优先拆 Sub Agent 并行执行
- **分配子 Agent 时必须告知 `@SUBAGENT.md`**

---

# lib/ 工具模块

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `lib/company.ts` | 公司常量/分组 | `CODE_TO_NAME`, `FENGHUA_BIO_GROUP`, `SHARED_GROUP_CODES`, `resolveCompanyFilter` |
| `lib/search.ts` | 拼音搜索 | `getInitials`, `matchEmployee` |
| `lib/auth.ts` | 认证鉴权 | `authenticate`, `checkPermission`, `checkHRAccess`, `checkWorksAccess` |
| `lib/access.ts` | 目标权限 | `getUserTargets`, `canAccessTarget`, `canSubmitToTarget` |
| `lib/permissions.ts` | RBAC常量 | `RES`(资源树), `ROLE`(5角色), `perm`(兼容) |
| `lib/period.ts` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPeriodOptions`, `PeriodType` |
| `lib/prisma.ts` | 数据库 | `import { prisma } from "@/lib/prisma"` |
| `lib/useSearch.ts` | 统一搜索hook | `useSearch({ target, mode, filters, debounceMs })` |
