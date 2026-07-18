# Core Toolbar 规范

这份文档专门给 agent 说明 Workspace 的 Toolbar 架构。改页面工具栏前先读这里，再读 `docs/engineering/core-ui-governance.md`。

## 1. 架构边界

Toolbar 是 Core Page API，不是业务页自由拼装区。

```txt
业务页面
  -> PageSurface.toolbar.items: ToolbarItem[]
    -> Core Toolbar
      -> SearchInput / FieldValueFilter / SearchableOptionInput / ToolbarOptionGroup / ActionButton / DropdownSurface
```

业务只能传语义化 `ToolbarItem`，不能传 JSX slot，也不能新增业务包 Toolbar。

禁止：

- `kind: "custom"`，Toolbar 类型系统不再支持。
- 页面里手写整条 `div.flex ...` toolbar。
- 业务侧手排动作按钮顺序、分区、分组、分隔线。
- 业务侧直接引第三方 icon 或自绘 toolbar action icon。
- 为了某个页面新增一次性 Toolbar/FilterBar/SearchBar。

允许：

- 领域薄 adapter，但它只能把业务 props 映射为 `PageSurface.toolbar.items`，不能自行渲染 toolbar。

## 2. 标准 Item

Toolbar 只能用标准 item 表达常见能力：

| 能力 | item |
|---|---|
| 新建 | `create` |
| 主搜索 | `search` |
| 普通下拉 | `select` |
| 二段式分组下拉 | `grouped-select` |
| 筛选区短标题 | `label` |
| 紧凑分组筛选 | `option-group` |
| 二段式字段筛选 | `field-filter` |
| 列显隐 | `column-toggle` |
| 条/页 | `page-size` |
| 文本元信息 | `text` |
| 下拉菜单 | `menu` |
| 单个动作图标 | `icon-button` |
| 多个动作图标 | `action-group` |
| 编辑/保存/取消/下载/历史 | `edit-group` |
| 日期/期间 | `period` |

如果这些 item 不够表达需求，正确做法是扩展 Core `Toolbar` Page API，并同步 registry 和文档；不要绕回 JSX。

## 3. 分区顺序

Toolbar 由 Core 自动分区，业务不要手排布局。

```txt
primary -> search -> filter -> edit/action -> meta/view
```

固定映射：

- `create` 自动进入 `primary`。
- `search` 自动进入搜索区。
- `select`、`grouped-select`、`label`、`option-group`、`field-filter`、`period` 自动进入筛选区。
- `icon-button`、`action-group`、`edit-group` 自动进入动作区。
- `text`、`menu`、`column-toggle`、`page-size` 自动进入右侧 meta/view 区。
- 列显隐只允许使用 `column-toggle`，不得用 `select`、`menu`、`option-group` 或业务自绘控件代替；结构 gate 会阻断其他声明方式。
- `column-toggle` 与 `page-size` 的触发器固定宽度为 120px；下拉面板仍按内容和视口自适应。
- `menu` 只接受 typed trigger/items，适合账号菜单、更多操作菜单；不能传 `ReactNode`、`ComponentType` 或 render callback。
- 业务声明不得传 `section` 或等价排序字段；需要改变分区时先扩展 Core `Toolbar` 语义，而不是在页面里指定位置。
- `add` 是创建语义，不能通过 `icon-button` 或 `action-group` 渲染；创建入口只能用 `kind: "create"`。

## 4. ActionGlyph

Toolbar 动作按钮只能来自 Core `ActionGlyph` 封闭集合。

- `icon-button.icon` 必须是 `ActionGlyphKind`；`action-group.actions[].kind` 可以是 `ActionGlyphKind` 或不与图标名重名的非创建类 `ACTION_GLYPH_ACTIONS` 语义 key。
- 常见动作语义使用 `ACTION_GLYPH_ACTIONS` 映射到默认图标、文案、variant 和 section；新增 icon 后若要作为业务动作使用，必须同步补动作语义，而不是只补 SVG。
- 业务只选 icon 和 callback，不手排顺序。
- 非 Toolbar 的 icon-only cell/action 也必须复用 `ActionGlyph`；新增图标先进入封闭集合，不在业务/平台文件里手写 `<svg>`。
- `action-group` / `edit-group` 会按 `ACTION_GLYPH_ORDER` 自动排序，并在大组变化处插入分隔。
- 新增 icon 必须同步：
  - `ACTION_GLYPH_KINDS`
  - `ACTION_GLYPH_GROUPS`
  - `ACTION_GLYPH_TOOLBAR_GROUPS`
  - `ACTION_GLYPH_ORDER`

## 5. 短筛选平铺与 Micro 手风琴

Toolbar 内的 `option-group` 由 Core 自动选择展示方式：

- 只有 2-3 个选项、且每项都是短文本时，默认常驻平铺为 `segmented`，例如 `项目筛选 / 普通 / 重点`。
- 选项更多、文本更长、或 label 不是纯短文本时，默认使用 Toolbar 专用 micro accordion。
- 业务确有特殊需要时可以显式设置 `presentation: "segmented"` 或 `presentation: "accordion"`，但不要为了单页视觉手写 toolbar。

Micro accordion 交互规则：

- 默认折叠。
- 第一项视为默认/全部。
- 默认值时，母按钮显示 `ariaLabel`，也就是字段名，例如 `开放层`、`改造状态`。
- 选中具体值后，母按钮显示具体值名，例如 `页面框架`、`待改造`。
- 点母按钮会选回默认/全部，并展开或收起。
- 展开后右侧显示子选项；点子选项后自动收起。
- 展开和折叠时控件高度必须保持一致，不能发生上下位移。
- micro accordion 选中态使用白底绿字，避免数字/弱文本在绿底上看不清。

普通 `ToolbarOptionGroup` 独立使用时默认仍是 `segmented`；Toolbar 内部通过 `ToolbarItem kind="option-group"` 自动在短筛选平铺和 micro accordion 之间选择。

## 6. TabBar 与 Toolbar 的边界

Toolbar 承载工具、筛选、动作和元信息；TabBar 承载页面内平级视图切换。两者语义不同，不能因为视觉上都像一排按钮就混用。

使用规则：

- 当前页面内部的平级视图切换必须用 Core `TabBar`。`任务列表 / 工作汇报 / 权限设置`、`员工资料 / 组织架构 / 部门岗位` 这类如果是同一个 L2 内的视图，可以用 `TabBar`；如果它们是 L1/L2 模块入口，则必须留在 route/module 层或模块入口卡片，不能塞进 `TabBar`。
- `状态 / 层级 / 分类 / 来源 / 周期` 这种筛选条件，才放进 Toolbar，优先用 `option-group`；短筛选自动平铺，长筛选自动收进 micro accordion。
- 如果 tab 切换放在 toolbar 里，会被误判为筛选；如果筛选长期铺成 TabBar，会把页面导航和过滤状态混在一起。
- Toolbar 里的 `option-group presentation="segmented"` 只留给少数明确仍是工具栏筛选、且需要常驻展开的场景；它不是页面 tab 的替代品。

## 7. PageSurface 入口

页面骨架不能接任意 toolbar JSX。

已收口入口：

- `PageSurface.toolbar.items?: ToolbarItem[]`
- 页面级搜索、筛选、刷新、导出和分页必须上移到 `PageSurface.toolbar` / `PageSurface.footer.pagination`。标准新建用 `CreateSurface trigger="toolbar"` 派生唯一 Toolbar `+`；`presentation="inline"` 时新建行固定在 Page Toolbar 正下方，block/modal 则仍在声明位置或弹窗呈现。局部 section `+` 通过 `BodySurfaceSectionHeaderSpec.create` 声明，其 block 由 Core 固定在该 header 正下方、section body 正上方，不允许业务自配 anchor。业务侧显式 toolbar `kind: "create"` 已禁止，由 `arch:create-surface-entry` 阻断。
- 一个 PageSurface 只能渲染一条 page toolbar。BodySurface split 的侧栏开关只提供状态与回调，由 PageSurface integration 合并进该 toolbar；Body/Data/Form/Create 等正文 Surface 禁止 import 或渲染 `<Toolbar>`。`surfaceOwnsPageChrome` gate 同时检查类型 contract 与 Surface runtime JSX。
- 根表单的保存、提交、取消、归档/取消归档、批准、拒绝等生命周期动作必须声明在 `FormSurface.actions`，由 FormSurface 固定渲染在表单顶部动作栏；包含表单的父 Section、Page toolbar 和 DataSurface 不得代管这些动作。
- `FormSurfaceActionSpec` 只允许业务声明 `key / action / label / disabled / onClick`。业务不得声明 `icon / variant / size / presentation / section / order / commandPlacement`；Core 按 `ACTION_GLYPH_ACTIONS` 选择图标和样式，并按 `ACTION_GLYPH_ORDER` 排序。
- `archive` 使用归档图标，`unarchive` 使用恢复图标。调用方只声明动作语义，不自行把“取消归档”映射为图标。
- `FormSurface.commands` 和 `commandPlacement` 只属于 `kind: "filters"` 的筛选命令；字段表单、详情表单和登录表单不得用 command 表达生命周期动作。嵌套 `section` 的局部 action 也不能绕过根表单动作栏。
- `DataSurface.actions` 继续表达数据正文局部动作，不承载表单提交语义。
- 正文里的 `BodySurfaceCommandSpec` / `FormSurfaceCommandSpec` / `DataSurfaceCommandSpec` 只能继续作为 Surface spec 传递，不能塞进自定义 React 组件后自己 `map(actions)` 渲染 `<button>`。
禁止恢复：

```tsx
<DatabasePageFrame toolbar={<div>...</div>} />
<AnalysisBlock toolbar={<div>...</div>} />
```

## 8. 移动端自适应

- 桌面端继续按 `primary -> search -> filter -> edit/action -> meta/view` 自动分区；移动端不把这些分区简单换行成长条。
- 移动端搜索独占一行；创建和最高优先级动作保留在命令坞，筛选进入“筛选条件”底部面板，其余动作与列显隐、条/页等进入“更多操作”。
- 业务仍只声明原有 typed item，不声明移动端位置、优先级或折叠方式；Core 根据 item 语义和 ActionGlyph 顺序自动决定。
- `PageSurface.tabbar` 在移动端 2-3 项时使用紧凑分段切换；超过 3 项或存在 children 时改为“当前栏目 + 切换栏目”底部面板，避免长 Tab 条横向挤压。
- 甘特等二维可视化不进入 Toolbar/TabBar；由对应 VisualizationSurface 提供横屏专注入口。

## 9. Review 清单

Review agent 必查：

- 是否出现 `kind: "custom"`。
- 是否出现业务包新增 `*Toolbar.tsx`，且不是薄 adapter。
- 是否出现页面手写 `div.flex` 作为页面级 toolbar。
- 是否绕过 `ActionGlyph` 使用第三方 icon、自绘 SVG 或文字按钮做 toolbar action。
- 是否在 Page Frame / AnalysisBlock 里恢复 `toolbar?: ReactNode`。
- 是否让页面新建入口同时拼接保存、提交、取消，或让父 Section 代管嵌套表单生命周期动作。
- 是否在 `FormSurface.actions` 里声明 icon、variant、size、位置或排序，而不是只声明 action 语义。
- 是否把字段/详情表单的生命周期动作塞回 `commands` 或嵌套 section actions。
- 是否把 `option-group` 手写成常驻长条，导致 toolbar 横向过长。
- 是否把页面内部 tab 切换塞进 Toolbar；当前页面内部主视图切换必须用 `TabBar`，但 L1/L2 模块列表不能用 `TabBar` 承载。
- 是否新增 Core Toolbar item 后同步 registry 和本文档。

## 10. 审计命令

```bash
rg 'kind:\s*"custom"' packages app -n
rg 'toolbar=\{' packages app -g '*.tsx' -n
rg 'toolbar\?: ReactNode' packages/core packages/*/ui -n
rg 'content:\s*ReactNode|expandedRowContent|cell:\s*\(.*\).*ReactNode|renderItem|renderOption' packages/core/ui -n
rg --files packages | rg '/ui/.*Toolbar\.tsx$'
node --import tsx scripts/arch/form-surface-actions.ts
npm run gate:ui
```
