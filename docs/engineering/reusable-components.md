# 可复用组件与页面模板规范

这份文档是给后续 agent 的组件地图。Workspace 正在按 `Core -> Platform -> Apps` 拆分，后续开发默认先查这里，确认已有组件和模板不能满足时，才允许新增。

## 总原则

- Core 负责通用交互契约：下拉、筛选、搜索、日期、确认弹窗、表格、字段展示、tag 输入。
- Platform 负责登录后平台壳：导航、模块首页、Portal、用户菜单、审计日志、资源注册聚合。
- Apps 只写业务语义：HR、Finance、Production、Work、Administration、Library 只负责把业务字段、选项、校验、DTO 接到 Core/Platform 组件上。
- 字段展示和选择方式必须解耦。字段本体看起来应该一致；选择面板可以是普通下拉、分级选择、FK 搜索、tag 选择，但不能让字段展示形态跟着变。
- 搜索类选择默认支持中文、拼音全拼和拼音首字母。禁止业务组件各自写一套搜索算法。
- 服务端列表、候选项和高级筛选里的 `keyword` / 模糊文本匹配必须复用 `@workspace/platform/search` 的 `matchAnyField`、`matchSearchFields` 或 `matchText`，保持中文、拼音全拼和首字母规则一致；不要在业务 service 或 UI 里手写 `toLowerCase().includes()` / `.includes(query)` 作为用户搜索，新增会被 `npm run arch:gate` 的 `handwrittenSearchMatches` ratchet 拦住。
- generated / snapshot / export 类页面的二段式筛选字段必须由后端 DTO 明确返回，例如 `preview.filterFields`，UI 只能把后端 contract 映射给 Core `FieldValueFilter`。禁止在 `packages/*/ui/generated` 里本地声明 `FieldValueFilter` 字段；新增会被 `npm run arch:gate` 的 `generatedFilterContractDrift` ratchet 拦住。
- 搜索型原生 input 的历史债为 0：除 `packages/core/ui/SearchInput.tsx` 内部实现外，`app/` 和 `packages/` 不得出现 `type="search"` 或 `placeholder/aria-label` 带搜索语义的原生 `<input>`。新增会被 `npm run arch:gate` 的 `nativeSearchInputFiles` ratchet 拦住。
- Core UI 可用入口以公共 runtime 入口、helper 和 Surface spec 为准。业务包、Platform 页面和 app 壳不得 value import 非公共 runtime renderer，也不得引用未注册 Core UI 名字或在 `packages/*/ui` 新增手写页面卡片/筛选/分栏/表格壳；新增同类结构会被 `gate:ui` / structure ratchet 抓住。
- `PageSurface` 的 `moduleView` 只承认历史债，不作为新增页面接口。存量已迁出，`businessModuleViewUsages` baseline 为 0；需要承载新内容时先补 `PageSurface` 的 form/data/document/visualization/block/navigation/toolbar spec 或记录 Core 缺口后由 Architecture/Core UI 任务扩展。
- 页面模板采用 `A Core 源头层 -> B 薄壳 ViewModel -> C 渲染`：A 是 Core 中的一组可组合模板部件，可以拆成 A1/A2/A3/A4，分别承载类型、布局、默认动作、弹窗和状态机；B 只把业务事实映射成 Core 的 ViewModel 类型，传入真实回调和状态；C 只负责 `<CoreTemplate {...viewModel} />` 渲染。
- URL 只是同页状态的外显时，不能触发 Next 整页导航或 RSC remount。tab、筛选、选中部门/项目/记录、同一工作台内切空间等交互应由客户端状态驱动；需要同步地址栏时用 `window.history.pushState/replaceState`，URL 必须经 `workspacePath` 处理 basePath，并加 `popstate` 让浏览器前进/后退回写状态。`router.push/replace`、`redirect`、`<Link>` 只用于真正进入另一个页面、详情资源或模块。

## Core 组件

| 能力 | 统一入口 | 适用场景 | 禁止做法 |
|---|---|---|---|
| 页面 Surface | `@workspace/core/ui` 的 `PageSurface` | header、navigation、toolbar、body、footer 五段页面协议；列表、详情、分栏、分析、设置页都从这里进入 | 业务页直接拼 PageFrame/PanelCard/SectionCard/Toolbar/TabBar/Pagination 形成新页面壳，或新增 `moduleView` 逃生口 |
| 表单正文 | `PageSurface.body.sections[].body.kind=form` 或局部 `InputControl` | fields、filters、modal、inline、detail、login 表单正文，由 fields spec / InputControl spec 驱动 | 业务页直接 import internal form renderer、重复手写字段网格、筛选条和弹窗表单结构，或把页面级 toolbar 放进 FormSurface |
| 数据正文 | `PageSurface.body.sections[].body.kind=data` | table、structured、records、metrics 数据正文，由 row/column/display spec 驱动 | 业务页直接 import internal data renderer、直接拼表格外壳、记录卡、指标卡和 raw 展示组合，或把页面级 toolbar/pagination 放进 DataSurface |
| 可视化正文 | `PageSurface.body.sections[].body.kind=visualization` | chart、gantt、timeline、tree 等可视化和复杂图形正文 | 把图表塞进 `DataSurface.kind="visual"`，或用 `FormSurface.note` / `moduleView` 承载甘特图 |
| 通用区块 | `PageSurface.body.sections[].body.kind=section` | section、panel、group、message、empty、actions、module grid 等通用正文容器 | 用旧 page block 展开业务协议，或用 `moduleView` 包普通容器 |
| 导航细节 | `PageSurface.navigation` / `SelectorSurface` | 页面声明式导航段、左侧 selector/disclosure/steps；L1/L2 模块入口由 route/module 层或模块入口卡片承载，`TabBar` 只从当前页面内部视图层开始；分页只在 `PageSurface.footer.pagination` | 业务页新增二级导航组件、直接 import `NavigationRenderer` 拼 tab/pagination，把同级 L2 模块塞进 `TabBar`，或临时拼流程链接 |
| 页面反馈 | `@workspace/core/ui` 的 `useFeedback` | 保存成功、失败、校验提示、删除/覆盖确认、未保存离开提示 | 页面直接用 `Toast`、`ConfirmModal`、`useToast`、`useConfirm`、`useConfirmDelete`、`useUnsavedChangesPrompt` |
| 字段/选择/日期能力 | `InputControl` 或 `PageSurface` form block 的 field/filter spec | 状态、阶段、固定枚举、FK、日期、tag、只读字段等 | 业务直接 import `SelectField`、`OptionPicker`、`PickerShell`、`SearchInput`、`FkFieldInput`、`CalendarDateInput` 等 internal renderer |
| 工具栏/动作能力 | `PageSurface.toolbar` / 正文 Surface action spec | 页面级搜索、筛选、列显隐、批量动作、保存/取消/删除/刷新等统一成一个 Toolbar | 业务直接 import `Toolbar` / `ActionButton`、自绘 SVG、自排按钮顺序，或一页出现多个 toolbar |
| 表格/记录/指标能力 | `PageSurface` data block 的 data spec | 标准列表、批量表格、记录卡、指标卡 | 业务直接 import `DataSurface`、`DataTable`、`StructuredTable`、`MetricCard`、`NumberCell`、`AmountCell` 或手搓表格 DOM |
| 导航/选择区能力 | `PageSurface.navigation` / `SelectorSurface` | Tab、左侧 selector、折叠、步骤、禁用步骤链接 | 业务直接 import `NavigationRenderer`、`SelectorPanel`、`TabBar`、`Pagination`、`PanelCard + SelectorList/SelectorTree/SelectorCard`，或手搓流程 nav |
| 页面内容/分栏能力 | `PageSurface` 的 page/split/content spec | 页面内容留白、卡片、章节、空态、左右分栏 | 业务直接 import `PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`WorkspaceSplitPage` |
| 纸面/报告能力 | `PageSurface` 的 `document` block / Core `DocumentSurface` | A4 文档、检验记录纸面、报告预览、多页纸面容器 | 用 `moduleView` 或普通卡片承载纸面文档、重复手写纸面宿主宽度和字体 |

### Toolbar / ActionGlyph 规则

专门规则见 `docs/engineering/core-toolbar.md`；本节只保留摘要。

- Toolbar 的动作按钮必须来自 `ActionGlyph` 封闭集合。`ActionButton` 是纯图标按钮，只接 `kind + label`，不接 children；业务不再新增文字型 toolbar `button` item。
- 非 Toolbar 的 icon-only cell/action 也必须复用 `ActionGlyph`，新增 SVG 先注册到 `ACTION_GLYPH_KINDS` 等元数据，不在业务/平台文件里手写 `<svg>`。
- 新增动作 icon 时必须同时维护四处元数据：`ACTION_GLYPH_KINDS`、`ACTION_GLYPH_GROUPS`、`ACTION_GLYPH_TOOLBAR_GROUPS`、`ACTION_GLYPH_ORDER`。`ACTION_GLYPH_ORDER` 的字段固定为 `icon / group / subgroup / order`，order 使用大间距预留插入空间。
- 业务侧只通过 Surface toolbar/action spec 选择动作语义和 icon，不 runtime import `Toolbar` / `ActionButton`，也不手排顺序和分组。`action-group` 和 `edit-group` 会按 `ACTION_GLYPH_ORDER.order` 自动排序，并在 toolbar 大组变化处插入分隔。
- 非默认动作默认从 `edit` 区开始，和编辑动作混排。`view/search/filter/meta` 只承载视图切换、搜索、筛选、字段、列显隐和计数等默认控件。
- Toolbar 不支持 `custom` item。能表达为 `search`、`select`、`option-group`、`field-filter`、`column-toggle`、`page-size`、`text`、`create`、`action-group`、`edit-group` 的，必须使用标准 item；不够表达时扩展 Core `Toolbar` Page API。
- Toolbar 内的 `option-group` 默认是 Toolbar 专用 micro 手风琴：默认折叠，母按钮显示字段名或当前具体值，展开后点子选项自动收起。
- 当前页面内部视图的平级 tab 切换必须用 `TabBar`，不要塞进 Toolbar；但 L1/L2 模块列表不属于 `TabBar`，应由 route/module 层或模块入口卡片承载。Toolbar 的 `option-group` 表达筛选，不表达主视图切换。
- 列显隐统一用 `column-toggle` 内部的 `SelectField multiple summaryMode="count"`，触发器显示 `已选数/总数`，例如 `2/4`。

## 业务字段组件

业务字段组件可以存在，但必须建立在 Core 组件之上。

| 字段类型 | 归属建议 | 规则 |
|---|---|---|
| FK 搜索 | Core 抽象 + App 传入数据源；当前 HR 样板在 `@workspace/hr/ui` | 必须使用统一输入框和候选浮层；候选搜索支持拼音；选中后字段展示只显示业务展示名 |
| 两段式筛选值 | `PageSurface` filter spec 或 `InputControl`，内部映射 Core 筛选与字段能力 | 第一段选择查询字段；第二段按查询 contract 选择值。应用后工具栏只显示 `字段：值`。普通模糊搜索输出 `queryParam + value`，FK 搜索输出明确实体引用，布尔/固定枚举走标准下拉 | 从表字段自动推导筛选参数、为本地枚举值再写一次性搜索框，或把普通字段值做成字段选择同款下拉 |
| tag 输入 | Core 抽象 + App 传入选项和校验 | 别名、参与人、下属岗位等都用 tag 形态；删除用统一 `x`，需要确认的删除走 Confirm |
| 分级选择 | App 负责业务层级，字段外观仍用 Core | 专业、职称、部门编码等可以先选大类再选细类，但字段展示只显示最终值 |
| 只读字段 | Core 字段样式 | 只读必须真正 `readOnly/disabled`，不能只是灰色；不要出现可编辑但看起来只读的字段 |

关键约束：选择面板可以复杂，字段展示必须统一。比如“专业”可以用“门类 -> 专业类”选择，但保存后字段只显示 `药学类`，不能在不同页面显示成按钮组、卡片组或两格输入。

高级筛选必须基于显式查询 contract，而不是复用编辑字段配置自动生成。每个筛选项都要声明后端实际支持的 `queryParam` 和值类型；例如“姓名”是 `keyword contains 张`，可以直接应用并返回一组员工；“员工 FK”才是从候选里选定一个员工实体。没有后端 query contract 的字段不能出现在高级筛选里。

generated 类成果的筛选 contract 要随生成 DTO 一起返回，避免 UI 自己猜字段、值类型和候选来源。公司、部门、岗位等已有 FK/候选体系的字段必须声明 `fkKey` 并走对应 `reference-options` 后端搜索；普通文本字段也必须先由后端列入 contract，UI 不能额外开放本地字段。

## Platform 模板

| 模板 | 统一入口 | 用途 |
|---|---|---|
| 登录后页面壳 | `@workspace/platform/ui` 的 `AppShell` | 所有登录后页面；内部必须复用 Core `PageShell` |
| 模块首页 | `@workspace/platform/ui` 的 `ModuleHome` | L1 模块入口页 |
| Portal | `@workspace/platform/ui` 的 `PortalClient` | Workspace 首页入口卡片 |
| 审计历史 | `@workspace/platform/ui` 的 AuditLog 组件 | 通用编辑历史展示 |

Platform 可以聚合模块注册和导航，但不能写 HR、Finance、Production、Work、Administration、Library 的业务字段逻辑，也不能重复实现 Core 已有的页面表头/返回栏结构。

Platform 系统壳的少量 Core UI 候选由 Platform 自己治理，不属于业务 Page API：`AppShell -> PageShell`、`UserMenu -> DropdownMenu`。Agent 页面 UI 已停用，仅保留 API / bot 接入能力；这些例外不得加入 `businessCoreUiRoleBypassImports` 的业务 allowlist。

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
- 业务 B 建议放在 `packages/<domain>/ui/**/<feature>-view-model.ts` 或 `adapter.ts`，只做数据映射、状态标记和真实 callback，不直接渲染 `PanelCard`、`SelectorCard`、`Toolbar`、`SearchInput`、`ActionButton`、`DetailModal` 等 Core primitive。
- 业务组件只组合 `const viewModel = createXxxViewModel(...)` 与 `<CoreTemplate {...viewModel} />`，再挂必须的业务 modal 或 service 状态。
- 不要为了页面样式预览再维护一套 B2，也不要在 showcase 里重写 toolbar、折叠、反馈、预览按钮或弹窗。没有共用真实 B 时，宁可不做该模板预览，避免预览和业务长期漂移。
- 如果用户看着业务页或样式预览说“这里样式/默认交互不对”，agent 首先判断能否改 A 的对应子件。只有字段文案、业务状态、权限、真实回调或数据筛选属于 B；通用视觉和交互改动不应补在 B 里。

当前示例：Production QC 检验模板使用 Core `TemplateWorkbenchFrame`；业务薄壳是 `packages/production/ui/qc/template-workbench/qc-template-workbench-view-model.ts`，真实页面只渲染 `TemplateWorkbenchFrame` 并挂 QC 预览/反馈 modal。

## Work 体验统一方向

Work 是业务包，不是 Platform。工作计划、项目管理、工作汇报、历史记录统一归 `packages/work` 和 `/work` 路由壳；不要把 Project / EmployeeProject 修回 HR，也不要新增 `packages/project`。

当前 `/work/projects` 的项目列表展开目标是左右分栏：左侧保留项目列表，右侧继续展示当前详情编辑区。列表展开不应遮罩整页、不应灰掉主内容，也不要做成覆盖详情区的临时 drawer。若这个交互需要通用布局，应先在 Core UI 增加可复用分栏组件，再让 Work 传入业务列表、详情和状态；Work 包只承接项目字段、DTO、服务和业务规则。

Work Project 的可见、可写、可管理和可删除是对象级业务规则，入口在 `packages/work/server/access.ts`。Core/Platform 只能提供模块导航、页面壳、权限 wrapper 和通用 FK 基建，不承载“谁能看哪个项目”的判断；`work.projects.access/write/delete` 也不能在 UI 中被解释成项目全量可见或全量管理。

## Finance 复用方向

Finance 当前已经有第一层统一模板，但业务页面还在渐进迁移：

- 已经下沉到 `packages/finance/ui`：`Pagination`、`AccountCodeInput`、`ReclassConfigRow`、`ReclassConfigView`、`reclassColumns` 等重分类相关组件。
- 已经下沉到 `packages/finance/ui`：`FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`、`Pagination`、重分类配置/审核组件。旧 `app/finance/components` 兼容目录已删除。`FinanceShell` 这类 domain shared layout shell 只算历史债或 thin domain adapter，禁止注册为 Core/Page API；长期应由 route/module 层生成 `PageSurface` props。
- `FinanceFilters` 作为历史兼容/领域薄壳只能承接 Surface filter/toolbar spec，不允许财务页面再手写公司/年度/月度/层级筛选组合，也不允许新增业务 direct internal Core primitive import。
- 预算、成本、导入、报表配置、部分总账页面仍可能存在旧目录下的页面结构债务；新增和重构必须改用 Core/Finance 组件。

后续 agent 改 Finance 时按以下方向收口：

- 财务模块页面统一使用一个 Finance 页面模板：标题区、公司/期间筛选区、工具栏、内容区、空态、错误态。
- `FinanceShell`、`CompanyPeriodPicker`、`FinanceFilters`、`Pagination`、重分类配置/审核组件已进入 `@workspace/finance/ui`，后续只允许扩展这个入口，不要恢复 `app/finance/components`。
- 财务表格默认通过 `PageSurface` data block 的 table/metric spec 复用 Core 数据能力；列显隐通过 Surface column spec 实现。
- 公司、年度、月份、报表类型、层级等固定筛选默认通过 `PageSurface` filter spec 或 `InputControl` 表达；需要财务语义时由 `@workspace/finance/ui` 包一层，不要在每个页面手写。
- 预算、成本、总账、报表配置、报表校对之间如果 UI 结构一致，应抽成 Finance 模板，而不是在每个页面重新写筛选栏、分页、表格工具栏。

## Agent 开发流程

1. 先查本文件和 `docs/engineering/module-boundaries.md`，判断已有 Core/Platform/App 组件是否可复用。
2. 若只是业务字段选项不同，复用现有组件，传入 options、DTO、校验和保存 handler。
3. 若交互模式通用但组件缺失，先新增到 Core，再让业务包引用。
4. 若模板只属于某个业务域，例如 Finance 页面模板，新增到对应 `packages/<domain>/ui`。
5. 不允许为了赶进度在页面里写一次性下拉、一次性搜索、一次性确认框、一次性表格。

## 硬约束

这些规则已经由 `npm run arch:gate` 中的 AST 和 package boundary 检查执行，新增包内代码必须通过：

- `packages/*` 禁止出现原生 `<select>`；业务用 `PageSurface` form/filter spec、`InputControl` 或基于 Surface 的 App 字段薄壳。
- `app/*` 和 `packages/*` 禁止新增搜索型原生 `<input>`；内容检索、FK、下拉内检索都通过 Surface field/filter spec 或领域薄壳表达。
- `packages/*` 禁止 `window.confirm`。
- `app/*` 和 `packages/*/ui` 页面反馈只能使用 `useFeedback`；禁止直接使用 `Toast`、`ConfirmProvider`、`useToast`、`useConfirm`、`useConfirmDelete`、`useUnsavedChangesPrompt`，专用 Agent 确认弹窗除外。
- 业务新增 Core UI 用法必须落到公共 runtime 入口、helper 或 Surface spec；内部 renderer 只保留 Core 内部、迁移阅读或 type-only 兼容用途。`npm run gate:ui` 会校验 registry 和业务 import 边界；组件库主展示只自动收录有 `declares` 的封装组件，并按 `页面布局 / 页面内容 / 通用` 分类。页面布局协议新增绕过属于 UI 阻断，由当前改动 agent 自己修，不交给 Hygiene。
- `InputControl` spec 禁止使用 `editor`。文本、数字、布尔、选项、FK、日期、文件、集合和评分分别通过 `control` 语义表达；搜索/下拉/分段编码等细节通过 `options.mode`、`options.source`、`format`、`mask.kind` 派生。
- `packages/*` 禁止原生 `input[type=date]`，统一通过 `PageSurface` 日期 field spec、`InputControl` 或领域薄壳表达。
- 选择/搜索类组件必须使用 `@workspace/core/search` 的 `matchText` 或由服务端提供同等拼音匹配。
- Core 禁止依赖 Platform、业务包、Prisma、权限和业务事实。
- 业务包之间禁止直接互相 import。

如果确实需要例外，必须先写进本文件的“例外”段落，说明原因、影响范围和迁移计划；不能直接绕过。
