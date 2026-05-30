# Plan C: 预算模型升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为预算管理引入版本化模型 `FinanceBudgetVersion`，支持 draft/active/archived 状态，让预算导入从"直接覆盖"升级为"版本化留痕"。

**Architecture:** 新增 `FinanceBudgetVersion` 作为预算元数据头表；`FinanceBudgetDept` / `FinanceBudgetRd` 增加 `versionId` 外键，从属于版本。查询默认取 active version，导入默认创建 draft version，激活时自动归档同组旧版本。预算模型从 `finance-cost.prisma` 独立到 `finance-budget.prisma`。

**Tech Stack:** Next.js 16, Prisma, SQLite, TypeScript

---

## 关键设计决策（计划修正记录）

| # | 修正点 | 处理方案 |
|---|---|---|
| 1 | 预算模型不应塞进 finance-cost.prisma | 新建 `prisma/models/finance-budget.prisma`，迁移 FinanceBudgetDept/FinanceBudgetRd，更新 schema-governance.md |
| 2 | 不能直接给已有表加非空 versionId | 两阶段迁移：先 nullable → 创建版本 → 回填 → 校验无 null → 再改 required |
| 3 | "同一年同公司只有一个 active"仅靠 service 逻辑 | migration SQL 中手动添加 SQLite partial unique index |
| 4 | BudgetTab 209 行，加版本选择器必超 220 红线 | C3 必须先拆 `useBudgetData` / `useBudgetFilters` hooks，BudgetTab 只负责组合 |
| 5 | withAuth wrapper 不自动透传 params | `[id]/activate` route 从 `request.url.split("/").pop()` 取 id，不解构 params |
| 6 | Excel fallback 太激进 | 仅当"没有任何 active version"时 fallback；有 versionId 参数或 active version 为空时，返回空数据 |

---

## 文件结构

### Schema 变更
- `prisma/models/finance-budget.prisma` — **新建**，包含 FinanceBudgetVersion + FinanceBudgetDept + FinanceBudgetRd
- `prisma/models/finance-cost.prisma` — **删除** FinanceBudgetDept / FinanceBudgetRd
- `prisma/schema.prisma` — 新加 `finance-budget.prisma` 的 include
- `docs/schema-governance.md` — 加入 finance-budget 领域行
- `app/finance/ARCHITECTURE.md` — 更新预算管理章节

### 数据迁移
- `prisma/migrations/2026xxxx_add_budget_version_v1/migration.sql` — nullable versionId + 版本表创建 + 数据回填 + partial unique index
- `prisma/migrations/2026xxxx_make_version_required/migration.sql` — versionId 改为 required

### Service 适配
- `server/services/finance/budget/budget-version.ts` — **新建**，版本管理 CRUD
- `server/services/finance/budget/budget-data.ts` — 按 versionId 查询/导入，不再 deleteMany 按 year

### API 适配
- `app/api/finance/budget/route.ts` — GET 支持 `?versionId=`，POST 创建 draft version 后导入
- `app/api/finance/budget/versions/route.ts` — **新建**，版本列表/创建
- `app/api/finance/budget/versions/[id]/activate/route.ts` — **新建**，激活指定版本（注意 wrapper 写法）

### 前端适配
- `app/finance/budget/hooks/useBudgetData.ts` — **新建**，数据加载 + 版本状态
- `app/finance/budget/hooks/useBudgetFilters.ts` — **新建**，筛选逻辑 + 统计计算
- `app/finance/budget/BudgetTab.tsx` — **精简至 120 行内**，组合 hooks 和 UI
- `app/finance/budget/components/BudgetVersionSelector.tsx` — **新建**，版本下拉 + 状态标签

### 分析对接（C4）
- `server/services/finance/analysis/budget-analysis.ts` — **新建**，加载 active version 预算数据
- `app/finance/analysis/FinanceAnalysisClient.tsx` — 展示当前 active version 信息和预算概览

---

## C1: Schema + Migration

**范围:** `prisma/models/`, migration SQL, schema governance 文档

- [ ] **Step 1: 新建 finance-budget.prisma（versionId 先 nullable）**

  **File:** `prisma/models/finance-budget.prisma`

  ```prisma
  /// 预算版本头表。每年可存在多个版本（draft/active/archived），同 (year, companyCode) 下只有一个 active。
  model FinanceBudgetVersion {
    id          Int      @id @default(autoincrement())
    year        Int
    companyCode String?
    name        String   /// 版本名称，如 "2026年初预算"、"2026年调整V1"
    status      String   /// draft | active | archived
    type        String   /// dept | rd | all，表示本版本包含的预算类型
    sourceFile  String?
    createdBy   Int?     /// userId
    createdAt   DateTime @default(now())
    updatedAt   DateTime @default(now()) @updatedAt

    deptBudgets FinanceBudgetDept[]
    rdBudgets   FinanceBudgetRd[]

    @@index([year, companyCode])
    @@index([status])
  }

  /// 部门费用预算。每年导入一次，按部门+科目存储12个月预算金额，accountId 关联到 FinanceAccount 建立真 FK。从属于某个 FinanceBudgetVersion。
  model FinanceBudgetDept {
    id            Int                  @id @default(autoincrement())
    versionId     Int?
    version       FinanceBudgetVersion? @relation(fields: [versionId], references: [id])
    year          Int
    companyCode   String?
    dept          String
    accountName   String
    expenseType   String
    accountId     Int?
    account       FinanceAccount?      @relation(fields: [accountId], references: [id])
    total         Float                @default(0)
    month1        Float                @default(0)
    month2        Float                @default(0)
    month3        Float                @default(0)
    month4        Float                @default(0)
    month5        Float                @default(0)
    month6        Float                @default(0)
    month7        Float                @default(0)
    month8        Float                @default(0)
    month9        Float                @default(0)
    month10       Float                @default(0)
    month11       Float                @default(0)
    month12       Float                @default(0)
    sourceFile    String?
    importedAt    DateTime             @default(now())
    createdAt     DateTime             @default(now())
    updatedAt     DateTime             @default(now()) @updatedAt

    @@unique([versionId, dept, accountName])
    @@index([year, companyCode])
    @@index([accountId])
    @@index([versionId])
  }

  /// 研发费用预算。每年导入一次，按项目+科目存储12个月预算金额，accountId 关联到 FinanceAccount 建立真 FK。从属于某个 FinanceBudgetVersion。
  model FinanceBudgetRd {
    id          Int                  @id @default(autoincrement())
    versionId   Int?
    version     FinanceBudgetVersion? @relation(fields: [versionId], references: [id])
    year        Int
    companyCode String?
    project     String
    category    String
    accountId   Int?
    account     FinanceAccount?      @relation(fields: [accountId], references: [id])
    total       Float                @default(0)
    month1      Float                @default(0)
    month2      Float                @default(0)
    month3      Float                @default(0)
    month4      Float                @default(0)
    month5      Float                @default(0)
    month6      Float                @default(0)
    month7      Float                @default(0)
    month8      Float                @default(0)
    month9      Float                @default(0)
    month10     Float                @default(0)
    month11     Float                @default(0)
    month12     Float                @default(0)
    sourceFile  String?
    importedAt  DateTime             @default(now())
    createdAt   DateTime             @default(now())
    updatedAt   DateTime             @default(now()) @updatedAt

    @@unique([versionId, project, category])
    @@index([year, companyCode])
    @@index([accountId])
    @@index([versionId])
  }
  ```

- [ ] **Step 2: 从 finance-cost.prisma 删除预算模型**

  **File:** `prisma/models/finance-cost.prisma`

  删除 `FinanceBudgetDept` 和 `FinanceBudgetRd` 两个 model（约第 157-220 行）。

- [ ] **Step 3: 更新 schema.prisma 的 include**

  **File:** `prisma/schema.prisma`

  在 models include 列表中加入 `finance-budget.prisma`。

- [ ] **Step 4: 更新 schema-governance.md**

  **File:** `docs/schema-governance.md`

  在"当前领域划分"表格中插入一行：

  | `finance-budget.prisma` | 预算管理 | FinanceBudgetVersion, FinanceBudgetDept, FinanceBudgetRd |

- [ ] **Step 5: 生成第一次 migration（nullable versionId）**

  Run:
  ```bash
  npx prisma migrate dev --name add_budget_version_v1
  ```

  这会生成 SQL migration，包含：
  - 创建 `FinanceBudgetVersion` 表
  - 给 `FinanceBudgetDept` / `FinanceBudgetRd` 添加 nullable `versionId` 列
  - 添加外键约束

- [ ] **Step 6: 在生成的 migration.sql 末尾追加数据回填 + partial unique index**

  在 `prisma/migrations/2026xxxx_add_budget_version_v1/migration.sql` 末尾追加：

  ```sql
  -- 为现有预算数据创建默认 active version（从 Dept 数据）
  INSERT INTO "FinanceBudgetVersion" ("year", "companyCode", "name", "status", "type", "sourceFile", "createdAt", "updatedAt")
  SELECT DISTINCT "year", "companyCode", '初始版本', 'active', 'all', "sourceFile", datetime('now'), datetime('now')
  FROM "FinanceBudgetDept";

  -- 更新 FinanceBudgetDept 的 versionId
  UPDATE "FinanceBudgetDept"
  SET "versionId" = (
    SELECT v.id FROM "FinanceBudgetVersion" v
    WHERE v.year = "FinanceBudgetDept".year
      AND (v."companyCode" = "FinanceBudgetDept"."companyCode" OR (v."companyCode" IS NULL AND "FinanceBudgetDept"."companyCode" IS NULL))
      AND v.status = 'active'
    LIMIT 1
  );

  -- 为 Rd 独有的 (year, companyCode) 组合创建版本
  INSERT INTO "FinanceBudgetVersion" ("year", "companyCode", "name", "status", "type", "sourceFile", "createdAt", "updatedAt")
  SELECT DISTINCT "year", "companyCode", '初始版本', 'active', 'all', "sourceFile", datetime('now'), datetime('now')
  FROM "FinanceBudgetRd"
  WHERE "year" || '-' || COALESCE("companyCode", '_NULL_') NOT IN (
    SELECT "year" || '-' || COALESCE("companyCode", '_NULL_') FROM "FinanceBudgetVersion"
  );

  -- 更新 FinanceBudgetRd 的 versionId
  UPDATE "FinanceBudgetRd"
  SET "versionId" = (
    SELECT v.id FROM "FinanceBudgetVersion" v
    WHERE v.year = "FinanceBudgetRd".year
      AND (v."companyCode" = "FinanceBudgetRd"."companyCode" OR (v."companyCode" IS NULL AND "FinanceBudgetRd"."companyCode" IS NULL))
      AND v.status = 'active'
    LIMIT 1
  );

  -- 同 (year, companyCode) 下只有一个 active 版本的约束
  CREATE UNIQUE INDEX idx_active_budget_version ON "FinanceBudgetVersion"("year", COALESCE("companyCode", '')) WHERE "status" = 'active';
  ```

- [ ] **Step 7: 运行第一次 migration**

  ```bash
  npx prisma migrate deploy
  ```

- [ ] **Step 8: 校验无 null versionId**

  ```bash
  npx prisma db execute --stdin <<EOF
  SELECT COUNT(*) as null_count FROM "FinanceBudgetDept" WHERE "versionId" IS NULL;
  SELECT COUNT(*) as null_count FROM "FinanceBudgetRd" WHERE "versionId" IS NULL;
  EOF
  ```

  预期输出：`null_count = 0`。如果不是 0，说明回填逻辑有 bug，修复后再继续。

- [ ] **Step 9: 修改 schema 为 required**

  **File:** `prisma/models/finance-budget.prisma`

  修改两处：
  1. `versionId     Int?` → `versionId     Int`
  2. `version       FinanceBudgetVersion?` → `version       FinanceBudgetVersion`

  对 FinanceBudgetRd 同样修改。

- [ ] **Step 10: 生成第二次 migration（make versionId required）**

  ```bash
  npx prisma migrate dev --name make_version_required
  ```

  Prisma 会为 SQLite 生成表重建脚本（创建新表 → 复制数据 → 删除旧表 → 重命名）。

- [ ] **Step 11: 运行第二次 migration**

  ```bash
  npx prisma migrate deploy
  ```

- [ ] **Step 12: 重新生成 Prisma Client**

  ```bash
  npx prisma generate
  ```

- [ ] **Step 13: 运行验证**

  ```bash
  npm run schema:check
  npm run db:validate
  npx tsc --noEmit
  ```

- [ ] **Step 14: Commit**

  ```bash
  git add -A
  git commit -m "feat(schema): add FinanceBudgetVersion, migrate budget models to finance-budget.prisma"
  ```

---

## C2: Service + API

**范围:** `server/services/finance/budget/`, `app/api/finance/budget/`

- [ ] **Step 1: 创建 budget-version.ts**

  **File:** `server/services/finance/budget/budget-version.ts`

  ```typescript
  import { prisma } from "@/lib/prisma";

  export type BudgetVersionStatus = "draft" | "active" | "archived";

  export interface CreateVersionInput {
    year: number;
    companyCode?: string;
    name: string;
    type: "dept" | "rd" | "all";
    sourceFile?: string;
    createdBy?: number;
  }

  export async function createBudgetVersion(input: CreateVersionInput) {
    return prisma.financeBudgetVersion.create({
      data: {
        year: input.year,
        companyCode: input.companyCode ?? null,
        name: input.name,
        status: "draft",
        type: input.type,
        sourceFile: input.sourceFile ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  export async function listBudgetVersions(year: number, companyCode?: string) {
    return prisma.financeBudgetVersion.findMany({
      where: { year, companyCode: companyCode ?? null },
      orderBy: { createdAt: "desc" },
    });
  }

  export async function getActiveVersion(year: number, companyCode?: string) {
    return prisma.financeBudgetVersion.findFirst({
      where: { year, companyCode: companyCode ?? null, status: "active" },
    });
  }

  export async function getBudgetVersion(versionId: number) {
    return prisma.financeBudgetVersion.findUnique({
      where: { id: versionId },
    });
  }

  export async function activateBudgetVersion(versionId: number) {
    const version = await prisma.financeBudgetVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new Error("版本不存在");
    if (version.status === "active") return version;

    // 同 (year, companyCode) 下其他 active 版本归档
    await prisma.financeBudgetVersion.updateMany({
      where: {
        year: version.year,
        companyCode: version.companyCode,
        status: "active",
        id: { not: versionId },
      },
      data: { status: "archived" },
    });

    // 激活当前版本
    return prisma.financeBudgetVersion.update({
      where: { id: versionId },
      data: { status: "active" },
    });
  }

  export async function archiveBudgetVersion(versionId: number) {
    return prisma.financeBudgetVersion.update({
      where: { id: versionId },
      data: { status: "archived" },
    });
  }

  export async function deleteBudgetVersion(versionId: number) {
    // 先删除关联的预算明细（Prisma 没有级联配置时需手动）
    await prisma.financeBudgetDept.deleteMany({ where: { versionId } });
    await prisma.financeBudgetRd.deleteMany({ where: { versionId } });
    return prisma.financeBudgetVersion.delete({ where: { id: versionId } });
  }
  ```

- [ ] **Step 2: 修改 budget-data.ts 支持 versionId**

  **File:** `server/services/finance/budget/budget-data.ts`

  修改 `importDeptBudgetToDb` 和 `importRdBudgetToDb`，增加 `versionId` 参数，移除 `deleteMany`：

  ```typescript
  export async function importDeptBudgetToDb(
    year: number,
    companyCode: string | undefined,
    versionId: number,
  ) {
    const raw = readDeptBudget();
    const accountMap = await resolveAccountIds(raw.map((i) => i.account));

    const data = raw.map((item) => ({
      versionId,
      year,
      companyCode: companyCode ?? null,
      dept: item.dept,
      accountName: item.account,
      expenseType: item.expenseType,
      accountId: accountMap.get(item.account) ?? null,
      total: item.total,
      month1: item.months[0] ?? 0,
      month2: item.months[1] ?? 0,
      month3: item.months[2] ?? 0,
      month4: item.months[3] ?? 0,
      month5: item.months[4] ?? 0,
      month6: item.months[5] ?? 0,
      month7: item.months[6] ?? 0,
      month8: item.months[7] ?? 0,
      month9: item.months[8] ?? 0,
      month10: item.months[9] ?? 0,
      month11: item.months[10] ?? 0,
      month12: item.months[11] ?? 0,
      sourceFile: "部门费用预算数据.xlsx",
    }));

    await prisma.financeBudgetDept.createMany({ data });
    return data.length;
  }
  ```

  同理修改 `importRdBudgetToDb`（增加 `versionId` 参数，移除 `deleteMany`）。

  修改 `loadDeptBudgetFromDb` 和 `loadRdBudgetFromDb`，参数从 `(year, companyCode)` 改为 `(versionId: number)`：

  ```typescript
  export async function loadDeptBudgetFromDb(versionId: number) {
    const rows = await prisma.financeBudgetDept.findMany({
      where: { versionId },
      include: { account: { select: { id: true, code: true, isActive: true } } },
    });
    return rows.map((r) => ({
      dept: r.dept,
      account: r.accountName,
      total: r.total,
      months: [r.month1, r.month2, r.month3, r.month4, r.month5, r.month6, r.month7, r.month8, r.month9, r.month10, r.month11, r.month12],
      expenseType: r.expenseType,
      accountId: r.account?.id ?? null,
      accountCode: r.account?.code ?? null,
      accountActive: r.account?.isActive ?? null,
    }));
  }
  ```

  同理修改 `loadRdBudgetFromDb`。

- [ ] **Step 3: 修改 budget route（谨慎 fallback）**

  **File:** `app/api/finance/budget/route.ts`

  ```typescript
  import { NextResponse } from "next/server";
  import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
  import {
    readDeptBudget,
    readRdBudget,
    loadDeptBudgetFromDb,
    loadRdBudgetFromDb,
    importDeptBudgetToDb,
    importRdBudgetToDb,
  } from "@/server/services/finance/budget/budget-data";
  import {
    createBudgetVersion,
    getActiveVersion,
    getBudgetVersion,
  } from "@/server/services/finance/budget/budget-version";

  export const GET = withFinanceBudgetAccess(async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2026");
    const companyCode = searchParams.get("companyCode") || undefined;
    const versionIdParam = searchParams.get("versionId");

    let versionId: number | null = null;

    if (versionIdParam) {
      // 用户明确指定了版本，严格按版本查询
      versionId = parseInt(versionIdParam);
    } else {
      // 未指定版本，查找 active version
      const active = await getActiveVersion(year, companyCode);
      versionId = active?.id ?? null;
    }

    let deptBudget: unknown[] = [];
    let rdBudget: unknown[] = [];

    if (versionId) {
      deptBudget = await loadDeptBudgetFromDb(versionId);
      rdBudget = await loadRdBudgetFromDb(versionId);
    }

    // Fallback 到 Excel：仅当没有任何 active version 时（兼容旧数据）
    if (!versionId) {
      const rawDept = readDeptBudget();
      deptBudget = rawDept.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
      const rawRd = readRdBudget();
      rdBudget = rawRd.map((i) => ({ ...i, accountId: null, accountCode: null, accountActive: null }));
    }

    return NextResponse.json({ deptBudget, rdBudget, versionId });
  });

  export const POST = withFinanceBudgetWrite(async (request: Request) => {
    const { year, companyCode } = await request.json();
    if (!year || isNaN(parseInt(year))) {
      return NextResponse.json({ error: "year 为必填" }, { status: 400 });
    }

    const version = await createBudgetVersion({
      year: parseInt(year),
      companyCode,
      name: `导入于 ${new Date().toLocaleDateString("zh-CN")}`,
      type: "all",
    });

    const deptCount = await importDeptBudgetToDb(parseInt(year), companyCode, version.id);
    const rdCount = await importRdBudgetToDb(parseInt(year), companyCode, version.id);

    return NextResponse.json({ success: true, version, deptCount, rdCount });
  });
  ```

- [ ] **Step 4: 新增版本列表 API**

  **File:** `app/api/finance/budget/versions/route.ts`

  ```typescript
  import { NextResponse } from "next/server";
  import { withFinanceBudgetAccess, withFinanceBudgetWrite } from "@/lib/with-auth";
  import { listBudgetVersions, createBudgetVersion } from "@/server/services/finance/budget/budget-version";

  export const GET = withFinanceBudgetAccess(async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2026");
    const companyCode = searchParams.get("companyCode") || undefined;
    const versions = await listBudgetVersions(year, companyCode);
    return NextResponse.json({ versions });
  });

  export const POST = withFinanceBudgetWrite(async (request: Request) => {
    const body = await request.json();
    const { year, companyCode, name, type } = body;
    if (!year || !name) {
      return NextResponse.json({ error: "year 和 name 为必填" }, { status: 400 });
    }
    const version = await createBudgetVersion({ year, companyCode, name, type });
    return NextResponse.json({ version });
  });
  ```

- [ ] **Step 5: 新增版本激活 API（注意 wrapper 写法）**

  **File:** `app/api/finance/budget/versions/[id]/activate/route.ts`

  ```typescript
  import { NextResponse } from "next/server";
  import { withFinanceBudgetWrite } from "@/lib/with-auth";
  import { activateBudgetVersion } from "@/server/services/finance/budget/budget-version";

  export const POST = withFinanceBudgetWrite(async (request: Request) => {
    const id = parseInt(request.url.split("/").pop() || "");
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "无效ID" }, { status: 400 });
    }

    const version = await activateBudgetVersion(id);
    return NextResponse.json({ success: true, version });
  });
  ```

  > **注意：** `withAuth` wrapper 只透传 `(req, user)`，不自动透传 Next.js `params`。必须从 `request.url.split("/").pop()` 提取 id。此写法与 `app/api/contracts/[id]/route.ts` 一致。

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat(budget): add version management service and version-aware API routes"
  ```

---

## C3: 前端拆分 + 版本 UI

**范围:** `app/finance/budget/`

**前提：** BudgetTab.tsx 当前 209 行，加版本选择器必超 220 行红线。必须先拆 hooks。

- [ ] **Step 1: 创建 useBudgetData hook**

  **File:** `app/finance/budget/hooks/useBudgetData.ts`

  ```typescript
  "use client";

  import { useEffect, useState } from "react";
  import { DeptBudgetItem, RdBudgetItem } from "../BudgetTab";

  interface BudgetData {
    deptBudget: DeptBudgetItem[];
    rdBudget: RdBudgetItem[];
    versionId: number | null;
  }

  interface Version {
    id: number;
    name: string;
    status: string;
    createdAt: string;
  }

  export function useBudgetData(year: number, companyCode?: string) {
    const [data, setData] = useState<BudgetData | null>(null);
    const [versions, setVersions] = useState<Version[]>([]);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 加载版本列表
    useEffect(() => {
      fetch(`/api/finance/budget/versions?year=${year}${companyCode ? `&companyCode=${companyCode}` : ""}`)
        .then((r) => r.json())
        .then((d: { versions: Version[] }) => {
          setVersions(d.versions);
          const active = d.versions.find((v) => v.status === "active");
          if (active) setActiveVersionId(active.id);
        })
        .catch(() => setError("加载版本列表失败"));
    }, [year, companyCode]);

    // 加载预算数据（按 activeVersionId 或默认）
    useEffect(() => {
      setLoading(true);
      const url = activeVersionId
        ? `/api/finance/budget?year=${year}&versionId=${activeVersionId}`
        : `/api/finance/budget?year=${year}${companyCode ? `&companyCode=${companyCode}` : ""}`;

      fetch(url)
        .then((r) => r.json())
        .then((d: BudgetData) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => {
          setError("加载预算数据失败");
          setLoading(false);
        });
    }, [year, companyCode, activeVersionId]);

    return { data, versions, activeVersionId, setActiveVersionId, loading, error };
  }
  ```

- [ ] **Step 2: 创建 useBudgetFilters hook**

  **File:** `app/finance/budget/hooks/useBudgetFilters.ts`

  ```typescript
  "use client";

  import { useMemo, useState } from "react";
  import { DeptBudgetItem, RdBudgetItem } from "../BudgetTab";

  export function useBudgetFilters(data: { deptBudget: DeptBudgetItem[]; rdBudget: RdBudgetItem[] } | null) {
    // Dept filters
    const [deptFilter, setDeptFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [accountFilter, setAccountFilter] = useState("");

    // R&D filters
    const [projectFilter, setProjectFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");

    const deptOptions = useMemo(() => {
      if (!data) return [];
      return [...new Set(data.deptBudget.map((i) => i.dept))].sort();
    }, [data]);

    const typeOptions = useMemo(() => {
      if (!data) return [];
      return [...new Set(data.deptBudget.map((i) => i.expenseType).filter(Boolean))].sort();
    }, [data]);

    const accountOptions = useMemo(() => {
      if (!data) return [];
      return [...new Set(data.deptBudget.map((i) => i.account))].sort();
    }, [data]);

    const projectOptions = useMemo(() => {
      if (!data) return [];
      return [...new Set(data.rdBudget.map((i) => i.project))].sort();
    }, [data]);

    const categoryOptions = useMemo(() => {
      if (!data) return [];
      return [...new Set(data.rdBudget.map((i) => i.category))].sort();
    }, [data]);

    const filteredDept = useMemo(() => {
      if (!data) return [];
      return data.deptBudget.filter((i) => {
        if (deptFilter && i.dept !== deptFilter) return false;
        if (typeFilter && i.expenseType !== typeFilter) return false;
        if (accountFilter && i.account !== accountFilter) return false;
        return true;
      });
    }, [data, deptFilter, typeFilter, accountFilter]);

    const filteredRd = useMemo(() => {
      if (!data) return [];
      return data.rdBudget.filter((i) => {
        if (projectFilter && i.project !== projectFilter) return false;
        if (categoryFilter && i.category !== categoryFilter) return false;
        return true;
      });
    }, [data, projectFilter, categoryFilter]);

    const deptTotal = useMemo(() => filteredDept.reduce((s, i) => s + i.total, 0), [filteredDept]);
    const rdTotal = useMemo(() => filteredRd.reduce((s, i) => s + i.total, 0), [filteredRd]);

    const deptMonthTotals = useMemo(() => {
      const totals = new Array(12).fill(0);
      for (const i of filteredDept) {
        for (let m = 0; m < 12; m++) totals[m] += i.months[m];
      }
      return totals;
    }, [filteredDept]);

    const rdMonthTotals = useMemo(() => {
      const totals = new Array(12).fill(0);
      for (const i of filteredRd) {
        for (let m = 0; m < 12; m++) totals[m] += i.months[m];
      }
      return totals;
    }, [filteredRd]);

    return {
      deptFilter, setDeptFilter,
      typeFilter, setTypeFilter,
      accountFilter, setAccountFilter,
      projectFilter, setProjectFilter,
      categoryFilter, setCategoryFilter,
      deptOptions, typeOptions, accountOptions,
      projectOptions, categoryOptions,
      filteredDept, filteredRd,
      deptTotal, rdTotal,
      deptMonthTotals, rdMonthTotals,
    };
  }
  ```

- [ ] **Step 3: 精简 BudgetTab.tsx**

  **File:** `app/finance/budget/BudgetTab.tsx`

  精简后约 100 行，只负责组合：

  ```tsx
  "use client";

  import { useState } from "react";
  import Toast from "@/app/components/Toast";
  import { useToast } from "@/app/hooks/useToast";
  import { useBudgetData } from "./hooks/useBudgetData";
  import { useBudgetFilters } from "./hooks/useBudgetFilters";
  import BudgetVersionSelector from "./components/BudgetVersionSelector";
  import DeptBudgetFilters from "./components/DeptBudgetFilters";
  import DeptBudgetTable from "./components/DeptBudgetTable";
  import RdBudgetFilters from "./components/RdBudgetFilters";
  import RdBudgetTable from "./components/RdBudgetTable";

  export interface DeptBudgetItem {
    dept: string;
    account: string;
    total: number;
    months: number[];
    expenseType: string;
    accountId: number | null;
    accountCode: string | null;
    accountActive: boolean | null;
  }

  export interface RdBudgetItem {
    project: string;
    category: string;
    total: number;
    months: number[];
    accountId: number | null;
    accountCode: string | null;
    accountActive: boolean | null;
  }

  type BudgetView = "dept" | "rd";

  export default function BudgetTab() {
    const [view, setView] = useState<BudgetView>("dept");
    const { toast, showToast, closeToast } = useToast();
    const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
    const filters = useBudgetFilters(data);

    if (loading) {
      return <p className="p-8 text-center text-gray-500">加载中...</p>;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {/* View Switcher */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("dept")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                view === "dept" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              部门费用预算
            </button>
            <button
              onClick={() => setView("rd")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                view === "rd" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              研发费用预算
            </button>
          </div>

          {/* Version Selector */}
          <BudgetVersionSelector
            versions={versions}
            activeVersionId={activeVersionId}
            onChange={setActiveVersionId}
          />
        </div>

        {view === "dept" && (
          <>
            <DeptBudgetFilters
              deptFilter={filters.deptFilter}
              setDeptFilter={filters.setDeptFilter}
              typeFilter={filters.typeFilter}
              setTypeFilter={filters.setTypeFilter}
              accountFilter={filters.accountFilter}
              setAccountFilter={filters.setAccountFilter}
              deptOptions={filters.deptOptions}
              typeOptions={filters.typeOptions}
              accountOptions={filters.accountOptions}
              count={filters.filteredDept.length}
              total={filters.deptTotal}
            />
            <DeptBudgetTable
              items={filters.filteredDept}
              monthTotals={filters.deptMonthTotals}
              total={filters.deptTotal}
            />
          </>
        )}

        {view === "rd" && (
          <>
            <RdBudgetFilters
              projectFilter={filters.projectFilter}
              setProjectFilter={filters.setProjectFilter}
              categoryFilter={filters.categoryFilter}
              setCategoryFilter={filters.setCategoryFilter}
              projectOptions={filters.projectOptions}
              categoryOptions={filters.categoryOptions}
              count={filters.filteredRd.length}
              total={filters.rdTotal}
            />
            <RdBudgetTable
              items={filters.filteredRd}
              monthTotals={filters.rdMonthTotals}
              total={filters.rdTotal}
            />
          </>
        )}

        <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
      </div>
    );
  }
  ```

- [ ] **Step 4: 创建 BudgetVersionSelector 组件**

  **File:** `app/finance/budget/components/BudgetVersionSelector.tsx`

  ```tsx
  "use client";

  interface Version {
    id: number;
    name: string;
    status: string;
    createdAt: string;
  }

  interface Props {
    versions: Version[];
    activeVersionId: number | null;
    onChange: (versionId: number) => void;
  }

  function statusLabel(status: string) {
    if (status === "active") return "生效";
    if (status === "draft") return "草稿";
    if (status === "archived") return "归档";
    return status;
  }

  export default function BudgetVersionSelector({ versions, activeVersionId, onChange }: Props) {
    if (versions.length === 0) {
      return <span className="text-sm text-gray-400">暂无版本</span>;
    }

    return (
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500">预算版本:</label>
        <select
          value={activeVersionId ?? ""}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({statusLabel(v.status)})
            </option>
          ))}
        </select>
      </div>
    );
  }
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "feat(budget): split BudgetTab into hooks, add version selector"
  ```

---

## C4: 预算分析对接 active version

**范围:** `server/services/finance/analysis/`, `app/finance/analysis/`

> **背景：** `FinanceAnalysisClient` 当前全是"待接入数据"占位。C4 目标是让分析页知道当前 active version 并展示预算概览，为后续"预算 vs 实际"对比打基础。

- [ ] **Step 1: 创建 budget-analysis service**

  **File:** `server/services/finance/analysis/budget-analysis.ts`

  ```typescript
  import { prisma } from "@/lib/prisma";
  import { getActiveVersion } from "@/server/services/finance/budget/budget-version";

  export async function getBudgetAnalysis(year: number, companyCode?: string) {
    const activeVersion = await getActiveVersion(year, companyCode);
    if (!activeVersion) {
      return { hasBudget: false as const };
    }

    const [deptAgg, rdAgg] = await Promise.all([
      prisma.financeBudgetDept.aggregate({
        where: { versionId: activeVersion.id },
        _sum: { total: true },
      }),
      prisma.financeBudgetRd.aggregate({
        where: { versionId: activeVersion.id },
        _sum: { total: true },
      }),
    ]);

    return {
      hasBudget: true as const,
      version: activeVersion,
      deptTotal: deptAgg._sum.total ?? 0,
      rdTotal: rdAgg._sum.total ?? 0,
    };
  }
  ```

- [ ] **Step 2: 新增分析页预算 API**

  **File:** `app/api/finance/analysis/budget/route.ts`

  ```typescript
  import { NextResponse } from "next/server";
  import { withFinanceAnalysisAccess } from "@/lib/with-auth";
  import { getBudgetAnalysis } from "@/server/services/finance/analysis/budget-analysis";

  export const GET = withFinanceAnalysisAccess(async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2026");
    const companyCode = searchParams.get("companyCode") || undefined;
    const result = await getBudgetAnalysis(year, companyCode);
    return NextResponse.json(result);
  });
  ```

- [ ] **Step 3: 修改 FinanceAnalysisClient 展示预算概览**

  **File:** `app/finance/analysis/FinanceAnalysisClient.tsx`

  在现有占位卡片下方，增加一个"预算概览"区域：
  - 显示当前 active version 名称
  - 显示部门预算总额 + 研发预算总额
  - 如果没有 active version，提示"暂无生效预算版本"

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { SessionUser } from "@/lib/types";

  interface BudgetOverview {
    hasBudget: boolean;
    version?: { name: string; status: string };
    deptTotal?: number;
    rdTotal?: number;
  }

  interface Props {
    user: SessionUser;
  }

  export default function FinanceAnalysisClient({ user: _user }: Props) {
    const [budget, setBudget] = useState<BudgetOverview | null>(null);

    useEffect(() => {
      fetch("/api/finance/analysis/budget?year=2026")
        .then((r) => r.json())
        .then(setBudget)
        .catch(() => setBudget({ hasBudget: false }));
    }, []);

    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-800">财务分析</h1>
        <p className="mb-6 text-sm text-gray-500">财务数据分析与指标看板</p>

        {/* 预算概览卡片 */}
        <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">预算概览</h2>
          {budget?.hasBudget ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-gray-400">生效版本</p>
                <p className="mt-1 text-sm font-medium text-gray-700">{budget.version?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">部门预算总额</p>
                <p className="mt-1 text-lg font-bold text-emerald-600">
                  {(budget.deptTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">研发预算总额</p>
                <p className="mt-1 text-lg font-bold text-blue-600">
                  {(budget.rdTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无生效预算版本</p>
          )}
        </div>

        {/* 原有占位内容保留 */}
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

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(analysis): wire budget active version to analysis overview"
  ```

---

## 自审检查表

1. **Spec coverage:**
   - [x] FinanceBudgetVersion 模型 → C1
   - [x] versionId 外键关联 → C1
   - [x] 新建 finance-budget.prisma（不从 cost 借壳）→ C1 Step 1-4
   - [x] 数据迁移（nullable → 回填 → required）→ C1 Step 5-11
   - [x] SQLite partial unique index（同 year+companyCode 仅一个 active）→ C1 Step 6
   - [x] 版本管理 CRUD（含 delete）→ C2 Step 1
   - [x] 预算查询按 versionId → C2 Step 2-3
   - [x] 导入创建 draft version → C2 Step 3 POST
   - [x] 激活时自动归档旧版本 → C2 Step 1 `activateBudgetVersion`
   - [x] 前端先拆 hooks（不超限）→ C3 Step 1-2
   - [x] 前端版本选择器 → C3 Step 4
   - [x] 动态路由 wrapper 写法修正 → C2 Step 5
   - [x] Excel fallback 更谨慎 → C2 Step 3 GET
   - [x] 预算分析对接 active version → C4

2. **Placeholder scan:** 无 TBD/TODO。

3. **类型一致性:**
   - `BudgetVersionStatus` = "draft" | "active" | "archived" 与 schema 一致
   - `CreateVersionInput.type` = "dept" | "rd" | "all" 与 schema 一致
   - API 返回的 `versionId` 为 number，与数据库类型一致
   - `FinanceBudgetDept.versionId` 最终为 `Int` (required)，与 service 层 `versionId: number` 一致
