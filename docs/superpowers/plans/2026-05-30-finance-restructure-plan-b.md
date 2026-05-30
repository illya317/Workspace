# Plan B: Service 与权限治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 finance 子模块权限资源（ledger/report/budget/analysis/import），对齐页面/API guard，将 `server/services/finance/` 按业务领域分层。

**Architecture:** 新增 5 个 finance 子资源权限键，每个子资源独立的 access/write/delete 检查链；页面 guard 从统一 `canAccessFinance` 拆分到各子资源；API route 使用对应 `withFinanceXxxAccess` wrapper；service 层按 ledger/statements/budget/import 拆分子目录。

**Tech Stack:** Next.js 16, TypeScript, Prisma, RBAC (server/rbac/)

---

## 文件结构

### 新增/修改（权限基础设施）
- `lib/permissions.ts` — 新增 RES.finance.ledger/budget/analysis/import
- `server/auth/domain.ts` — 新增 5 组 checkFinanceXxxAccess 函数
- `lib/with-auth.ts` — 新增 5 组 withFinanceXxxAccess wrapper
- `server/auth/session.ts` — 新增 5 个 canAccessFinanceXxx 字段
- `lib/types.ts` — SessionUser 新增 5 个布尔字段

### 修改（页面 guard）
- `app/finance/ledger/page.tsx` — canAccessFinance → canAccessFinanceLedger
- `app/finance/statements/page.tsx` — canAccessFinance → canAccessFinanceReport
- `app/finance/budget/page.tsx` — canAccessFinance → canAccessFinanceBudget
- `app/finance/analysis/page.tsx` — canAccessFinance → canAccessFinanceAnalysis
- `app/finance/import/page.tsx` — canAccessFinance → canAccessFinanceImport
- `app/finance/page.tsx` — 保持 canAccessFinance（入口页）

### 修改（API guard）
- `app/api/finance/accounts/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/accounts/[id]/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/vouchers/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/vouchers/[id]/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/balances/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/balances/reconcile/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/periods/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/periods/[id]/route.ts` — withFinanceAccess → withFinanceLedgerAccess
- `app/api/finance/init/route.ts` — withFinanceWrite → withFinanceLedgerWrite
- `app/api/finance/reports/route.ts` — withFinanceAccess → withFinanceReportAccess
- `app/api/finance/budget/route.ts` — withFinanceAccess/withFinanceWrite → withFinanceBudgetAccess/withFinanceBudgetWrite
- `app/api/finance/import/preview/route.ts` — withFinanceAccess → withFinanceImportAccess
- `app/api/finance/import/confirm/route.ts` — withFinanceWrite → withFinanceImportWrite

### 移动（Service 分层）
```
server/services/finance/
  ledger/
    balances.ts              ← 从根目录移动
    annual-balances.ts       ← 从根目录移动
    balance-helpers.ts       ← 从根目录移动
    balance-utils.ts         ← 从根目录移动
    balance-reconcile.ts     ← 从根目录移动
    voucher-service.ts       ← 从根目录移动
  statements/
    report-generator.ts      ← 从根目录移动
    report-helpers.ts        ← 从根目录移动
    reports/
      balance-sheet.ts       ← 从根目录移动
      income-statement.ts    ← 从根目录移动
      cash-flow.ts           ← 从根目录移动
  budget/
    budget-data.ts           ← 从根目录移动
  import/
    import.ts                ← 从根目录移动
    import-confirm.ts        ← 从根目录移动
    parsers/
      account-parser.ts      ← 从根目录移动
      balance-parser.ts      ← 从根目录移动
      voucher-parser.ts      ← 从根目录移动
```

---

## 执行批次

### Batch 1: 权限基础设施

**范围:** lib/permissions.ts, server/auth/domain.ts, lib/with-auth.ts, server/auth/session.ts, lib/types.ts

- [ ] **Step 1: 新增权限资源常量**

  **File:** `lib/permissions.ts`

  在 `RES.finance` 下新增 4 个资源键（report 已存在）：

  ```typescript
  finance: {
    root: "finance",
    account: "finance.account",
    voucher: "finance.voucher",
    report: "finance.report",
    ledger: "finance.ledger",       // 新增
    budget: "finance.budget",       // 新增
    analysis: "finance.analysis",   // 新增
    import: "finance.import",       // 新增
    cost: "finance.cost",
    costShipments: "finance.cost.shipments",
    costAnalysis: "finance.cost.analysis",
    costStructure: "finance.cost.structure",
    costWorkshop: "finance.cost.workshop",
    costSalary: "finance.cost.salary",
    costImports: "finance.cost.imports",
  },
  ```

- [ ] **Step 2: 新增 domain access checkers**

  **File:** `server/auth/domain.ts`

  在 `checkFinanceCostAccess` 之后新增 5 组函数（模式与 checkFinanceCostAccess 一致：先检查子资源权限，再回退到父资源 finance）：

  ```typescript
  // ─── finance.ledger ───────────────────────────────────────
  export async function checkFinanceLedgerAccess(
    userId: number,
    roleKey: "access" | "write" | "delete" | "admin" = "access",
  ): Promise<boolean> {
    if (await checkPermission(userId, "system", "admin")) return true;
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, "finance.ledger", "access")) ||
        (await checkPermission(userId, "finance.ledger", "write")) ||
        (await checkPermission(userId, "finance.ledger", "delete")) ||
        (await checkPermission(userId, "finance", "access")) ||
        (await checkPermission(userId, "finance", "write")) ||
        (await checkPermission(userId, "finance", "delete"))
      );
    }
    return (
      (await checkPermission(userId, "finance.ledger", roleKey)) ||
      (await checkPermission(userId, "finance", roleKey))
    );
  }

  export async function checkFinanceLedgerWrite(userId: number): Promise<boolean> {
    return checkFinanceLedgerAccess(userId, "write");
  }

  export async function checkFinanceLedgerDelete(userId: number): Promise<boolean> {
    return checkFinanceLedgerAccess(userId, "delete");
  }

  // ─── finance.report ───────────────────────────────────────
  export async function checkFinanceReportAccess(
    userId: number,
    roleKey: "access" | "write" | "delete" | "admin" = "access",
  ): Promise<boolean> {
    if (await checkPermission(userId, "system", "admin")) return true;
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, "finance.report", "access")) ||
        (await checkPermission(userId, "finance.report", "write")) ||
        (await checkPermission(userId, "finance.report", "delete")) ||
        (await checkPermission(userId, "finance", "access")) ||
        (await checkPermission(userId, "finance", "write")) ||
        (await checkPermission(userId, "finance", "delete"))
      );
    }
    return (
      (await checkPermission(userId, "finance.report", roleKey)) ||
      (await checkPermission(userId, "finance", roleKey))
    );
  }

  export async function checkFinanceReportWrite(userId: number): Promise<boolean> {
    return checkFinanceReportAccess(userId, "write");
  }

  export async function checkFinanceReportDelete(userId: number): Promise<boolean> {
    return checkFinanceReportAccess(userId, "delete");
  }

  // ─── finance.budget ───────────────────────────────────────
  export async function checkFinanceBudgetAccess(
    userId: number,
    roleKey: "access" | "write" | "delete" | "admin" = "access",
  ): Promise<boolean> {
    if (await checkPermission(userId, "system", "admin")) return true;
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, "finance.budget", "access")) ||
        (await checkPermission(userId, "finance.budget", "write")) ||
        (await checkPermission(userId, "finance.budget", "delete")) ||
        (await checkPermission(userId, "finance", "access")) ||
        (await checkPermission(userId, "finance", "write")) ||
        (await checkPermission(userId, "finance", "delete"))
      );
    }
    return (
      (await checkPermission(userId, "finance.budget", roleKey)) ||
      (await checkPermission(userId, "finance", roleKey))
    );
  }

  export async function checkFinanceBudgetWrite(userId: number): Promise<boolean> {
    return checkFinanceBudgetAccess(userId, "write");
  }

  export async function checkFinanceBudgetDelete(userId: number): Promise<boolean> {
    return checkFinanceBudgetAccess(userId, "delete");
  }

  // ─── finance.analysis ─────────────────────────────────────
  export async function checkFinanceAnalysisAccess(
    userId: number,
    roleKey: "access" | "write" | "delete" | "admin" = "access",
  ): Promise<boolean> {
    if (await checkPermission(userId, "system", "admin")) return true;
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, "finance.analysis", "access")) ||
        (await checkPermission(userId, "finance.analysis", "write")) ||
        (await checkPermission(userId, "finance.analysis", "delete")) ||
        (await checkPermission(userId, "finance", "access")) ||
        (await checkPermission(userId, "finance", "write")) ||
        (await checkPermission(userId, "finance", "delete"))
      );
    }
    return (
      (await checkPermission(userId, "finance.analysis", roleKey)) ||
      (await checkPermission(userId, "finance", roleKey))
    );
  }

  export async function checkFinanceAnalysisWrite(userId: number): Promise<boolean> {
    return checkFinanceAnalysisAccess(userId, "write");
  }

  export async function checkFinanceAnalysisDelete(userId: number): Promise<boolean> {
    return checkFinanceAnalysisAccess(userId, "delete");
  }

  // ─── finance.import ───────────────────────────────────────
  export async function checkFinanceImportAccess(
    userId: number,
    roleKey: "access" | "write" | "delete" | "admin" = "access",
  ): Promise<boolean> {
    if (await checkPermission(userId, "system", "admin")) return true;
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, "finance.import", "access")) ||
        (await checkPermission(userId, "finance.import", "write")) ||
        (await checkPermission(userId, "finance.import", "delete")) ||
        (await checkPermission(userId, "finance", "access")) ||
        (await checkPermission(userId, "finance", "write")) ||
        (await checkPermission(userId, "finance", "delete"))
      );
    }
    return (
      (await checkPermission(userId, "finance.import", roleKey)) ||
      (await checkPermission(userId, "finance", roleKey))
    );
  }

  export async function checkFinanceImportWrite(userId: number): Promise<boolean> {
    return checkFinanceImportAccess(userId, "write");
  }

  export async function checkFinanceImportDelete(userId: number): Promise<boolean> {
    return checkFinanceImportAccess(userId, "delete");
  }
  ```

- [ ] **Step 3: 新增 with-auth wrappers**

  **File:** `lib/with-auth.ts`

  在 `withFinanceCostDelete` 之后新增 15 个 wrapper（5 个子资源 × 3 个动作）：

  ```typescript
  import {
    // ... existing imports ...
    checkFinanceLedgerAccess,
    checkFinanceLedgerWrite,
    checkFinanceLedgerDelete,
    checkFinanceReportAccess,
    checkFinanceReportWrite,
    checkFinanceReportDelete,
    checkFinanceBudgetAccess,
    checkFinanceBudgetWrite,
    checkFinanceBudgetDelete,
    checkFinanceAnalysisAccess,
    checkFinanceAnalysisWrite,
    checkFinanceAnalysisDelete,
    checkFinanceImportAccess,
    checkFinanceImportWrite,
    checkFinanceImportDelete,
  } from "@/lib/auth";

  // ... existing wrappers ...

  export function withFinanceLedgerAccess(handler: AuthHandler) {
    return withAuth(handler, checkFinanceLedgerAccess);
  }
  export function withFinanceLedgerWrite(handler: AuthHandler) {
    return withAuth(handler, checkFinanceLedgerWrite);
  }
  export function withFinanceLedgerDelete(handler: AuthHandler) {
    return withAuth(handler, checkFinanceLedgerDelete);
  }

  export function withFinanceReportAccess(handler: AuthHandler) {
    return withAuth(handler, checkFinanceReportAccess);
  }
  export function withFinanceReportWrite(handler: AuthHandler) {
    return withAuth(handler, checkFinanceReportWrite);
  }
  export function withFinanceReportDelete(handler: AuthHandler) {
    return withAuth(handler, checkFinanceReportDelete);
  }

  export function withFinanceBudgetAccess(handler: AuthHandler) {
    return withAuth(handler, checkFinanceBudgetAccess);
  }
  export function withFinanceBudgetWrite(handler: AuthHandler) {
    return withAuth(handler, checkFinanceBudgetWrite);
  }
  export function withFinanceBudgetDelete(handler: AuthHandler) {
    return withAuth(handler, checkFinanceBudgetDelete);
  }

  export function withFinanceAnalysisAccess(handler: AuthHandler) {
    return withAuth(handler, checkFinanceAnalysisAccess);
  }
  export function withFinanceAnalysisWrite(handler: AuthHandler) {
    return withAuth(handler, checkFinanceAnalysisWrite);
  }
  export function withFinanceAnalysisDelete(handler: AuthHandler) {
    return withAuth(handler, checkFinanceAnalysisDelete);
  }

  export function withFinanceImportAccess(handler: AuthHandler) {
    return withAuth(handler, checkFinanceImportAccess);
  }
  export function withFinanceImportWrite(handler: AuthHandler) {
    return withAuth(handler, checkFinanceImportWrite);
  }
  export function withFinanceImportDelete(handler: AuthHandler) {
    return withAuth(handler, checkFinanceImportDelete);
  }
  ```

- [ ] **Step 4: 更新 session 类型和鉴权字段**

  **File:** `lib/types.ts`

  在 `canAccessFinanceCost` 后新增：

  ```typescript
  canAccessFinanceLedger?: boolean;
  canAccessFinanceReport?: boolean;
  canAccessFinanceBudget?: boolean;
  canAccessFinanceAnalysis?: boolean;
  canAccessFinanceImport?: boolean;
  ```

  **File:** `server/auth/session.ts`

  1. 在 `hasFinanceCost` 后新增 5 个并行权限查询：

  ```typescript
  const [
    // ... existing parallel checks ...
    hasFinanceLedger,
    hasFinanceReport,
    hasFinanceBudget,
    hasFinanceAnalysis,
    hasFinanceImport,
  ] = await Promise.all([
    // ... existing checks ...
    checkPermissionWithContext(ctx, "finance.ledger", "access"),
    checkPermissionWithContext(ctx, "finance.report", "access"),
    checkPermissionWithContext(ctx, "finance.budget", "access"),
    checkPermissionWithContext(ctx, "finance.analysis", "access"),
    checkPermissionWithContext(ctx, "finance.import", "access"),
  ]);
  ```

  2. 在返回对象中新增 5 个字段（在 `canAccessFinanceCost` 之后）：

  ```typescript
  canAccessFinanceLedger: hasFinanceLedger,
  canAccessFinanceReport: hasFinanceReport,
  canAccessFinanceBudget: hasFinanceBudget,
  canAccessFinanceAnalysis: hasFinanceAnalysis,
  canAccessFinanceImport: hasFinanceImport,
  ```

  3. 在 `requireFinanceAccess` 之后新增 5 个 require 函数：

  ```typescript
  export async function requireFinanceLedgerAccess(): Promise<SessionUser> {
    const user = await requireCurrentUser();
    if (!user.canAccessFinanceLedger) throw new Error("FORBIDDEN");
    return user;
  }

  export async function requireFinanceReportAccess(): Promise<SessionUser> {
    const user = await requireCurrentUser();
    if (!user.canAccessFinanceReport) throw new Error("FORBIDDEN");
    return user;
  }

  export async function requireFinanceBudgetAccess(): Promise<SessionUser> {
    const user = await requireCurrentUser();
    if (!user.canAccessFinanceBudget) throw new Error("FORBIDDEN");
    return user;
  }

  export async function requireFinanceAnalysisAccess(): Promise<SessionUser> {
    const user = await requireCurrentUser();
    if (!user.canAccessFinanceAnalysis) throw new Error("FORBIDDEN");
    return user;
  }

  export async function requireFinanceImportAccess(): Promise<SessionUser> {
    const user = await requireCurrentUser();
    if (!user.canAccessFinanceImport) throw new Error("FORBIDDEN");
    return user;
  }
  ```

- [ ] **Step 5: 运行 CI 验证**

  Run: `npm run ci`
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat(finance): add ledger/report/budget/analysis/import permission resources"
  ```

---

### Batch 2: 页面 Guard 对齐

**范围:** 6 个 page.tsx 文件

- [ ] **Step 1: 更新 ledger 页面 guard**

  **File:** `app/finance/ledger/page.tsx`

  ```typescript
  if (!user.canAccessFinanceLedger) redirect("/portal");
  ```

- [ ] **Step 2: 更新 statements 页面 guard**

  **File:** `app/finance/statements/page.tsx`

  ```typescript
  if (!user.canAccessFinanceReport) redirect("/portal");
  ```

- [ ] **Step 3: 更新 budget 页面 guard**

  **File:** `app/finance/budget/page.tsx`

  ```typescript
  if (!user.canAccessFinanceBudget) redirect("/portal");
  ```

- [ ] **Step 4: 更新 analysis 页面 guard**

  **File:** `app/finance/analysis/page.tsx`

  ```typescript
  if (!user.canAccessFinanceAnalysis) redirect("/portal");
  ```

- [ ] **Step 5: 更新 import 页面 guard**

  **File:** `app/finance/import/page.tsx`

  ```typescript
  if (!user.canAccessFinanceImport) redirect("/portal");
  ```

- [ ] **Step 6: 运行 CI 验证**

  Run: `npm run ci`
  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add -A
  git commit -m "feat(finance): align page guards with sub-resource permissions"
  ```

---

### Batch 3: API Guard 对齐

**范围:** 13 个 API route 文件

- [ ] **Step 1: Ledger API routes**

  **Files:**
  - `app/api/finance/accounts/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`
  - `app/api/finance/accounts/[id]/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`, `withFinanceLedgerDelete`
  - `app/api/finance/vouchers/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`
  - `app/api/finance/vouchers/[id]/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`, `withFinanceLedgerDelete`
  - `app/api/finance/balances/route.ts` — import `withFinanceLedgerAccess`
  - `app/api/finance/balances/reconcile/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`
  - `app/api/finance/periods/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`
  - `app/api/finance/periods/[id]/route.ts` — import `withFinanceLedgerAccess`, `withFinanceLedgerWrite`, `withFinanceLedgerDelete`
  - `app/api/finance/init/route.ts` — import `withFinanceLedgerWrite`

  每个文件：替换 import 中的 wrapper 名称，并将 route handler 中的 `withFinanceAccess` → `withFinanceLedgerAccess`，`withFinanceWrite` → `withFinanceLedgerWrite`，`withFinanceDelete` → `withFinanceLedgerDelete`。

- [ ] **Step 2: Reports API route**

  **File:** `app/api/finance/reports/route.ts`

  替换为 `withFinanceReportAccess`。

- [ ] **Step 3: Budget API route**

  **File:** `app/api/finance/budget/route.ts`

  替换为 `withFinanceBudgetAccess` / `withFinanceBudgetWrite`。

- [ ] **Step 4: Import API routes**

  **Files:**
  - `app/api/finance/import/preview/route.ts` — `withFinanceImportAccess`
  - `app/api/finance/import/confirm/route.ts` — `withFinanceImportWrite`

- [ ] **Step 5: 运行 CI 验证**

  Run: `npm run ci`
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat(finance): align API guards with sub-resource permissions"
  ```

---

### Batch 4: Service 目录分层

**范围:** `server/services/finance/` 全部文件移动 + import 路径更新

**原则:**
- 使用 `git mv` 保留文件历史
- 跨子目录引用使用相对路径 `../` 或 `../../`
- 每个子目录内部使用 `./` 相对引用
- API route 中的 import 路径从 `server/services/finance/xxx` 更新为 `server/services/finance/ledger/xxx` 等

**文件映射:**

| 源文件 | 目标目录 |
|--------|----------|
| `balances.ts` | `ledger/` |
| `annual-balances.ts` | `ledger/` |
| `balance-helpers.ts` | `ledger/` |
| `balance-utils.ts` | `ledger/` |
| `balance-reconcile.ts` | `ledger/` |
| `voucher-service.ts` | `ledger/` |
| `report-generator.ts` | `statements/` |
| `report-helpers.ts` | `statements/` |
| `reports/*.ts` | `statements/reports/` |
| `budget-data.ts` | `budget/` |
| `import.ts` | `import/` |
| `import-confirm.ts` | `import/` |
| `parsers/*.ts` | `import/parsers/` |

**跨目录引用更新（关键路径）:**

- `ledger/annual-balances.ts`:
  - `from "./import"` → `from "../import/import"`
  - `from "./balance-utils"` → `from "./balance-utils"`

- `ledger/balance-reconcile.ts`:
  - `from "./import"` → `from "../import/import"`
  - `from "./balances"` → `from "./balances"`

- `ledger/balances.ts`:
  - `from "./balance-utils"` → `from "./balance-utils"`
  - `from "./annual-balances"` → `from "./annual-balances"`
  - `from "./balance-helpers"` → `from "./balance-helpers"`

- `import/import-confirm.ts`:
  - `from "./import"` → `from "./import"`
  - `from "./annual-balances"` → `from "../ledger/annual-balances"`

- `statements/report-generator.ts`:
  - `from "./report-helpers"` → `from "./report-helpers"`
  - `from "./reports/balance-sheet"` → `from "./reports/balance-sheet"`

- `statements/reports/*.ts`:
  - `from "../report-helpers"` → `from "../report-helpers"`

**API route import 更新:**

| API Route | 旧 import | 新 import |
|-----------|-----------|-----------|
| `api/finance/balances/route.ts` | `finance/balances` | `finance/ledger/balances` |
| `api/finance/vouchers/route.ts` | `finance/voucher-service` | `finance/ledger/voucher-service` |
| `api/finance/balances/reconcile/route.ts` | `finance/balance-reconcile` | `finance/ledger/balance-reconcile` |
| `api/finance/reports/route.ts` | `finance/report-generator` | `finance/statements/report-generator` |
| `api/finance/budget/route.ts` | `finance/budget-data` | `finance/budget/budget-data` |
| `api/finance/import/preview/route.ts` | `finance/import` | `finance/import/import` |
| `api/finance/import/confirm/route.ts` | `finance/import`, `finance/import-confirm` | `finance/import/import`, `finance/import/import-confirm` |

- [ ] **Step 1: 移动 ledger 相关文件**

  ```bash
  git mv server/services/finance/balances.ts server/services/finance/ledger/
  git mv server/services/finance/annual-balances.ts server/services/finance/ledger/
  git mv server/services/finance/balance-helpers.ts server/services/finance/ledger/
  git mv server/services/finance/balance-utils.ts server/services/finance/ledger/
  git mv server/services/finance/balance-reconcile.ts server/services/finance/ledger/
  git mv server/services/finance/voucher-service.ts server/services/finance/ledger/
  ```

- [ ] **Step 2: 移动 statements 相关文件**

  ```bash
  git mv server/services/finance/report-generator.ts server/services/finance/statements/
  git mv server/services/finance/report-helpers.ts server/services/finance/statements/
  mkdir -p server/services/finance/statements/reports
  git mv server/services/finance/reports/balance-sheet.ts server/services/finance/statements/reports/
  git mv server/services/finance/reports/income-statement.ts server/services/finance/statements/reports/
  git mv server/services/finance/reports/cash-flow.ts server/services/finance/statements/reports/
  rmdir server/services/finance/reports 2>/dev/null || true
  ```

- [ ] **Step 3: 移动 budget 和 import 相关文件**

  ```bash
  git mv server/services/finance/budget-data.ts server/services/finance/budget/
  git mv server/services/finance/import.ts server/services/finance/import/
  git mv server/services/finance/import-confirm.ts server/services/finance/import/
  mkdir -p server/services/finance/import/parsers
  git mv server/services/finance/parsers/account-parser.ts server/services/finance/import/parsers/
  git mv server/services/finance/parsers/balance-parser.ts server/services/finance/import/parsers/
  git mv server/services/finance/parsers/voucher-parser.ts server/services/finance/import/parsers/
  rmdir server/services/finance/parsers 2>/dev/null || true
  ```

- [ ] **Step 4: 更新 service 内部跨目录 import 路径（精确替换）**

  **File:** `server/services/finance/ledger/annual-balances.ts`

  ```typescript
  import type { PreviewResult } from "../import/import";
  ```

  **File:** `server/services/finance/ledger/balance-reconcile.ts`

  ```typescript
  import { parseBalanceSheet } from "../import/import";
  ```

  **File:** `server/services/finance/import/import-confirm.ts`

  ```typescript
  import { createSnapshotFromPreview } from "../ledger/annual-balances";
  ```

  其余文件（balances.ts、balance-helpers.ts、balance-utils.ts、voucher-service.ts、report-generator.ts、report-helpers.ts、statements/reports/*.ts、import.ts、budget-data.ts、parsers/*.ts）的所有内部 import 均为同目录引用，无需变更。

- [ ] **Step 5: 更新 API route import 路径（精确替换）**

  **File:** `app/api/finance/balances/route.ts`

  ```typescript
  import { computeBalancesForPeriod } from "@/server/services/finance/ledger/balances";
  ```

  **File:** `app/api/finance/vouchers/route.ts`

  ```typescript
  import { createVoucher } from "@/server/services/finance/ledger/voucher-service";
  ```

  **File:** `app/api/finance/balances/reconcile/route.ts`

  ```typescript
  import { reconcileBalanceSheet } from "@/server/services/finance/ledger/balance-reconcile";
  ```

  **File:** `app/api/finance/reports/route.ts`

  ```typescript
  import { generateReport } from "@/server/services/finance/statements/report-generator";
  ```

  **File:** `app/api/finance/budget/route.ts`

  ```typescript
  import { readDeptBudget, readRdBudget, loadDeptBudgetFromDb, loadRdBudgetFromDb, importDeptBudgetToDb, importRdBudgetToDb } from "@/server/services/finance/budget/budget-data";
  ```

  **File:** `app/api/finance/import/preview/route.ts`

  ```typescript
  import { parseBalanceSheet, parseJournal, parseAccountTable } from "@/server/services/finance/import/import";
  ```

  **File:** `app/api/finance/import/confirm/route.ts`

  ```typescript
  import type { PreviewResult } from "@/server/services/finance/import/import";
  import { confirmFinanceImport } from "@/server/services/finance/import/import-confirm";
  ```

- [ ] **Step 6: 更新 ARCHITECTURE.md 中 service 路径引用**

  **File:** `app/finance/ARCHITECTURE.md`

  在数据流和 API 规范章节中，如有引用 `server/services/finance/xxx` 的路径，更新为新的子目录路径。

- [ ] **Step 7: 运行 CI 验证**

  Run: `npm run ci`
  Expected: PASS

- [ ] **Step 8: Commit**

  ```bash
  git add -A
  git commit -m "refactor(finance): reorganize services into ledger/statements/budget/import directories"
  ```

---

## 自审检查表

1. **Spec coverage:**
   - [x] server/services/finance 分层 → Batch 4
   - [x] 权限资源补齐（ledger/report/budget/analysis/import）→ Batch 1
   - [x] 页面 guard 对齐 → Batch 2
   - [x] API guard 对齐 → Batch 3
   - [x] 不动 schema（Plan C 才动）→ 无 schema 变更
   - [x] 不删已有细粒度权限 → 成本子资源保留不动

2. **Placeholder scan:** 无 TBD/TODO/实现 later。

3. **类型一致性:**
   - RES.finance.ledger/report/budget/analysis/import 与 domain.ts 中的 checkPermission 调用一致
   - session.ts 中的 canAccessFinanceXxx 与 lib/types.ts 中的 SessionUser 字段一致
   - with-auth.ts 中的 wrapper 名称与 domain.ts 中的 checker 函数名一致
