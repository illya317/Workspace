# 财务模块重构 Plan A: 导航与页面重组

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/finance` 从"单页面 5 tab"升级为"财务模块入口 + 5 个一级业务区独立页面"，创建统一导航壳，按业务对象重组目录。

**Architecture:** 引入 `FinanceShell` 作为所有财务页面的共享布局壳（导航栏 + 背景色）。`/finance` 改为首页（入口卡片 + 状态概览）。原 tab 拆分到 `/finance/ledger`（总账基础）、`/finance/statements`（财务报表）、`/finance/budget`（预算管理）。现有 `/finance/analysis`、`/finance/cost`、`/finance/import` 接入统一壳。

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind CSS. 不改动 schema，不新增 API。

**执行规则：**
- 每个 commit 后运行 `npm run ci`
- 文件大小硬约束：组件 ≤ 220 行，API route ≤ 120 行
- 用 `git mv` 移动文件，保持 git history

---

## 文件结构变更总览

### 新建文件
| 文件 | 职责 |
|---|---|
| `app/finance/components/FinanceShell.tsx` | 共享布局壳：统一导航栏 + logo + 用户菜单 |
| `app/finance/FinanceHomeClient.tsx` | 财务首页：5 个入口卡片 + 状态概览 |
| `app/finance/ledger/page.tsx` | 总账基础页面（Server Component） |
| `app/finance/ledger/LedgerClient.tsx` | 总账基础客户端：科目/凭证/余额表 3 tab |
| `app/finance/statements/page.tsx` | 财务报表页面（Server Component） |
| `app/finance/statements/StatementsClient.tsx` | 财务报表客户端：资产负债表/利润表/现金流量表 |
| `app/finance/budget/page.tsx` | 预算管理页面（Server Component） |
| `app/finance/budget/BudgetClient.tsx` | 预算管理客户端：部门费用/研发费用预算 |

### 移动文件（git mv + 更新 import）
| 从 | 到 |
|---|---|
| `app/finance/AccountTab.tsx` | `app/finance/ledger/AccountTab.tsx` |
| `app/finance/VoucherTab.tsx` | `app/finance/ledger/VoucherTab.tsx` |
| `app/finance/LedgerTab.tsx` | `app/finance/ledger/LedgerTab.tsx` |
| `app/finance/ReportTab.tsx` | `app/finance/statements/ReportTab.tsx` |
| `app/finance/BudgetTab.tsx` | `app/finance/budget/BudgetTab.tsx` |
| `app/finance/components/DeptBudgetFilters.tsx` | `app/finance/budget/components/DeptBudgetFilters.tsx` |
| `app/finance/components/DeptBudgetTable.tsx` | `app/finance/budget/components/DeptBudgetTable.tsx` |
| `app/finance/components/RdBudgetFilters.tsx` | `app/finance/budget/components/RdBudgetFilters.tsx` |
| `app/finance/components/RdBudgetTable.tsx` | `app/finance/budget/components/RdBudgetTable.tsx` |

### 修改文件
| 文件 | 修改内容 |
|---|---|
| `app/finance/page.tsx` | 改为首页，用 FinanceShell 包裹 FinanceHomeClient |
| `app/finance/analysis/page.tsx` | 接入 FinanceShell |
| `app/finance/analysis/FinanceAnalysisClient.tsx` | 移除旧导航，只保留内容区 |
| `app/finance/cost/page.tsx` | 接入 FinanceShell |
| `app/finance/cost/FinanceCostClient.tsx` | 移除旧导航，只保留内容区 |
| `app/finance/import/page.tsx` | 接入 FinanceShell |
| `app/finance/import/ImportClient.tsx` | 移除旧导航，只保留内容区 |

### 删除文件
| 文件 | 原因 |
|---|---|
| `app/finance/FinanceClient.tsx` | tab 逻辑已拆分到 LedgerClient |

---

## Task 1: 创建共享壳 FinanceShell.tsx

**Files:**
- Create: `app/finance/components/FinanceShell.tsx`

- [ ] **Step 1: 写入 FinanceShell.tsx**

```tsx
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

interface Props {
  activeNav: string;
  children: React.ReactNode;
  user: SessionUser;
}

const navItems = [
  { key: "ledger", label: "总账基础", href: "/finance/ledger" },
  { key: "statements", label: "财务报表", href: "/finance/statements" },
  { key: "budget", label: "预算管理", href: "/finance/budget" },
  { key: "analysis", label: "财务分析", href: "/finance/analysis" },
  { key: "cost", label: "成本管理", href: "/finance/cost" },
  { key: "import", label: "数据导入", href: "/finance/import" },
];

export default function FinanceShell({ activeNav, children, user }: Props) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <button
              onClick={() => router.push("/finance")}
              className="text-sm font-medium text-gray-700 hover:text-emerald-600"
            >
              财务管理
            </button>
          </div>
          <div className="flex items-center gap-4">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                className={`text-sm ${
                  activeNav === item.key
                    ? "font-medium text-emerald-600"
                    : "text-gray-500 hover:text-emerald-600"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 验证文件大小**

Run: `wc -l app/finance/components/FinanceShell.tsx`
Expected: ≤ 75 行

- [ ] **Step 3: Commit**

```bash
git add app/finance/components/FinanceShell.tsx
git commit -m "feat(finance): add shared FinanceShell navigation layout"
```

---

## Task 2: 创建财务首页 /finance

**Files:**
- Create: `app/finance/FinanceHomeClient.tsx`
- Modify: `app/finance/page.tsx`

- [ ] **Step 1: 写入 FinanceHomeClient.tsx**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";

const modules = [
  { key: "ledger", title: "总账基础", desc: "科目设置、凭证明细、余额表、期间管理", href: "/finance/ledger" },
  { key: "statements", title: "财务报表", desc: "资产负债表、利润表、现金流量表", href: "/finance/statements" },
  { key: "budget", title: "预算管理", desc: "部门费用预算、研发费用预算", href: "/finance/budget" },
  { key: "analysis", title: "财务分析", desc: "预算执行分析、差异分析、趋势看板", href: "/finance/analysis" },
  { key: "cost", title: "成本管理", desc: "生产成本、发货、成本构成、车间工分", href: "/finance/cost" },
];

interface Props {
  user: SessionUser;
}

export default function FinanceHomeClient({ user }: Props) {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">财务管理</h1>
      <p className="mb-6 text-sm text-gray-500">总账 · 报表 · 预算 · 分析 · 成本</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div
            key={m.key}
            onClick={() => router.push(m.href)}
            className="cursor-pointer rounded-lg bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-gray-800">{m.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{m.desc}</p>
            <span className="mt-3 inline-block text-sm text-emerald-600">进入 →</span>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-700">状态概览</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "最近导入批次", status: "待接入" },
            { label: "当前期间状态", status: "待接入" },
            { label: "年度余额基准", status: "待接入" },
            { label: "预算导入状态", status: "待接入" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="mt-1 text-sm text-gray-400">{s.status}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 修改 page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "./components/FinanceShell";
import FinanceHomeClient from "./FinanceHomeClient";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="" user={user}>
      <FinanceHomeClient user={user} />
    </FinanceShell>
  );
}
```

- [ ] **Step 3: 运行 size check**

Run: `npm run size:check`
Expected: `app/finance/FinanceHomeClient.tsx` ≤ 75 行, `app/finance/page.tsx` ≤ 120 行

- [ ] **Step 4: Commit**

```bash
git add app/finance/FinanceHomeClient.tsx app/finance/page.tsx
git commit -m "feat(finance): add finance home page with module cards and status overview"
```

---

## Task 3: 创建总账基础页面 /finance/ledger

**Files:**
- Create: `app/finance/ledger/page.tsx`
- Create: `app/finance/ledger/LedgerClient.tsx`
- Move: `app/finance/AccountTab.tsx` → `app/finance/ledger/AccountTab.tsx`
- Move: `app/finance/VoucherTab.tsx` → `app/finance/ledger/VoucherTab.tsx`
- Move: `app/finance/LedgerTab.tsx` → `app/finance/ledger/LedgerTab.tsx`

- [ ] **Step 1: 创建 ledger 目录并移动文件**

```bash
mkdir -p app/finance/ledger
git mv app/finance/AccountTab.tsx app/finance/ledger/AccountTab.tsx
git mv app/finance/VoucherTab.tsx app/finance/ledger/VoucherTab.tsx
git mv app/finance/LedgerTab.tsx app/finance/ledger/LedgerTab.tsx
```

- [ ] **Step 2: 更新移动后文件的 import 路径**

在 `app/finance/ledger/AccountTab.tsx` 中，将所有 `./components/` 改为 `../components/`：

```tsx
import AccountCreateModal from "../components/AccountCreateModal";
import AccountTable from "../components/AccountTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
```

在 `app/finance/ledger/VoucherTab.tsx` 中：

```tsx
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
```

在 `app/finance/ledger/LedgerTab.tsx` 中：

```tsx
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import FinanceBalanceReconcile from "../components/FinanceBalanceReconcile";
```

- [ ] **Step 3: 写入 LedgerClient.tsx**

从原 `FinanceClient.tsx` 改造，只保留 accounts/vouchers/ledger tabs，移除 reports/budget 和顶部导航：

```tsx
"use client";

import { useState } from "react";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";

type LedgerTabKey = "accounts" | "vouchers" | "ledger";

const tabs: { key: LedgerTabKey; label: string }[] = [
  { key: "accounts", label: "科目设置" },
  { key: "vouchers", label: "凭证明细" },
  { key: "ledger", label: "余额表" },
];

export default function LedgerClient() {
  const [activeTab, setActiveTab] = useState<LedgerTabKey>("accounts");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-emerald-500 text-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" && <AccountTab />}
      {activeTab === "vouchers" && <VoucherTab />}
      {activeTab === "ledger" && <LedgerTab />}
    </main>
  );
}
```

- [ ] **Step 4: 写入 ledger/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import LedgerClient from "./LedgerClient";

export default async function LedgerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="ledger" user={user}>
      <LedgerClient />
    </FinanceShell>
  );
}
```

- [ ] **Step 5: 运行 size check**

Run: `npm run size:check`
Expected: `app/finance/ledger/LedgerClient.tsx` ≤ 55 行

- [ ] **Step 6: Commit**

```bash
git add app/finance/ledger/
git commit -m "feat(finance): split ledger tabs into /finance/ledger page"
```

---

## Task 4: 创建财务报表页面 /finance/statements

**Files:**
- Create: `app/finance/statements/page.tsx`
- Create: `app/finance/statements/StatementsClient.tsx`
- Move: `app/finance/ReportTab.tsx` → `app/finance/statements/ReportTab.tsx`

- [ ] **Step 1: 创建 statements 目录并移动文件**

```bash
mkdir -p app/finance/statements
git mv app/finance/ReportTab.tsx app/finance/statements/ReportTab.tsx
```

- [ ] **Step 2: 更新 ReportTab.tsx 的 import 路径**

在 `app/finance/statements/ReportTab.tsx` 中：

```tsx
import FinanceFilters from "../components/FinanceFilters";
```

- [ ] **Step 3: 写入 StatementsClient.tsx**

StatementsClient 就是 ReportTab 的别名（因为 ReportTab 本身不依赖外层 FinanceClient）：

```tsx
"use client";

import ReportTab from "./ReportTab";

export default function StatementsClient() {
  return <ReportTab />;
}
```

> 注：如果 ReportTab 未来需要按报表类型做更复杂的切换，可以在这里扩展。当前阶段保持最小改动。

- [ ] **Step 4: 写入 statements/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import StatementsClient from "./StatementsClient";

export default async function StatementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="statements" user={user}>
      <StatementsClient />
    </FinanceShell>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/finance/statements/
git commit -m "feat(finance): move reports to /finance/statements page"
```

---

## Task 5: 创建预算管理页面 /finance/budget

**Files:**
- Create: `app/finance/budget/page.tsx`
- Create: `app/finance/budget/BudgetClient.tsx`
- Create: `app/finance/budget/components/` 目录
- Move: `app/finance/BudgetTab.tsx` → `app/finance/budget/BudgetTab.tsx`
- Move: `app/finance/components/DeptBudgetFilters.tsx` → `app/finance/budget/components/DeptBudgetFilters.tsx`
- Move: `app/finance/components/DeptBudgetTable.tsx` → `app/finance/budget/components/DeptBudgetTable.tsx`
- Move: `app/finance/components/RdBudgetFilters.tsx` → `app/finance/budget/components/RdBudgetFilters.tsx`
- Move: `app/finance/components/RdBudgetTable.tsx` → `app/finance/budget/components/RdBudgetTable.tsx`

- [ ] **Step 1: 创建 budget 目录并移动文件**

```bash
mkdir -p app/finance/budget/components
git mv app/finance/BudgetTab.tsx app/finance/budget/BudgetTab.tsx
git mv app/finance/components/DeptBudgetFilters.tsx app/finance/budget/components/DeptBudgetFilters.tsx
git mv app/finance/components/DeptBudgetTable.tsx app/finance/budget/components/DeptBudgetTable.tsx
git mv app/finance/components/RdBudgetFilters.tsx app/finance/budget/components/RdBudgetFilters.tsx
git mv app/finance/components/RdBudgetTable.tsx app/finance/budget/components/RdBudgetTable.tsx
```

> 注：预算组件的 import 路径不需要变，因为 `./components/` 仍然相对 `app/finance/budget/BudgetTab.tsx` 正确。

- [ ] **Step 2: 写入 BudgetClient.tsx**

```tsx
"use client";

import BudgetTab from "./BudgetTab";

export default function BudgetClient() {
  return <BudgetTab />;
}
```

- [ ] **Step 3: 写入 budget/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import BudgetClient from "./BudgetClient";

export default async function BudgetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="budget" user={user}>
      <BudgetClient />
    </FinanceShell>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/finance/budget/
git commit -m "feat(finance): move budget to /finance/budget page"
```

---

## Task 6: 改造分析/成本/导入页面，接入 FinanceShell

**Files:**
- Modify: `app/finance/analysis/page.tsx`
- Modify: `app/finance/analysis/FinanceAnalysisClient.tsx`
- Modify: `app/finance/cost/page.tsx`
- Modify: `app/finance/cost/FinanceCostClient.tsx`
- Modify: `app/finance/import/page.tsx`
- Modify: `app/finance/import/ImportClient.tsx`

- [ ] **Step 1: 修改 analysis/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceAnalysisClient from "./FinanceAnalysisClient";

export default async function FinanceAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="analysis" user={user}>
      <FinanceAnalysisClient user={user} />
    </FinanceShell>
  );
}
```

- [ ] **Step 2: 修改 FinanceAnalysisClient.tsx，移除旧导航**

原文件有独立的 nav 和 `min-h-screen bg-gray-50` 外层 div。改造为只保留 `main` 内容：

```tsx
"use client";

import { SessionUser } from "@/lib/types";

interface Props {
  user: SessionUser;
}

export default function FinanceAnalysisClient({ user }: Props) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">财务分析</h1>
      <p className="mb-6 text-sm text-gray-500">财务数据分析与指标看板</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">营业收入</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">毛利率</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">净利率</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-400">财务分析看板开发中</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 修改 cost/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import FinanceCostClient from "./FinanceCostClient";

export default async function FinanceCostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="cost" user={user}>
      <FinanceCostClient user={user} />
    </FinanceShell>
  );
}
```

- [ ] **Step 4: 修改 FinanceCostClient.tsx，移除旧导航**

原文件包含独立的 nav 和 `min-h-screen bg-gray-50` 外层 div。改造为只保留 `main` 内容。具体做法是：删除外层的 `<div className="min-h-screen bg-gray-50">` 和 `<nav>...</nav>`，只保留 `<main>...</main>` 及其内部内容。

- [ ] **Step 5: 修改 import/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import FinanceShell from "@/app/finance/components/FinanceShell";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return (
    <FinanceShell activeNav="import" user={user}>
      <ImportClient user={user} />
    </FinanceShell>
  );
}
```

- [ ] **Step 6: 修改 ImportClient.tsx，移除旧导航**

原文件包含独立的 nav 和 `min-h-screen bg-gray-50` 外层 div。改造为只保留 `main` 内容。

- [ ] **Step 7: 运行 size check**

Run: `npm run size:check`
Expected: 所有文件 ≤ 220 行

- [ ] **Step 8: Commit**

```bash
git add app/finance/analysis/ app/finance/cost/ app/finance/import/
git commit -m "feat(finance): unify analysis/cost/import under FinanceShell navigation"
```

---

## Task 7: 删除旧 FinanceClient.tsx

**Files:**
- Delete: `app/finance/FinanceClient.tsx`

- [ ] **Step 1: 确认 FinanceClient.tsx 不再被任何文件 import**

Run: `grep -r "FinanceClient" app/ --include="*.tsx" --include="*.ts"`
Expected: 只有 `app/finance/FinanceClient.tsx` 自身匹配

- [ ] **Step 2: 删除文件**

```bash
git rm app/finance/FinanceClient.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(finance): remove obsolete FinanceClient.tsx after tab split"
```

---

## Task 8: 全量验证

- [ ] **Step 1: 运行完整 pre-commit 检查**

```bash
npm run ci
```

Expected: env/arch/db/schema/size/lint/tsc/build 全部通过

- [ ] **Step 2: 验证路由可访问**

本地启动后验证以下路由都能正常加载：
- `/finance` — 首页，显示 5 个入口卡片
- `/finance/ledger` — 总账基础，显示科目/凭证/余额表 tab
- `/finance/statements` — 财务报表，显示报表选择器
- `/finance/budget` — 预算管理，显示部门/研发预算
- `/finance/analysis` — 财务分析，显示 3 个指标卡片
- `/finance/cost` — 成本管理，正常显示
- `/finance/import` — 数据导入，正常显示

- [ ] **Step 3: 确认 git status 干净**

```bash
git status
```

Expected: nothing to commit, working tree clean

---

## Spec Coverage Checklist

| 用户要求 | 对应 Task | 状态 |
|---|---|---|
| 共享壳 FinanceShell | Task 1 | ✅ |
| `/finance` 改首页（入口卡片 + 状态） | Task 2 | ✅ |
| `/finance/ledger` 包含科目/凭证/余额表 | Task 3 | ✅ |
| `/finance/statements` 包含报表 | Task 4 | ✅ |
| `/finance/budget` 包含预算 | Task 5 | ✅ |
| analysis/cost/import 接入统一壳 | Task 6 | ✅ |
| 删除旧 FinanceClient | Task 7 | ✅ |
| 不动 schema / 不动 API | — | ✅ |
| 首页状态先放"待接入" | Task 2 | ✅ |

## Placeholder Scan

- 无 "TBD/TODO/implement later"
- 无 "Add appropriate error handling" 等模糊描述
- 所有 import 路径已精确标注
- 所有代码块包含完整可运行的代码
