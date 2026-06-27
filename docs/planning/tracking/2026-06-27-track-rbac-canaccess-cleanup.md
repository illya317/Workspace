# Plan: 清理 `canAccess*` 旧 boolean 字段，统一为 `visibleResourceKeys` + `requireResourceAccess`

> 历史计划归档：本文记录旧 `canAccess*` 清理过程，部分 Settings 入口描述已被后续统一权限模型取代。现行规则以 `AGENTS.md`、`docs/engineering/architecture-governance.md`、`docs/engineering/security/rbac.md` 和 `docs/engineering/security/permission-matrix.md` 为准。

## Context

当前权限架构有两套并行的判断逻辑：

1. **新机制（DB-driven）**：`visibleResourceKeys[]` + `requireResourceAccess(resourceKey)`
   - Portal 菜单过滤：`module-nav.tsx` 的 `canAccess()` 检查 `visibleResourceKeys`
   - 页面路由门禁：`server/auth/guard.ts` 的 `requireResourceAccess()`
   - 数据来自 `UserResourceRole` / `PositionResourceRole` / `DepartmentResourceRole`

2. **旧机制（Session boolean）**：`canAccessFinance`、`canAccessWorks` 等 15+ 个硬编码字段
   - 在 `server/auth/session.ts` 里手动拼 OR 链生成
   - 被 12+ 个模块首页的 page.tsx 用于路由门禁
   - 和 `module-nav.tsx` 的 `MODULES` 定义**独立维护**，新增资源时容易遗漏同步

用户想要的架构：**权限和页面绑定（page-level），不是和入口绑定（entry-level）**。Portal 菜单应该只是"根据页面权限自动展示"，不单独维护入口权限。

## 问题分析

### 风险 1：Portal 和页面门禁不同步

`session.ts:64-71` 的硬编码 OR 链：
```ts
const financeKeys = ["finance", "finance.cost", "finance.ledger",
                     "finance.statements", "finance.budget",
                     "finance.analysis", "finance.import"];
const hasFinance = financeKeys.some(ma);
```

这次新增 `finance.tax`、`finance.treasury` **没有**加到 `financeKeys` 里。导致：
- Portal 菜单：用户有 `finance.tax` → `visibleResourceKeys` 含 `finance`（祖先传播）→ Portal 显示 finance 菜单 ✅
- `/finance` 首页：`canAccessFinance` 检查 `financeKeys.some()` → `finance.tax` 不在列表 → `false` → 页面 redirect ❌

**Portal 和页面门禁判断标准不同。**

### 风险 2：`visibleResourceKeys` 的祖先传播已天然替代 `canAccessFinance`

`server/rbac/visibility.ts` 的逻辑：用户对任一子资源有权限 → 祖先自动可见。
- 用户有 `finance.tax` → `visibleResourceKeys` 自动包含 `finance.tax` + `finance`
- 所以 `requireResourceAccess("finance")` **已经等价于** `canAccessFinance`

`canAccessFinance` 是冗余的，而且维护两套逻辑容易出错。

### 风险 3：代码两套并存，新人困惑

项目守则写"页面统一使用 `requireResourceAccess`"，但 `/finance`、`/external` 等首页实际用 `canAccessFinance`、`canAccessExternal`。新人不知道该用哪个。

## 目标

1. 所有模块首页 page.tsx 统一改用 `requireResourceAccess(resourceKey)`
2. 从 `SessionUser` 类型中删除所有 `canAccess*` 旧字段（或标记为 deprecated）
3. 从 `server/auth/session.ts` 中删除旧字段生成逻辑
4. Portal 菜单和页面门禁完全同源（都读 `visibleResourceKeys`）
5. 硬约束脚本 `check-module-page-gates.js` 检测所有 page 的权限门禁

## 方案

### Phase 1：迁移模块首页 page.tsx（P1）

将以下 12 个仍在用旧 boolean 的 page.tsx 改为 `requireResourceAccess`：

| 页面 | 当前权限 | 新权限 |
|------|---------|--------|
| `/work/tasks` | `canAccessWorks` | `requireResourceAccess("work.tasks")` |
| `/settings/admin` | `canAccessAdmin` | `requireAdminManageAccess()` |
| `/administration/contracts` | `canAccessContract` | `requireResourceAccess("administration.contracts")` |
| `/docs` | `canAccessDocs` | `requireResourceAccess("docs")` |
| `/production` | 旧生产入口判断 | `requireResourceAccess("production")` |
| `/finance` | `canAccessFinance` | `requireResourceAccess("finance")` |
| `/administration` | `canAccessContract` | `requireResourceAccess("administration")` |
| `/external` | `canAccessExternal` | `requireResourceAccess("external")` |
| `/hr` | 手动 `visibleResourceKeys` OR 链 | `requireResourceAccess("hr")` |

**注意**：`/settings`、`/portal` 保持仅登录可见，无需 resourceKey。

**模式**：每个 page.tsx 的修改是同一模式：
```tsx
// 旧
import { getCurrentUser } from "@/server/auth/session";
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  // ...
}

// 新
import { requireResourceAccess } from "@/server/auth/guard";
export default async function Page() {
  const user = await requireResourceAccess("finance");
  // ...
}
```

### Phase 2：清理 `requireAuth()` page.tsx（P2）

10 个 page.tsx 当前用 `requireAuth()`（仅检查登录），但父级 layout.tsx 已有 `requireResourceAccess`。这些 page 可以：
- 保持 `requireAuth()`（layout 已经做了权限门禁）
- 或者改为直接从 `getCurrentUser()` 接收 user（避免双重 DB 查询）

**决策**：保持现状，因为 layout.tsx 已经做了权限控制，page.tsx 只需要确保登录状态。不需要改动。

### Phase 3：删除 `canAccess*` 旧字段（P3）

**3a. `lib/types.ts`**
删除 `SessionUser` 接口中所有 `canAccess*` 字段：
- `canAccessWorks`
- `canAccessFinance`
- `canAccessFinanceCost`
- `canAccessFinanceLedger`
- `canAccessFinanceReport`
- `canAccessFinanceBudget`
- `canAccessFinanceAnalysis`
- `canAccessFinanceImport`
- `canAccessContract`
- `canAccessDocs`
- `canAccessExternal`
- `canAccessLibrary`
- `canAccessApi`
- `canAccessAgent`
- `canAccessAdmin`
- `canManagePermissions`

**3b. `server/auth/session.ts`**
删除第 63-97 行的旧字段生成逻辑，只保留 `visibleResourceKeys` 和 `visibleWriteResourceKeys`。

**3c. 所有引用旧字段的 frontend 代码**
搜索并替换所有 `user.canAccess*` 引用，改为 `visibleResourceKeys.includes(resourceKey)`：
- `app/hr/page.tsx`：`HR_KEYS.some((k) => user.visibleResourceKeys?.includes(k))` → 改为 `requireResourceAccess("hr")`
- `app/hr/HRClient.tsx`：`(user.visibleResourceKeys || []).includes(key)` → 已正确，保留
- `app/hr/performance/HRPerformanceClient.tsx`：同上，已正确
- `app/hr/analytics/HRAnalyticsClient.tsx`：同上，已正确
- `packages/platform/ui/settings/SettingsClient.tsx`：`canAccessApi`、`canAccessAdmin` → 改为检查 `visibleResourceKeys`
- `app/docs/DocsClient.tsx`：`canAccessApi` → 改为检查 `visibleResourceKeys`
- `app/(system)/settings/admin/page.tsx`：`canAccessAdmin` → Phase 1 已改
- `app/finance/lib/nav-utils.ts`：`canAccessFinanceCost/Ledger/Report/Budget/Analysis/Import` → 改为 `visibleResourceKeys.includes("finance.cost")` 等
- `server/services/agent/tools/finance.ts`：`canAccessFinanceBudget` → 改为 `visibleResourceKeys.includes("finance.budget")`
- `app/api/modules/library/basic-info/[...path]/route.ts`：`canAccessLibrary` → 改为 `visibleResourceKeys.includes("library.basicInfo")`

**3d. 删除未使用的守卫函数**
`server/auth/session.ts` 中 11 个 `require*Access` 函数完全未被调用，直接删除：
- `requireAdminAccess`
- `requireFinanceAccess`
- `requireWorksAccess`
- `requireContractAccess`
- `requireFinanceCostAccess`
- `requireFinanceLedgerAccess`
- `requireFinanceReportAccess`
- `requireFinanceBudgetAccess`
- `requireFinanceAnalysisAccess`
- `requireFinanceImportAccess`
- `requireInventoryAccess`

**3e. 删除未使用的字段**
`canManagePermissions` 和 `canAccessAgent` 无业务引用，直接删除。

### Phase 4：更新硬约束白名单（P4）

`scripts/check/check-module-page-gates.js` 的 `LEGACY_EXCEPTIONS` 列表中的 15 个页面，在 Phase 1 迁移后大部分可以移除：
- `app/finance/page.tsx` → 已改为 `requireResourceAccess("finance")`
- `app/external/page.tsx` → 已改为 `requireResourceAccess("external")`
- 其他类似

移除后 `LEGACY_EXCEPTIONS` 只保留真正需要放行的页面（如 `/settings`、`/portal` 等无 resourceKey 的页面）。

### Phase 5：更新文档（P5）

- `docs/engineering/security/rbac.md`：更新权限判断流程说明，删除旧 boolean 字段相关描述
- `app/finance/ARCHITECTURE.md`：已更新，确认所有 Guard 描述准确
- `AGENTS.md` / `docs/engineering/agent-handbook.md`：如有旧 boolean 字段的引用，同步更新

## 验证

```bash
# 1. 检查所有 page.tsx 不再引用 canAccess*
grep -rn "canAccess" app --include="*.tsx" | grep -v "visibleResourceKeys"
# 期望：只有已知兼容路径或历史计划文档有残留

# 2. 检查 session.ts 不再生成 canAccess*
grep -n "canAccess" server/auth/session.ts
# 期望：无匹配

# 3. 硬约束通过
npm run arch:gate

# 4. 全量验收
npm run lint -- --max-warnings=0
npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=8192" npm run build
```

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `app/finance/page.tsx` | `canAccessFinance` → `requireResourceAccess("finance")` |
| `app/external/page.tsx` | `canAccessExternal` → `requireResourceAccess("external")` |
| `app/production/page.tsx` | 旧生产入口判断 → `requireResourceAccess("production")` |
| `app/(modules)/administration/page.tsx` | `canAccessContract` → `requireResourceAccess("administration")` |
| `app/(modules)/administration/contracts/page.tsx` | `canAccessContract` → `requireResourceAccess("administration.contracts")` |
| `app/docs/page.tsx` | `canAccessDocs` → `requireResourceAccess("docs")` |
| `app/(modules)/work/tasks/page.tsx` | `canAccessWorks` → `requireResourceAccess("work.tasks")` |
| `app/(system)/settings/admin/page.tsx` | `canAccessAdmin` → `requireAdminManageAccess()` |
| `app/hr/page.tsx` | `visibleResourceKeys` OR 链 → `requireResourceAccess("hr")` |
| `packages/platform/ui/settings/SettingsClient.tsx` | API 接入并入 `settings.account` 正文 |
| `app/docs/DocsClient.tsx` | API 文档/接入不再依赖独立设置 API 资源 |
| `lib/types.ts` | 删除所有 `canAccess*` 字段 |
| `server/auth/session.ts` | 删除旧字段生成逻辑 |
| `scripts/check/check-module-page-gates.js` | 缩减 LEGACY_EXCEPTIONS |
| `docs/engineering/security/rbac.md` | 更新权限模型说明 |

## 依赖与风险

- **TypeScript 类型删除是破坏性变更**：所有引用 `canAccess*` 的类型都需要同步改。改动量大，但模式统一，适合派 agent 并行处理。
- **Work 子页面权限**：`work.tasks` 在工作管理体系里是独立资源，必须使用对应 resourceKey。
- **/settings/admin 的权限**：使用 `requireAdminManageAccess()`；内置 root admin 或可管理任一资源的用户可进入，`system` 不再是 RBAC resource。
