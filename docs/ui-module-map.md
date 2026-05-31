# UI 模块积木图

架构地图，新增页面时从这里取模块，禁止手写已有功能。

## 页面骨架

```
AppShell
  └─ TabBar（可选）
       └─ FilterBar（可选）
            └─ Content
                 └─ Pagination（可选）
```

## 全局模块（跨域共享）

| 模块 | 路径 | 用途 | 强制 |
|------|------|------|------|
| **AppShell** | `app/components/AppShell.tsx` | 页面顶栏：Logo + Title + NavLinks + 返回 + UserMenu | ✅ 所有二级页面 |
| **TabBar** | `app/components/TabBar.tsx` | 下划线 tab 导航 | ✅ 多 tab 页面 |
| **Pagination** | `app/components/Pagination.tsx` | 分页控件：首页/上一页/页码/下一页/末页 | ✅ 有分页需求 |
| **ModuleHome** | `app/components/ModuleHome.tsx` | L1 模块子入口卡片 | ✅ L1 模块首页 |
| **useCSV** | `app/hooks/useCSV.tsx` | CSV 导出（hook） | 推荐 |
| **requireResourceAccess** | `server/auth/guard.ts` | 路由级权限门禁 | ✅ 子页面 layout.tsx |
| **requireAuth** | `server/auth/session.ts` | 登录门禁（redirect to /login） | ✅ 页面 facade |

## 财务专用模块

组合原则：领域组件用全局原子拼装，不手写已有功能。

| 模块 | 路径 | 用途 | 覆盖页面 |
|------|------|------|---------|
| **FinanceFilters** | `app/finance/components/FinanceFilters.tsx` | 筛选栏：FilterBar + SelectField + SearchBox 组合，支持公司/年/月/层级/搜索/每页/共xxx条/extra 槽 | 总账/报表/预算/成本 |
| **CompanyPeriodPicker** | `app/finance/components/CompanyPeriodPicker.tsx` | 公司+年+月组合选择器（SelectField 组合） | 导入/成本/预算 |
| **ReviewActionModal** | `app/finance/components/ReviewActionModal.tsx` | 重分类审核弹窗（替代 prompt+parseFloat） | 重分类审核 |
| **AccountCodeInput** | `app/finance/components/AccountCodeInput.tsx` | 科目编码输入/选择 | 科目/重分类规则 |
| **ReportLines** | `app/finance/statements/ReportLines.tsx` | 报表行项目 + drill-down 明细展开 | 财务报表 |
| **AccountTable** | `app/finance/components/AccountTable.tsx` | 科目表格（待迁 DataTable） | 科目设置 |
| **AccountCreateModal** | `app/finance/components/AccountCreateModal.tsx` | 新增科目弹窗 | 科目设置 |
| **FinanceBalanceReconcile** | `app/finance/components/FinanceBalanceReconcile.tsx` | 余额对账 | 余额表 |
| **ImportPreview** | `app/finance/import/components/ImportPreview.tsx` | 导入预览 | 数据导入 |
| **FinanceShell** | `app/finance/components/FinanceShell.tsx` | 财务导航外壳 | 财务全模块 |

重分类状态映射（业务常量，不进全局 StatusBadge）：

```ts
// app/finance/components/reclassStatus.ts
import type { StatusBadgeProps } from "@/app/components/StatusBadge";

export const RECLASS_STATUS: Record<string, { label: string; variant: StatusBadgeProps["variant"] }> = {
  pending:  { label: "待审核", variant: "gray" },
  approved: { label: "已通过", variant: "green" },
  adjusted: { label: "已调整", variant: "blue" },
  rejected: { label: "已驳回", variant: "red" },
};
```

## 人事专用模块

| 模块 | 路径 | 用途 |
|------|------|------|
| **HRToolbar** | `app/components/HRToolbar.tsx` | 工具栏：搜索 + 编辑模式 + 保存/取消 + children 槽 |
| **GenericTableTab** | `app/hr/tabs/GenericTableTab.tsx` | 通用 CRUD 表格 tab |
| **EditableTable** | `app/hr/tabs/EditableTable.tsx` | 可编辑表格 |
| **CodeTab** | `app/hr/code/CodeTab.tsx` | 编码管理 tab（部门/岗位） |

## 管理后台专用模块

| 模块 | 路径 | 用途 |
|------|------|------|
| **UserRow** | `app/admin/tabs/UserRow.tsx` | 用户行（含权限徽章） |
| **MatrixTable** | `app/admin/components/permissions/MatrixTable.tsx` | 权限矩阵表 |
| **ResourceTree** | `app/admin/components/permissions/ResourceTree.tsx` | 资源树选择器 |

## 全局共享组件（通用 UI）

### 表格与列控制

| 模块 | 路径 | 用途 |
|------|------|------|
| **DataTable** | `app/components/DataTable.tsx` | 通用数据表格：表头/行/空状态/loading/列可见性 |
| **ColumnToggle** | `app/components/ColumnToggle.tsx` | 列显隐切换下拉（与 DataTable 共用 ColumnDef） |

### 单元格与徽标

| 模块 | 路径 | 用途 |
|------|------|------|
| **NumberCell** | `app/components/NumberCell.tsx` | 数字显示：locale/fractionDigits/右对齐/空值 |
| **AmountCell** | `app/components/AmountCell.tsx` | 金额显示：基于 NumberCell + currencySymbol/正负颜色 |
| **StatusBadge** | `app/components/StatusBadge.tsx` | 状态徽标：label + variant(gray/green/blue/red/yellow)，无业务语义 |

### 筛选与搜索

| 模块 | 路径 | 用途 |
|------|------|------|
| **FilterBar** | `app/components/FilterBar.tsx` | 筛选栏容器（纯 wrapper） |
| **SelectField** | `app/components/SelectField.tsx` | 通用下拉：label + select + options |
| **SearchBox** | `app/components/SearchBox.tsx` | 统一搜索框（typeahead/autocomplete） |

### 弹窗与工具栏

| 模块 | 路径 | 用途 |
|------|------|------|
| **ConfirmModal** | `app/components/ConfirmModal.tsx` | 确认弹窗 |
| **DetailModal** | `app/components/DetailModal.tsx` | 详情弹窗 |
| **EditToolbar** | `app/components/EditToolbar.tsx` | 编辑工具栏 |
| **Toast + useToast** | `app/components/Toast.tsx` + `app/hooks/useToast.ts` | 通知提示 |

### 导航与用户

| 模块 | 路径 | 用途 |
|------|------|------|
| **TargetSwitcher** | `app/components/TargetSwitcher.tsx` | 汇报对象选择器 |
| **UserMenu** | `app/components/UserMenu.tsx` | 用户菜单 |
| **NavLink** | `app/components/NavLink.tsx` | 导航链接 |

## 全局原子 vs 领域组合

### 原则

```
全局原子组件 (app/components/)
  → 无业务语义、纯 UI 积木
  → 不内置公司/状态/金额格式默认值

领域组合组件 (app/<domain>/components/)
  → 用全局原子拼装出业务上下文
  → 业务常量（状态映射/公司列表）留在领域目录
```

### 判断标准

| 问题 | 全局 | 领域 |
|------|------|------|
| 其他模块也能原样用吗？ | ✅ | ❌ 只在一个 domain 出现 |
| 包含 pending/approved/company/year 等业务语义吗？ | ❌ | ✅ |
| 是对现有全局原子的组合吗？ | ❌ | ✅ |
| 只是通用 UI 模式（badge/select/table/cell）吗？ | ✅ | ❌ |

### 示例

```tsx
// ❌ 全局 StatusBadge 内置业务状态
<StatusBadge status="pending" />   // 错误：把业务语义塞进全局

// ✅ 全局 StatusBadge + 领域映射
import { RECLASS_STATUS } from "@/app/finance/components/reclassStatus";
<StatusBadge label={RECLASS_STATUS[row.status].label} variant={RECLASS_STATUS[row.status].variant} />

// ❌ FinanceFilters 作为唯一的筛选栏
<FinanceFilters companyFilter={c} yearFilter={y} ... />

// ✅ FilterBar + SelectField 组合（FinanceFilters 内部实现）
<FilterBar>
  <SelectField label="公司" options={companies} value={c} onChange={setC} />
  <SelectField label="年度" options={years} value={y} onChange={setY} />
  ...
</FilterBar>
```

## 页面组装示例

```tsx
// 一个标准财务表格页面
// page.tsx (server)
export default async function Page() {
  const user = await requireAuth();
  return <AppShell title="总账基础" backHref="/finance" user={user}><LedgerClient /></AppShell>;
}

// LedgerClient.tsx (client)
export default function LedgerClient() {
  const [tab, setTab] = useState("accounts");
  return (
    <main>
      <TabBar tabs={[...]} active={tab} onChange={setTab} />
      {tab === "accounts" && <AccountTab />}
      {tab === "vouchers" && <VoucherTab />}
    </main>
  );
}

// AccountTab.tsx (client)
export default function AccountTab() {
  const [visibleColumns, setVisibleColumns] = useState(
    getDefaultVisibleColumns(ACCOUNT_COLUMNS)
  );

  return (
    <div>
      <FinanceFilters {...standard} showMonth={false} showLevel
        extra={<ScopeToggle />} />
      <div className="flex items-center justify-between mb-2">
        <ColumnToggle columns={ACCOUNT_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
      </div>
      <DataTable
        rows={accounts}
        columns={ACCOUNT_COLUMNS}
        visibleColumns={visibleColumns}
        loading={loading}
        emptyText="暂无科目数据"
        rowKey={(a) => a.id}
      />
      <Pagination ... />
    </div>
  );
}
```

## 硬约束

### 代码检查（pre-commit / CI）

```bash
# 检查是否有页面手写了下划线 tab 而不是用 TabBar
node scripts/check/check-module-usage.js --rule tab-bar

# 检查是否有页面手写了分页而不是用 Pagination
node scripts/check/check-module-usage.js --rule pagination

# 检查是否有页面手写了筛选栏而不是用 FinanceFilters / HRToolbar
node scripts/check/check-module-usage.js --rule filter-bar
```

### 白名单

`scripts/check/module-whitelist.json`：

```json
{
  "tab-bar": {
    "description": "页面上手写 Border-b-2 下划线 tab",
    "allowed": [
      "app/admin/AdminClient.tsx",           // 权限管理tab结构特殊
      "app/hr/performance/HRPerformanceClient.tsx"  // 现有，逐步迁
    ]
  },
  "pagination": {
    "allowed": []
  },
  "filter-bar": {
    "allowed": [
      "app/finance/statements/ReportTab.tsx",  // 报表选择器
      "app/admin/tabs/AdminUsersTab.tsx"       // 用户搜索特殊
    ]
  }
}
```

白名单用不过来的，统一迁到标准模块，然后从白名单里删掉。

### 禁止模式

```tsx
// ❌ 手写下划线 tab
<div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">

// ✅ 用 TabBar
<TabBar tabs={[...]} active={activeTab} onChange={setActiveTab} />
```
