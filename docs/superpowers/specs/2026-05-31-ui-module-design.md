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

## 哪些可以全局（跨域共享）

| 模块 | 现有位置 | 迁到 | 适用范围 |
|------|---------|------|---------|
| **AppShell** | `app/components/AppShell.tsx` | 不变 ✅ | 全站 |
| **TabBar** | 散落在 LedgerClient / HRClient / AdminClient / SchedulesClient 各自手写 | `app/components/TabBar.tsx` | 全站表格页 |
| **Pagination** | `app/finance/components/Pagination.tsx` | `app/components/Pagination.tsx` | 全站 |
| **ModuleHome** | `app/components/ModuleHome.tsx` | 不变 ✅ | 全站 L1 模块入口 |
| **useCSV** | `app/hooks/useCSV.tsx` | 不变 ✅ | 全站 |

## 哪些是领域专用（财务 vs 人事）

### 财务：FinanceFilters
`app/finance/components/FinanceFilters.tsx`

标准字段：公司 + 年度 + 月份 + 搜索 + 每页 + 共xxx条
可选字段：科目层级（`showLevel`）
扩展槽：`extra` — 放按钮、toggle、自定义下拉

用法：
```tsx
<FinanceFilters
  companyFilter={c} yearFilter={y} monthFilter={m}
  keyword={kw} pageSize={ps} total={total}
  onCompanyChange={...} onYearChange={...} ...
  // 按需开关
  showMonth={false}    // 科目表没月份
  showLevel             // 科目表有层级
  showSearch={false}   // 报表页不需要搜索
  // 页面独有内容放 extra
  extra={<><button>导出CSV</button><ScopeToggle /></>}
/>
```

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

### Phase 1: 提取全局组件
- [ ] 创建 `app/components/TabBar.tsx`（underline tab 导航）
- [ ] 移动 `app/finance/components/Pagination.tsx` → `app/components/Pagination.tsx`
- [ ] 更新所有 import 引用

### Phase 2: 统一财务 FilterBar
- [ ] AccountTab 改用 FinanceFilters（已完成 ✅）
- [ ] VoucherTab 加 keyword search
- [ ] LedgerTab 加 keyword search
- [ ] ReclassTab 加 total display
- [ ] ReportTab 保持现状（已有独特控件）

### Phase 3: 统一 TabBar
- [ ] LedgerClient 改用 TabBar
- [ ] SchedulesClient 改用 TabBar
- [ ] AdminClient 改用 TabBar
- [ ] HRClient 改用 TabBar（可选，HR 有自己的 pattern）

### Phase 4: 统一 Pagination
- [ ] 全局 Pagination 组件
- [ ] 所有页面改用全局版本
