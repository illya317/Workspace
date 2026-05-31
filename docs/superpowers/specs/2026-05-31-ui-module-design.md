# UI 模块化设计

## 一个标准表格页面 = 哪些模块

```
┌─ AppShell ──────────────────────────────────────────┐
│ Logo | Title            [NavLinks] [返回] [UserMenu] │
├─ TabBar ─────────────────────────────────────────────┤
│  [ 科目设置 ] [ 凭证明细 ] [ 余额表 ]                 │
├─ FilterBar ──────────────────────────────────────────┤
│ 公司▼ 年度▼ 月份▼ [搜索...]  每页▼  共xxx条  [extra] │
├─ Content ────────────────────────────────────────────┤
│  Table / Cards / Drill-down                          │
├─ Pagination ─────────────────────────────────────────┤
│  [首页] [上一页] 1/10 [下一页] [末页]                  │
└──────────────────────────────────────────────────────┘
```

## 全局原子组件 vs 领域组合组件

### 核心原则

```
app/components/        ← 全局原子：无业务语义、纯 UI 积木
app/<domain>/components/ ← 领域组合：用全局原子拼出业务上下文
```

全局组件不内置公司列表、状态枚举、金额格式默认值。业务映射（如 `pending→待审核/gray`）留在领域目录。

### 全局原子组件目录

| 组件 | 路径 | 用途 | 状态 |
|------|------|------|------|
| **DataTable** | `app/components/DataTable.tsx` | 通用表格：表头/行/空/loading/列可见性 | ✅ 已建 |
| **ColumnToggle** | `app/components/ColumnToggle.tsx` | 列显隐切换（与 DataTable 共用 ColumnDef） | ✅ 已有 |
| **SelectField** | `app/components/SelectField.tsx` | 通用下拉：label + select + options | ✅ 已建 |
| **NumberCell** | `app/components/NumberCell.tsx` | 数字显示：locale/fractionDigits/右对齐 | ✅ 已建 |
| **AmountCell** | `app/components/AmountCell.tsx` | 金额显示：NumberCell + currencySymbol/正负颜色 | ✅ 已建 |
| **StatusBadge** | `app/components/StatusBadge.tsx` | 状态徽标：label + variant(gray/green/blue/red/yellow) | ✅ 已建 |
| **FilterBar** | `app/components/FilterBar.tsx` | 筛选栏容器（7行 wrapper） | ✅ 已有 |
| **SearchBox** | `app/components/SearchBox.tsx` | 统一搜索框（typeahead/autocomplete） | ✅ 已有 |
| **ConfirmModal** | `app/components/ConfirmModal.tsx` | 确认弹窗 | ✅ 已有 |
| **AppShell** | `app/components/AppShell.tsx` | 页面顶栏 | ✅ 已有 |
| **Pagination** | `app/finance/components/Pagination.tsx` | 分页（待迁到全局） | ⏳ 待迁 |
| **TabBar** | 散落各处手写 | 下划线 tab 导航（待提取） | ⏳ 待建 |

### 财务组合组件目录

| 组件 | 路径 | 说明 |
|------|------|------|
| **FinanceFilters** | `app/finance/components/FinanceFilters.tsx` | FilterBar + SelectField + SearchBox 组合 |
| **CompanyPeriodPicker** | `app/finance/components/CompanyPeriodPicker.tsx` | 公司+年+月组合（SelectField 拼装） |
| **ReviewActionModal** | `app/finance/components/ReviewActionModal.tsx` | 审核弹窗（替代 prompt+parseFloat） |
| **reclassStatus** | `app/finance/components/reclassStatus.ts` | 重分类状态 → StatusBadge variant 映射 |

### 判断矩阵

| 问题 | 放全局 `app/components/` | 放领域 `app/<domain>/components/` |
|------|--------------------------|----------------------------------|
| 其他模块能原样用？ | ✅ | ❌ 只在一处用 |
| 含 pending/company/year 等业务词？ | ❌ 禁止 | ✅ |
| 是对全局原子组件的组合？ | ❌ | ✅ |
| 是通用 UI 模式（badge/select/table）？ | ✅ | ❌ |

## 哪些可以全局（跨域共享）

| 模块 | 现有位置 | 迁到 | 适用范围 |
|------|---------|------|---------|
| **AppShell** | `app/components/AppShell.tsx` | 不变 ✅ | 全站 |
| **DataTable** | `app/components/DataTable.tsx` | 不变 ✅ | 全站 |
| **ColumnToggle** | `app/components/ColumnToggle.tsx` | 不变 ✅ | 全站 |
| **SelectField** | `app/components/SelectField.tsx` | 不变 ✅ | 全站 |
| **NumberCell / AmountCell** | `app/components/` | 不变 ✅ | 全站 |
| **StatusBadge** | `app/components/StatusBadge.tsx` | 不变 ✅ | 全站 |
| **FilterBar** | `app/components/FilterBar.tsx` | 不变 ✅ | 全站 |
| **SearchBox** | `app/components/SearchBox.tsx` | 不变 ✅ | 全站 |
| **TabBar** | 散落在 LedgerClient / HRClient / AdminClient / SchedulesClient 各自手写 | `app/components/TabBar.tsx` | 全站表格页 |
| **Pagination** | `app/finance/components/Pagination.tsx` | `app/components/Pagination.tsx` | 全站 |
| **ModuleHome** | `app/components/ModuleHome.tsx` | 不变 ✅ | 全站 L1 模块入口 |
| **useCSV** | `app/hooks/useCSV.tsx` | 不变 ✅ | 全站 |

## 哪些是领域专用（财务 vs 人事）

### 财务：FinanceFilters（组合式）
`app/finance/components/FinanceFilters.tsx`

内部用 FilterBar + SelectField + SearchBox 拼装，但仍对外暴露财务业务语义的 props 简化调用：

```tsx
<FinanceFilters
  companyFilter={c} yearFilter={y} monthFilter={m}
  keyword={kw} pageSize={ps} total={total}
  onCompanyChange={...} onYearChange={...} ...
  showMonth={false}    // 科目表没月份
  showLevel             // 科目表有层级
  showSearch={false}   // 报表页不需要搜索
  extra={<><button>导出CSV</button><ScopeToggle /></>}
/>
```

新增的财务组合组件：

| 组件 | 用途 |
|------|------|
| **CompanyPeriodPicker** | 公司+年+月三联动选择器（SelectField 组合） |
| **ReviewActionModal** | 审核弹窗（替代 prompt+parseFloat，有验证和状态） |
| **reclassStatus.ts** | 重分类状态 → StatusBadge variant 映射（业务常量） |

### 人事：HRToolbar
`app/components/HRToolbar.tsx`（已有）

标准字段：搜索 + 编辑模式切换 + 保存/取消
扩展槽：children — 放筛选下拉、新建按钮等

## 页面独有需求怎么处理

通过 `extra` 槽位。不污染公共组件：

| 页面 | 独有需求 | 放哪里 |
|------|---------|--------|
| 科目设置 | 全部/集团/独有 toggle | `extra` |
| 财务报表 | 报表类型 selector + 生成按钮 | `extra` |
| 重分类表 | CSV 导出按钮 | `extra` |
| 预算管理 | 费用类型/科目筛选 | `extra` |
| 部门预算/RD预算 | tab 切换 | `TabBar` |

## 迁移清单

### Phase 1: 全局原子组件 ✅
- [x] 创建 `app/components/DataTable.tsx`
- [x] 创建 `app/components/SelectField.tsx`
- [x] 创建 `app/components/NumberCell.tsx`
- [x] 创建 `app/components/AmountCell.tsx`
- [x] 创建 `app/components/StatusBadge.tsx`
- [ ] 移动 `app/finance/components/Pagination.tsx` → `app/components/Pagination.tsx`
- [ ] 创建 `app/components/TabBar.tsx`

### Phase 2: 财务组合组件
- [ ] 创建 `app/finance/components/CompanyPeriodPicker.tsx`
- [ ] 创建 `app/finance/components/ReviewActionModal.tsx`
- [ ] 创建 `app/finance/components/reclassStatus.ts`（业务映射）
- [ ] `FinanceFilters` 内部重构为 FilterBar + SelectField + SearchBox

### Phase 3: 表格迁移
- [ ] `AccountTable` 迁 `DataTable`
- [ ] `VoucherTab` 主表迁 `DataTable`
- [ ] `ReclassResultTable` 改用 StatusBadge + DataTable
- [ ] `ReclassReviewView` 改用 ReviewActionModal（替代 prompt）

### Phase 4: 去重
- [ ] 替换 15 处重复 `fmt()` → NumberCell / AmountCell
- [ ] 替换 3 处重复 STATUS_LABEL/STATUS_CLASS → reclassStatus.ts + StatusBadge
- [ ] 替换 2 处 prompt+parseFloat → ReviewActionModal
