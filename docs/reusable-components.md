# 可复用组件与页面模板规范

这份文档是给后续 agent 的组件地图。Workspace 正在按 `Core -> Platform -> Apps` 拆分，后续开发默认先查这里，确认已有组件和模板不能满足时，才允许新增。

## 总原则

- Core 负责通用交互契约：下拉、筛选、搜索、日期、确认弹窗、表格、字段展示、tag 输入。
- Platform 负责登录后平台壳：导航、模块首页、Portal、用户菜单、审计日志、资源注册聚合。
- Apps 只写业务语义：HR、Finance、Production 只负责把业务字段、选项、校验、DTO 接到 Core/Platform 组件上。
- 字段展示和选择方式必须解耦。字段本体看起来应该一致；选择面板可以是普通下拉、分级选择、FK 搜索、tag 选择，但不能让字段展示形态跟着变。
- 搜索类选择默认支持中文、拼音全拼和拼音首字母。禁止业务组件各自写一套搜索算法。
- 旧 `app/components/SearchBox` / `app/hooks/useSearch` 已废弃并由 `arch:check` 禁止复活；通用关键词筛选用 Core `FilterToolbar`，业务 FK/实体选择用对应业务包组件。

## Core 组件

| 能力 | 统一入口 | 适用场景 | 禁止做法 |
|---|---|---|---|
| 单选下拉 | `@workspace/core/ui` 的 `SelectField` | 状态、阶段、优先级、年月、固定枚举 | 业务包或页面手写原生 `<select>` |
| 二段式筛选 | `@workspace/core/ui` 的 `FilterField` | 字段 + 值组合筛选 | 每个模块复制一份筛选 UI |
| 筛选栏 | `@workspace/core/ui` 的 `FilterBar` | 列表页搜索、筛选、重置、批量工具 | 页面里散落按钮和输入框 |
| 标准筛选工具栏 | `@workspace/core/ui` 的 `FilterToolbar` | 搜索、字段显隐、每页数量、筛选插槽组合 | 每个模块重写搜索框 + 字段按钮 + 每页下拉 |
| 日期输入 | `@workspace/core/ui` 的 `CalendarDateInput` | 所有日期字段 | 原生 `input[type=date]` 或浏览器默认日期弹层 |
| 确认弹窗 | `@workspace/core/ui` 的 `ConfirmProvider` / `ConfirmModal` | 删除、覆盖、危险操作 | `window.confirm`、自定义一次性确认弹窗 |
| Toast | `@workspace/core/ui` + `@workspace/core/hooks` | 保存成功、失败、校验提示 | 页面内裸 `setTimeout` 或临时提示块 |
| 表格 | `@workspace/core/ui` 的 `DataTable` | 标准列表、批量表格、可见列管理 | 每个模块重新写表头/分页/空态 |
| 列显隐 | `@workspace/core/ui` 的 `ColumnToggle` | 表格列配置 | 模块自写列配置弹层 |
| 数字/金额单元格 | `@workspace/core/ui` 的 `NumberCell` / `AmountCell` | 财务、预算、成本、数量字段 | 每张表重复写格式化 |
| Tab | `@workspace/core/ui` 的 `TabBar` | 模块内平级页签 | 页面内临时拼 tab |
| 页面骨架 | `@workspace/core/ui` 的 `PageShell` | 登录后页面的标题栏、返回动作、页面内容容器 | Platform/App 里重复手写 sticky header、返回按钮、横向表头 |

## 业务字段组件

业务字段组件可以存在，但必须建立在 Core 组件之上。

| 字段类型 | 归属建议 | 规则 |
|---|---|---|
| FK 搜索 | Core 抽象 + App 传入数据源；当前 HR 样板在 `@workspace/hr/ui` | 必须使用统一输入框和候选浮层；候选搜索支持拼音；选中后字段展示只显示业务展示名 |
| tag 输入 | Core 抽象 + App 传入选项和校验 | 别名、参与人、下属岗位等都用 tag 形态；删除用统一 `x`，需要确认的删除走 Confirm |
| 分级选择 | App 负责业务层级，字段外观仍用 Core | 专业、职称、部门编码等可以先选大类再选细类，但字段展示只显示最终值 |
| 只读字段 | Core 字段样式 | 只读必须真正 `readOnly/disabled`，不能只是灰色；不要出现可编辑但看起来只读的字段 |

关键约束：选择面板可以复杂，字段展示必须统一。比如“专业”可以用“门类 -> 专业类”选择，但保存后字段只显示 `药学类`，不能在不同页面显示成按钮组、卡片组或两格输入。

## Platform 模板

| 模板 | 统一入口 | 用途 |
|---|---|---|
| 登录后页面壳 | `@workspace/platform/ui` 的 `AppShell` | 所有登录后页面；内部必须复用 Core `PageShell` |
| 模块首页 | `@workspace/platform/ui` 的 `ModuleHome` | L1 模块入口页 |
| Portal | `@workspace/platform/ui` 的 `PortalClient` | Workspace 首页入口卡片 |
| 审计历史 | `@workspace/platform/ui` 的 AuditLog 组件 | 通用编辑历史展示 |

Platform 可以聚合模块注册和导航，但不能写 HR、Finance、Production 的业务字段逻辑，也不能重复实现 Core 已有的页面表头/返回栏结构。

## Finance 复用方向

Finance 当前已经有第一层统一模板，但业务页面还在渐进迁移：

- 已经下沉到 `packages/finance/ui`：`Pagination`、`AccountCodeInput`、`ReclassConfigRow`、`ReclassConfigView`、`reclassColumns` 等重分类相关组件。
- 已经下沉到 `packages/finance/ui`：`FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`。旧 `app/finance/components` 文件只作为兼容 re-export。
- `FinanceFilters` 基于 Core `FilterToolbar` / `SelectField`，不允许财务页面再手写公司/年度/月度/层级筛选组合。
- 预算、成本、导入、报表配置、部分总账页面仍可能存在旧目录下的页面结构债务；新增和重构必须改用 Core/Finance 组件。

后续 agent 改 Finance 时按以下方向收口：

- 财务模块页面统一使用一个 Finance 页面模板：标题区、公司/期间筛选区、工具栏、内容区、空态、错误态。
- `FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`、`Pagination`、重分类配置组件已进入 `@workspace/finance/ui`，后续只允许扩展这个入口，不要在 `app/finance/components` 写新实现。
- 财务表格默认复用 Core `DataTable`、`NumberCell`、`AmountCell`、`ColumnToggle`。
- 公司、年度、月份、报表类型、层级等固定筛选默认复用 Core `SelectField`；需要财务语义时由 `@workspace/finance/ui` 包一层，不要在每个页面手写。
- 预算、成本、总账、报表配置、报表校对之间如果 UI 结构一致，应抽成 Finance 模板，而不是在每个页面重新写筛选栏、分页、表格工具栏。

## Agent 开发流程

1. 先查本文件和 `docs/module-boundaries.md`，判断已有 Core/Platform/App 组件是否可复用。
2. 若只是业务字段选项不同，复用现有组件，传入 options、DTO、校验和保存 handler。
3. 若交互模式通用但组件缺失，先新增到 Core，再让业务包引用。
4. 若模板只属于某个业务域，例如 Finance 页面模板，新增到对应 `packages/<domain>/ui`。
5. 不允许为了赶进度在页面里写一次性下拉、一次性搜索、一次性确认框、一次性表格。

## 硬约束

这些规则已经由 `npm run arch:check` 中的 package boundary 检查执行，新增包内代码必须通过：

- `packages/*` 禁止出现原生 `<select>`；只能使用 Core `SelectField` 或基于 Core 的 App 字段组件。
- `packages/*` 禁止 `window.confirm`。
- `packages/*` 禁止原生 `input[type=date]`，统一用 `CalendarDateInput`。
- 选择/搜索类组件必须使用 `@workspace/core/search` 的 `matchText` 或由服务端提供同等拼音匹配。
- Core 禁止依赖 Platform、业务包、Prisma、权限和业务事实。
- 业务包之间禁止直接互相 import。

如果确实需要例外，必须先写进本文件的“例外”段落，说明原因、影响范围和迁移计划；不能直接绕过。
