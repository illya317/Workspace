# 可复用组件与页面模板规范

这份文档是给后续 agent 的组件地图。Workspace 正在按 `Core -> Platform -> Apps` 拆分，后续开发默认先查这里，确认已有组件和模板不能满足时，才允许新增。

## 总原则

- Core 负责通用交互契约：下拉、筛选、搜索、日期、确认弹窗、表格、字段展示、tag 输入。
- Platform 负责登录后平台壳：导航、模块首页、Portal、用户菜单、审计日志、资源注册聚合。
- Apps 只写业务语义：HR、Finance、Production 只负责把业务字段、选项、校验、DTO 接到 Core/Platform 组件上。
- 字段展示和选择方式必须解耦。字段本体看起来应该一致；选择面板可以是普通下拉、分级选择、FK 搜索、tag 选择，但不能让字段展示形态跟着变。
- 搜索类选择默认支持中文、拼音全拼和拼音首字母。禁止业务组件各自写一套搜索算法。
- 旧 `app/components/SearchBox` / `app/hooks/useSearch` 已废弃并由 `arch:gate` 禁止复活；通用关键词筛选用 Core `FilterToolbar`，业务 FK/实体选择用对应业务包组件。
- 搜索型原生 input 的历史债为 0：除 `packages/core/ui/SearchInput.tsx` 内部实现外，`app/` 和 `packages/` 不得出现 `type="search"` 或 `placeholder/aria-label` 带搜索语义的原生 `<input>`。新增会被 `npm run arch:gate` 的 `nativeSearchInputFiles` ratchet 拦住。
- Core UI 可用入口以 `packages/core/ui/component-registry.ts` 为准。业务包、Platform 页面和 app 壳不得引用未注册 Core UI 名字，也不得在 `packages/*/ui` 新增手写页面卡片/筛选/分栏/表格壳；新增同类结构会被 `npm run arch:gate` 的 Level 2 ratchet 拦住。
- 页面模板采用 `A Core 源头层 -> B 薄壳 ViewModel -> C 渲染`：A 是 Core 中的一组可组合模板部件，可以拆成 A1/A2/A3/A4，分别承载类型、布局、默认动作、弹窗和状态机；B 只把业务事实映射成 Core 的 ViewModel 类型，传入真实回调和状态；C 只负责 `<CoreTemplate {...viewModel} />` 渲染。

## Core 组件

| 能力 | 统一入口 | 适用场景 | 禁止做法 |
|---|---|---|---|
| 单选下拉 | `@workspace/core/ui` 的 `SelectField` | 状态、阶段、优先级、年月、固定枚举 | 业务包或页面手写原生 `<select>` |
| 常用项 + 更多选择 | `@workspace/core/ui` 的 `OptionPicker` | 民族、固定选项、候选较多但可先展示常用项的字段 | 每个业务包复制按钮组 + 更多弹层 |
| 分级/自定义选择弹层 | `@workspace/core/ui` 的 `PickerShell` | 专业、职称、职级等需要业务自定义面板的字段 | 每个业务组件重复手写触发按钮、外部点击关闭和 Escape 关闭 |
| 二段式筛选 | `@workspace/core/ui` 的 `FieldValueFilter` | 工具栏显示 `字段：值`，点击后先选字段再选值 | 每个模块复制一份筛选 UI，或把两个下拉框常驻拼在工具栏上 |
| 筛选栏 | `@workspace/core/ui` 的 `FilterBar` | 列表页搜索、筛选、重置、批量工具 | 页面里散落按钮和输入框 |
| 标准筛选工具栏 | `@workspace/core/ui` 的 `FilterToolbar` | 搜索、字段显隐、每页数量、筛选插槽组合 | 每个模块重写搜索框 + 字段按钮 + 每页下拉 |
| 搜索输入 | `@workspace/core/ui` 的 `SearchInput` | 内容检索、列表主搜索、筛选栏搜索、弹层内搜索 | 页面或业务包手写 `<input placeholder="搜索...">` |
| FK 字段输入 | `@workspace/core/ui` 的 `FkFieldInput` 或基于它的领域薄包装 | 选择部门、员工、计划、科目等关联实体 | 把 FK 搜索做成自由 `entity: string` 一次性控件 |
| 日期输入 | `@workspace/core/ui` 的 `CalendarDateInput` | 所有日期字段 | 原生 `input[type=date]` 或浏览器默认日期弹层 |
| 确认弹窗 | `@workspace/core/ui` 的 `ConfirmProvider` / `ConfirmModal` | 删除、覆盖、危险操作 | `window.confirm`、自定义一次性确认弹窗 |
| Toast | `@workspace/core/ui` + `@workspace/core/hooks` | 保存成功、失败、校验提示 | 页面内裸 `setTimeout` 或临时提示块 |
| 表格 | `@workspace/core/ui` 的 `DataTable` | 标准列表、批量表格、可见列管理 | 每个模块重新写表头/分页/空态 |
| 列显隐 | `@workspace/core/ui` 的 `ColumnToggle` | 表格列配置 | 模块自写列配置弹层 |
| 数字/金额单元格 | `@workspace/core/ui` 的 `NumberCell` / `AmountCell` | 财务、预算、成本、数量字段 | 每张表重复写格式化 |
| Tab | `@workspace/core/ui` 的 `TabBar` | 模块内平级页签 | 页面内临时拼 tab |
| 页面骨架 | `@workspace/core/ui` 的 `PageShell` | 登录后页面的标题栏、返回动作、页面内容容器 | Platform/App 里重复手写 sticky header、返回按钮、横向表头 |
| 页面内容容器 | `@workspace/core/ui` 的 `PageContent`、`PanelCard`、`SectionCard` | 页面内容留白、卡片、章节、空态 | 在业务包里直接拼 `bg-white + rounded + shadow/border` 页面壳 |
| 可折叠左右分栏 | Core UI 新增稳定入口后统一使用 | 列表 + 详情编辑、项目列表 + 当前详情、主从记录浏览 | 用遮罩式整屏 overlay 灰掉主内容，或在业务包重复写抽屉/分栏状态机 |

## 业务字段组件

业务字段组件可以存在，但必须建立在 Core 组件之上。

| 字段类型 | 归属建议 | 规则 |
|---|---|---|
| FK 搜索 | Core 抽象 + App 传入数据源；当前 HR 样板在 `@workspace/hr/ui` | 必须使用统一输入框和候选浮层；候选搜索支持拼音；选中后字段展示只显示业务展示名 |
| 两段式筛选值 | Core `FieldValueFilter`，按值类型复用 `SearchInput` / `SelectField` / `OptionPicker` / `FkFieldInput` / `CalendarDateInput` | 第一段选择查询字段；第二段按查询 contract 选择值。应用后工具栏只显示 `字段：值`。普通模糊搜索输出 `queryParam + value`，FK 搜索输出明确实体引用，布尔/固定枚举走标准下拉 | 从表字段自动推导筛选参数、为本地枚举值再写一次性搜索框，或把普通字段值做成字段选择同款下拉 |
| tag 输入 | Core 抽象 + App 传入选项和校验 | 别名、参与人、下属岗位等都用 tag 形态；删除用统一 `x`，需要确认的删除走 Confirm |
| 分级选择 | App 负责业务层级，字段外观仍用 Core | 专业、职称、部门编码等可以先选大类再选细类，但字段展示只显示最终值 |
| 只读字段 | Core 字段样式 | 只读必须真正 `readOnly/disabled`，不能只是灰色；不要出现可编辑但看起来只读的字段 |

关键约束：选择面板可以复杂，字段展示必须统一。比如“专业”可以用“门类 -> 专业类”选择，但保存后字段只显示 `药学类`，不能在不同页面显示成按钮组、卡片组或两格输入。

高级筛选必须基于显式查询 contract，而不是复用编辑字段配置自动生成。每个筛选项都要声明后端实际支持的 `queryParam` 和值类型；例如“姓名”是 `keyword contains 张`，可以直接应用并返回一组员工；“员工 FK”才是从候选里选定一个员工实体。没有后端 query contract 的字段不能出现在高级筛选里。

## Platform 模板

| 模板 | 统一入口 | 用途 |
|---|---|---|
| 登录后页面壳 | `@workspace/platform/ui` 的 `AppShell` | 所有登录后页面；内部必须复用 Core `PageShell` |
| 模块首页 | `@workspace/platform/ui` 的 `ModuleHome` | L1 模块入口页 |
| Portal | `@workspace/platform/ui` 的 `PortalClient` | Workspace 首页入口卡片 |
| 审计历史 | `@workspace/platform/ui` 的 AuditLog 组件 | 通用编辑历史展示 |

Platform 可以聚合模块注册和导航，但不能写 HR、Finance、Production 的业务字段逻辑，也不能重复实现 Core 已有的页面表头/返回栏结构。

## 页面模板与薄壳 ViewModel

当页面有可复用模板时，优先建立 Core 源头层和稳定 ViewModel 类型，而不是在业务包里复制页面结构。这里的 A 不是单个大文件，而是可以由多个 Core 内部部件组成。

```txt
A Core 源头层：A1 类型契约 + A2 布局 + A3 行级动作承载区 + A4 通用状态机
B 薄壳 ViewModel：业务数据 -> Core props/sections/rows/actions
C 渲染：<CoreTemplate {...viewModel} />
```

执行规则：

- Core 源头层负责左右布局、toolbar、搜索、折叠、分页和行级动作承载区等可跨业务复用的体验；这些能力可以拆成多个 Core 文件/组件，但仍同属 A。反馈/预览这类强业务弹窗留在业务包，Core 只承载按钮位置。
- Core 应导出稳定 ViewModel 类型，例如 `TemplateWorkbenchViewModel`；业务 adapter/model 函数必须返回这个类型。
- 业务 B 建议放在 `packages/<domain>/ui/**/<feature>-view-model.ts` 或 `adapter.ts`，只做数据映射、状态标记和真实 callback，不直接渲染 `PanelCard`、`SelectorCard`、`CommandToolbar`、`SearchInput`、`ActionButton`、`DetailModal` 等 Core primitive。
- 业务组件只组合 `const viewModel = createXxxViewModel(...)` 与 `<CoreTemplate {...viewModel} />`，再挂必须的业务 modal 或 service 状态。
- 不要为了页面样式预览再维护一套 B2，也不要在 showcase 里重写 toolbar、折叠、反馈、预览按钮或弹窗。没有共用真实 B 时，宁可不做该模板预览，避免预览和业务长期漂移。
- 如果用户看着业务页或样式预览说“这里样式/默认交互不对”，agent 首先判断能否改 A 的对应子件。只有字段文案、业务状态、权限、真实回调或数据筛选属于 B；通用视觉和交互改动不应补在 B 里。

当前示例：Production QC 检验模板使用 Core `TemplateWorkbenchFrame`；业务薄壳是 `packages/production/ui/qc/template-workbench/qc-template-workbench-view-model.ts`，真实页面只渲染 `TemplateWorkbenchFrame` 并挂 QC 预览/反馈 modal。

## Work 体验统一方向

Work 是业务包，不是 Platform。项目、工作清单、工作汇报、历史记录统一归 `packages/work` 和 `/work` 路由壳；不要把 Project / EmployeeProject 修回 HR，也不要新增 `packages/project`。

当前 `/work/projects` 的项目列表展开目标是左右分栏：左侧保留项目列表，右侧继续展示当前详情编辑区。列表展开不应遮罩整页、不应灰掉主内容，也不要做成覆盖详情区的临时 drawer。若这个交互需要通用布局，应先在 Core UI 增加可复用分栏组件，再让 Work 传入业务列表、详情和状态；Work 包只承接项目字段、DTO、服务和业务规则。

Work Project 的可见、可写、可管理和可删除是对象级业务规则，入口在 `packages/work/server/access.ts`。Core/Platform 只能提供模块导航、页面壳、权限 wrapper 和通用 FK 基建，不承载“谁能看哪个项目”的判断；`work.project.access/write/delete` 也不能在 UI 中被解释成项目全量可见或全量管理。

## Finance 复用方向

Finance 当前已经有第一层统一模板，但业务页面还在渐进迁移：

- 已经下沉到 `packages/finance/ui`：`Pagination`、`AccountCodeInput`、`ReclassConfigRow`、`ReclassConfigView`、`reclassColumns` 等重分类相关组件。
- 已经下沉到 `packages/finance/ui`：`FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`、`Pagination`、重分类配置/审核组件。旧 `app/finance/components` 兼容目录已删除。
- `FinanceFilters` 基于 Core `FilterToolbar` / `SelectField`，不允许财务页面再手写公司/年度/月度/层级筛选组合。
- 预算、成本、导入、报表配置、部分总账页面仍可能存在旧目录下的页面结构债务；新增和重构必须改用 Core/Finance 组件。

后续 agent 改 Finance 时按以下方向收口：

- 财务模块页面统一使用一个 Finance 页面模板：标题区、公司/期间筛选区、工具栏、内容区、空态、错误态。
- `FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`、`Pagination`、重分类配置/审核组件已进入 `@workspace/finance/ui`，后续只允许扩展这个入口，不要恢复 `app/finance/components`。
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

这些规则已经由 `npm run arch:gate` 中的 AST 和 package boundary 检查执行，新增包内代码必须通过：

- `packages/*` 禁止出现原生 `<select>`；只能使用 Core `SelectField` 或基于 Core 的 App 字段组件。
- `app/*` 和 `packages/*` 禁止新增搜索型原生 `<input>`；内容检索用 `SearchInput`，FK 用 `FkFieldInput` 或领域薄包装，下拉内检索用 `SelectField` / `OptionPicker`。
- `packages/*` 禁止 `window.confirm`。
- `packages/*` 禁止原生 `input[type=date]`，统一用 `CalendarDateInput`。
- 选择/搜索类组件必须使用 `@workspace/core/search` 的 `matchText` 或由服务端提供同等拼音匹配。
- Core 禁止依赖 Platform、业务包、Prisma、权限和业务事实。
- 业务包之间禁止直接互相 import。

如果确实需要例外，必须先写进本文件的“例外”段落，说明原因、影响范围和迁移计划；不能直接绕过。
