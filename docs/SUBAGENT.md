# Sub Agent 速查

> 当前日期：请通过系统提示确认，不要猜测。

## 必须遵守

- 禁止硬编码：公司名/编码从 `Company` 表通过 `@/server/services/hr/company-directory.ts` 查询获取，UI组件用共享组件
- 确认弹框 → `<ConfirmModal>`，通知 → `useToast()`，表格编辑 → `<EditToolbar>`
- API 鉴权 → `@/lib/auth`，禁止在路由中本地定义鉴权函数
- 改完代码后必须 `npx tsc --noEmit` 验证零错误
- 不添加超出需求的功能，不修改无关代码

## 共享模块

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `@/server/services/hr/company-directory.ts` | 公司事实查询 | `getCompanyByCode`, `getCompanyNameByCode`, `getManagementGroupByCode`, `getCodePoolCode`, `loadCompanyMap`, `isPharmaSync`, `getCompanyNameSync` |
| `@/lib/search` | 拼音搜索 | `getInitials`, `matchEmployee` |
| `@/lib/auth` | 认证鉴权 | `authenticate`, `checkPermission`, `requireAdmin`, `isAdmin`, `isGroupAdmin` |
| `@/lib/permissions` | RBAC常量 | `RES`(资源树), `ROLE`(5角色), `perm`(兼容) |
| `@/lib/period` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPreviousPeriod`, `getPeriodOptions`, `getPeriodTypeName`, `PeriodType` |
| `@/lib/prisma` | 数据库 | `import { prisma } from "@/lib/prisma"` |

## 共享模块

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `server/services/hr/company-directory.ts` | 公司事实查询 | `getCompanyByCode`, `getCompanyNameByCode`, `getManagementGroupByCode`, `getCodePoolCode`, `loadCompanyMap`, `isPharmaSync`, `getCompanyNameSync` |
| `lib/search` | 拼音搜索 | `matchEmployee`, `getInitials`（唯一 import `pinyin-pro` 的地方） |
| `lib/auth` | 认证鉴权 | `authenticate`, `checkPermission`, `checkHRAccess` |
| `lib/period` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPeriodOptions` |
| `lib/crud` | CRUD模板 | `handleCreate`, `handleUpdate`, `handleDelete` |
| `lib/prisma` | 数据库 | `import { prisma } from "@/lib/prisma"` |
| `lib/types` | 共享类型 | `SessionUser`（全站统一，禁止各处重复定义） |

## 共享组件/ Hooks

| 位置 | 导入示例 |
|------|----------|
| `app/components/` | ConfirmModal, DetailModal, EditToolbar, Toast, SearchBox, FilterBar, AutoSizeInput, EntitySearchInput... |
| `app/hooks/` | `useToast`, `useSearch` |

## 代码规范

- **超 300 行必须拆分**：数据逻辑 → `useXxx.ts`，UI → 子组件
- **搜索统一走 `lib/search`**：自带拼音，禁止直接 import `pinyin-pro`
- **API 路由统一走 `api/hr/`**（11 个子模块），旧 `api/employees/` 等已删

## 项目结构

```
app/
├── hr/                         人事管理（主模块）
│   ├── page.tsx, tabConfigs.ts, types.ts
│   ├── tabs/           (15)    EmployeeTab, GenericTableTab, EditableTable...
│   ├── components/      (6)    FKInput, FilterModal, AutoSizeInput...
│   ├── hooks/           (1)    useGenericTab
│   ├── code/            (5)    CodeTab, CodeTable, useCodeTab, useCodeHelpers...
│   └── analytics/       (5 tab) employee/, position/, shared/StatCard
├── admin/                      管理后台
│   ├── page.tsx, types.ts, lib.ts
│   ├── tabs/           (6)    ByUserTab, ByPermissionTab...
│   ├── components/     (2)    UserPermCard, PermissionDrilldown
│   └── hooks/          (5)    useByUserTab, useByPermissionTab...
├── components/         (13)   项目通用组件 (Toast, SearchBox, ConfirmModal...)
├── hooks/               (2)   useToast, useSearch
├── works/ reports/ settings/  各独立页面
├── api/
│   ├── hr/            (11)   HR CRUD 路由（主入口）
│   ├── admin/          (9)   管理后台路由
│   └── auth/ works/ reports/  其他路由
└── lib/                      服务端工具 (auth, search, company, period, prisma)
```

## 部署

```bash
npm run build && ./deploy.sh              # 普通
npm run build && ./deploy.sh --push-db     # schema变更
```

Schema 变更：先 `npx prisma db push`，再 build。
