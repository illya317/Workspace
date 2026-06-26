# Core Toolbar 规范

这份文档专门给 agent 说明 Workspace 的 Toolbar 架构。改页面工具栏前先读这里，再读 `docs/core-ui-governance.md`。

## 1. 架构边界

Toolbar 是 Core Page API，不是业务页自由拼装区。

```txt
业务页面 / Page Frame / AnalysisBlock
  -> toolbarItems: ToolbarItem[]
    -> Core Toolbar
      -> SearchInput / FieldValueFilter / SelectField / ToolbarOptionGroup / ActionButton
```

业务只能传语义化 `ToolbarItem`，不能传 JSX slot，也不能新增业务包 Toolbar。

禁止：

- `kind: "custom"`，Toolbar 类型系统不再支持。
- 页面里手写整条 `div.flex ...` toolbar。
- 业务侧手排动作按钮顺序、分组、分隔线。
- 业务侧直接引第三方 icon 或自绘 toolbar action icon。
- 为了某个页面新增一次性 Toolbar/FilterBar/SearchBar。

允许：

- 领域薄 adapter，例如 `HRToolbar`，但它只能把业务 props 映射为 Core `ToolbarItem[]`，最终必须渲染 Core `Toolbar`。
- 页面把已有 Core `Toolbar` 子组件放在内容区开头，但 Page Frame 的工具栏入口只能是 `toolbarItems`。

## 2. 标准 Item

Toolbar 只能用标准 item 表达常见能力：

| 能力 | item |
|---|---|
| 新建 | `create` |
| 主搜索 | `search` |
| 普通下拉 | `select` |
| 紧凑分组筛选 | `option-group` |
| 二段式字段筛选 | `field-filter` |
| 列显隐 | `column-toggle` |
| 条/页 | `page-size` |
| 文本元信息 | `text` |
| 单个动作图标 | `icon-button` |
| 多个动作图标 | `action-group` |
| 编辑/保存/取消/下载/历史 | `edit-group` |
| 日期/期间 | `period` |

如果这些 item 不够表达需求，正确做法是扩展 Core `Toolbar` Page API，并同步 registry、preview 和文档；不要绕回 JSX。

## 3. 分区顺序

Toolbar 由 Core 自动分区，业务不要手排布局。

```txt
primary -> search -> filter -> edit/action -> meta/view
```

常见约定：

- `create` 放 `primary`。
- `search` 放搜索区。
- `select`、`option-group`、`field-filter`、`period` 放筛选区。
- `icon-button`、`action-group`、`edit-group` 放动作区。
- `text`、`column-toggle`、`page-size` 放右侧 meta/view 区。

## 4. ActionGlyph

Toolbar 动作按钮只能来自 Core `ActionGlyph` 封闭集合。

- `icon-button.icon` 和 `action-group.actions[].kind` 必须是 `ActionGlyphKind`。
- 业务只选 icon 和 callback，不手排顺序。
- `action-group` / `edit-group` 会按 `ACTION_GLYPH_ORDER` 自动排序，并在大组变化处插入分隔。
- 新增 icon 必须同步：
  - `ACTION_GLYPH_KINDS`
  - `ACTION_GLYPH_GROUPS`
  - `ACTION_GLYPH_TOOLBAR_GROUPS`
  - `ACTION_GLYPH_ORDER`

## 5. Micro 手风琴

Toolbar 内的 `option-group` 默认是 Toolbar 专用 micro accordion，不是普通常驻 segmented。

交互规则：

- 默认折叠。
- 第一项视为默认/全部。
- 默认值时，母按钮显示 `ariaLabel`，也就是字段名，例如 `开放层`、`改造状态`。
- 选中具体值后，母按钮显示具体值名，例如 `页面框架`、`待改造`。
- 点母按钮会选回默认/全部，并展开或收起。
- 展开后右侧显示子选项；点子选项后自动收起。
- 展开和折叠时控件高度必须保持一致，不能发生上下位移。
- micro accordion 选中态使用白底绿字，避免数字/弱文本在绿底上看不清。

普通 `ToolbarOptionGroup` 独立使用时默认仍是 `segmented`；Toolbar 内部通过 `ToolbarItem kind="option-group"` 默认走 accordion。

## 6. TabBar 与 Toolbar 的边界

Toolbar 承载工具、筛选、动作和元信息；TabBar 承载页面内平级视图切换。两者语义不同，不能因为视觉上都像一排按钮就混用。

使用规则：

- `任务列表 / 工作汇报 / 权限设置`、`员工资料 / 组织架构 / 部门岗位` 这种主视图切换，必须用 Core `TabBar`。
- `状态 / 层级 / 分类 / 来源 / 周期` 这种筛选条件，才放进 Toolbar，优先用 `option-group` micro accordion。
- 如果 tab 切换放在 toolbar 里，会被误判为筛选；如果筛选长期铺成 TabBar，会把页面导航和过滤状态混在一起。
- Toolbar 里的 `option-group presentation="segmented"` 只留给少数明确仍是工具栏筛选、且需要常驻展开的场景；它不是页面 tab 的替代品。

## 7. Page Frame 入口

页面骨架不能接任意 toolbar JSX。

已收口入口：

- `DatabasePageFrame.toolbarItems?: ToolbarItem[]`
- `AnalysisBlock.toolbarItems?: ToolbarItem[]`
- `WorkspaceSplitPage.toolbarItems?: ToolbarItem[]`

禁止恢复：

```tsx
<DatabasePageFrame toolbar={<div>...</div>} />
<AnalysisBlock toolbar={<div>...</div>} />
```

## 8. Review 清单

Review agent 必查：

- 是否出现 `kind: "custom"`。
- 是否出现业务包新增 `*Toolbar.tsx`，且不是薄 adapter。
- 是否出现页面手写 `div.flex` 作为页面级 toolbar。
- 是否绕过 `ActionGlyph` 使用第三方 icon、自绘 SVG 或文字按钮做 toolbar action。
- 是否在 Page Frame / AnalysisBlock 里恢复 `toolbar?: ReactNode`。
- 是否把 `option-group` 手写成常驻长条，导致 toolbar 横向过长。
- 是否把页面/模块 tab 切换塞进 Toolbar；主视图切换必须用 `TabBar`。
- 是否新增 Core Toolbar item 后同步 registry、showcase preview 和本文档。

## 9. 审计命令

```bash
rg 'kind:\s*"custom"' packages app -n
rg 'toolbar=\{' packages app -g '*.tsx' -n
rg 'toolbar\?: ReactNode' packages/core packages/*/ui -n
rg --files packages | rg '/ui/.*Toolbar\.tsx$'
```
