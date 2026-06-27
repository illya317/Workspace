# Core UI 五层治理

Core UI 是整个产品的公共视觉和交互接口。业务页、Platform 页和 agent 不能按局部需求随手复制基础控件；所有通用 UI 都必须通过 Core UI 的五层治理收口。

## 1. 五层模型

| 层 | 用途 | 业务/agent 可直接使用 |
|---|---|---|
| `Page Frame` | 页面骨架，只管理区域、slot 和结构关系 | 仅 `stable` 可默认使用；`tbc` 只能在明确 UI-system 任务中打磨 |
| `Page API` | L1 Surface 与 L2/L3 可读能力层 | 仅 L1 可 runtime import；L2/L3 只作 Core 内部、showcase、迁移阅读或 type-only 兼容 |
| `Core Internal` | 只服务 Page API 的内部组合或部件 | 不可以 |
| `Foundation` | token、recipe、glyph taxonomy、class helper 等视觉材料 | 不可以 |
| `Private Impl` | 某个公开 UI 的私有实现文件 | 不可以 |

`accessLayer` 仍是开放/引用治理层。组件库主展示另有 `uiLevel`：

- L1：公开入口，只允许 `PageSurface`、`FormSurface`、`DataSurface`、`NavigationSurface` 和 `useFeedback`。
- L2：Surface 的 `kind` / `variant` / `spec` 能力层，过渡期承接旧 Page API 阅读。
- L3：Core 内部可见组合层，供迁移、关系图和 review 使用。
- L4+：Foundation、Private Impl 和更深实现层，只保留在 registry 关系数据中，不进入 `/settings/ui` 主展示。

旧 `tier / primitive / assembly / shell` 已删除，不再作为分类、筛选、展示或 gate 依据。

## 2. Agent 使用规则

普通 Feature/Data/Operations agent：

- Toolbar 规则另见 `docs/core-toolbar.md`；该文档是所有页面级工具栏的专门规范。
- 只从 `@workspace/core/ui` 使用 L1 公开入口：`PageSurface`、`FormSurface`、`DataSurface`、`NavigationSurface`、`useFeedback`。
- 只在明确确认为 `stable` 时使用 `Page Frame`；`tbc` Frame 不作为默认页面骨架。
- 不直接 import L2/L3 组件作为业务 runtime 组件；过渡期允许保留必要 type-only 引用。
- 不直接 import `Core Internal`、`Foundation`、`Private Impl`。
- 不新增业务包 `Toolbar`、`Picker`、`Select`、`Search`、`Table`、`Modal`、`DateInput`、`Pagination`、`Tab` 等重复基础 UI。
- 业务页不得在 Surface spec 中塞 `custom` 渲染自定义控件；例如 toolbar/action spec 禁止 `kind: "custom"`。`custom` 和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则。
- 发现现有 Page API 不够用时，先停下来写清缺口；由 Architecture/Core UI 任务补公开接口，再回业务页替换。
- Platform 系统壳例外独立治理：`AppShell -> PageShell`、`UserMenu -> DropdownMenu` 是 Platform-owned system shell candidates，不是业务 Page API，不进入业务 Surface allowlist。Agent 页面 UI 已停用，仅保留 API / bot 接入能力。

Architecture/Core UI agent：

- 可以修改 `packages/core/ui/**`、Core UI registry、showcase preview 和治理脚本。
- 必须使用 `CORE_UI_CHANGE=1` 明确授权本次是 UI-system 任务。
- 必须同步更新 registry、preview、导出和关系声明。
- 必须保持 `npm run arch:gate`、`npm run lint:changed`、`npm run typecheck:quick` 无豁免通过。

Review agent：

- 优先检查业务页是否绕过 Page API。
- 优先检查 Core UI 新增/删除是否同步 registry、preview、关系图和文档。
- 重点审查是否有人为了过 gate 随手新增 Core UI registry、页面/API/resource registry 或 baseline；注册项必须对应真实可复用入口，不能只为单页手搓组件背书。
- 重点审查重复和可拆除项：只在 showcase 使用、没有业务消费、或与现有 Toolbar/Picker/Table/Modal/Page Frame 重叠的组件，应要求删除、合并或下沉到既有入口。
- 重点审查业务是否直接 import `SelectorList`、`SelectorTree`、`SelectorCard`，或手写 `PanelCard + Selector*` 作为左侧选择区；业务应改用 `NavigationSurface` 的 selector/disclosure spec。
- 发现 `Core Internal` / `Foundation` 业务直引时，结论必须是不通过，除非该文件是明确的 Core UI-system 任务。

## 3. Layout 引用契约

Core UI 的 layout 规则分为“内容规则”和“外观规则”。业务页不得用自由 `className` 覆盖基础尺寸来绕过契约。

### 3.1 内容规则

字体、字号、字重、行高、垂直居中、文字颜色层级等内容要素，必须跟随引用主体，没有例外。

- Toolbar 里的字段、日期、按钮、下拉选项，文字表现跟随 Toolbar。
- 表格里的输入、选择、只读值，文字表现跟随表格。
- 详情页里的输入、选择、只读值，文字表现跟随详情页字段区。
- 纸面/填表类控件，文字表现跟随纸面/填表主体。

不要把基础字段组件设计成到处自己决定 `sm/md/lg`。组件可以接收引用主体传来的 context，但字体字号本身由引用主体语义决定。

### 3.2 外观规则

基础 UI 只允许落入三种 layout policy。

| Policy | 含义 | 典型场景 | 冲突时谁说了算 |
|---|---|---|---|
| `intrinsic` | 框架随内容变化，可以参差不齐 | Toolbar、顶部筛选条、inline actions | 引用主体决定这是 intrinsic，子 UI 自行适配内部细节 |
| `parentLocked` | 父级框架锁定行高、列宽、对齐，子 UI 必须服从 | 表格单元格、批量录入、纸面表单、FieldGrid、Panel 内固定字段网格 | 父级框架说了算 |
| `selfLocked` | 系统级反馈层自行锁定框架，不随业务页面变化 | Toast、ConfirmModal、ErrorDialog、LoadingOverlay、阻塞式系统提示窗口 | 组件自身说了算，仅限系统反馈层 |

普通 Button、Badge、Tag、Metric、Field、Select、DateInput 都不默认属于 `selfLocked`。它们可以有 Core 默认外观，但在业务布局里必须服从引用主体。

页面级全局组件是例外中的另一类稳定规格组件：Toolbar、TabBar、WorkspaceSplitPage 左侧栏、PanelCard 页面壳等本身定义页面结构，不应被正文、表格或字段 context 反向改变尺寸。引用方只能选择 Core 暴露的语义档位，例如大/中/小、compact/normal、bar/inline，不得手写尺寸覆盖。

### 3.3 父子职责

父级/引用主体负责声明“你在我这里是什么”：

- Toolbar 声明子控件处于 `intrinsic`。
- 表格、批量录入、纸面表单声明子控件处于 `parentLocked`。
- 详情页字段区声明子控件跟随详情页字段 context，并在同一区域内保持一致。
- 系统反馈组件才允许 `selfLocked`。
- 页面级全局组件使用自身稳定规格；正文 context 不影响它们，引用方只选语义档位。

子 UI 负责实现“在该 context 下怎么长”：

- `SelectField` 自己适配 trigger、option、dropdown 的字号、padding、行高。
- `CalendarDateInput` 自己适配日期宽度。
- `FieldValueFilter` 自己适配二段筛选内部布局。
- `TextField` / `ReadOnlyField` / `FkFieldInput` 自己适配字段壳内部结构。

冲突规则：

1. 父级 layout policy 优先于子 UI 默认外观。
2. 父级只能通过 Core 定义的语义 context/policy 表达约束，不得用自由 `className` 硬改高度、padding、字号、圆角、阴影。
3. 子 UI 不得用自己的默认尺寸压过父级框架。
4. 只有 `selfLocked` 系统反馈组件可以拒绝业务父级尺寸约束。
5. 页面级全局组件按自身稳定规格执行，不能因为被某个页面、表格或面板引用就改变基础尺寸。

### 3.4 治理口径

尺寸治理不是“删掉所有 className 让它自适应”，而是把规则从业务 className 上移到 Core UI 的引用主体 context。

- Toolbar 需要紧凑、自适应、可参差。
- 表格/填表需要稳定、等高、必要时等宽。
- 详情页需要响应式，但同一字段区内部要一致。
- 除系统反馈层外，普通 UI 都应该服从引用主体，而不是拿 Core 默认尺寸压过父级布局。

## 4. Page Frame

Page Frame 是页面骨架，不是业务组件。它只定义页面区域和 slot，例如顶部区、工具栏区、左右分栏、主内容区、空态/加载/错误位。

Frame 禁止包含：

- 员工、岗位、会议、凭证等业务事实。
- 数据请求。
- 权限判断。
- 业务状态流转。

Frame 成熟度：

- `stable`：可作为 agent 默认页面骨架。
- `tbc`：候选骨架，仍需补 slot、复用场景、全参数预览和用户视觉验收。
- `internal-only`：只服务 settings/ui 或展示系统，不给 agent 选择。

TBC Frame 是当前唯一允许保留的历史债类别。它不能用来掩盖业务包重复造页面结构。

## 5. Page API / Surface

Page API 是 registry/accessLayer 概念；业务 runtime 的直接入口已经收敛为 L1 Surface：

- `PageSurface`
- `FormSurface`
- `DataSurface`
- `NavigationSurface`
- `useFeedback`

L2/L3 组件可以在 UI component library 中用于关系图、阅读和迁移，但业务包与 `app/(modules)` 不得 runtime import 它们。历史的 Page API 名称只能作为 Surface 的内部实现、showcase 可见层、兼容迁移说明或 type-only 引用。

所有 Page API registry entry 必须满足：

- 在 registry 中登记。
- 有中文 `description` 和中文 `example`。
- 有 `/settings/ui` 预览；复杂组件需要覆盖关键参数。
- props 契约稳定。
- 不暴露内部样式 recipe 或内部部件给业务页。

典型 L2/L3 可见能力层：

- 页面/布局：`PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`WorkspaceSplitPage`
- 工具栏：`Toolbar`、`CommandButton`
- 数据：`DataTable`、`StructuredTable`、`TableScrollFrame`
- 表单：`FormField`、`TextField`、`SelectField`、`CalendarDateInput`、`TimeField`、`FieldGrid`
- 选择：`OptionPicker`、`SelectorPanel`
- 标签：`TagListInput`
- 反馈：`ConfirmModal`、`ConfirmProvider`、`Toast`

Surface 使用红线：

- 业务 runtime 不直接 import `Toolbar`、`PanelCard`、`DataTable`、`SelectField`、`ConfirmModal` 等 L2/L3 entry；通过四个 Surface 的 kind/spec 或 `useFeedback` 表达。
- Surface 内部的 `Toolbar` 只能接收语义化 item：`create`、`search`、`field-filter`、`option-group`、`column-toggle`、`page-size`、`text`、`icon-button`、`action-group`、`edit-group` 等。
- 业务传给 Surface 的 toolbar/action spec 禁止使用 `kind: "custom"` 拼装搜索、筛选、统计、分页、动作或任意自定义节点。
- 如果现有语义 spec 不够表达业务需要，必须扩展 L1 Surface 或对应 L2/L3 Core 能力，并写入 special-to-be-reviewed 说明等待 Core UI 评审；不得用 `custom` 临时绕过。
- Core 内部 preview/showcase 或明确 UI-system 任务也不得恢复 `ToolbarCustomItem`；临时验证应扩展标准 item 或使用非 Toolbar 的普通预览容器。
- Surface 内部 toolbar 的 `option-group` 默认是 micro accordion；普通 agent 不要把长分段筛选常驻铺开。
- 业务侧左侧列表、目录树、选择区统一使用 `NavigationSurface` 的 selector/disclosure spec；`SelectorPanel`、`SelectorList`、`SelectorTree`、`SelectorCard` 是 L2/L3 或 Core 内部组合件，不作为业务 runtime import。

新增 Page API 时必须同步：

1. `packages/core/ui/<Name>.tsx`
2. `packages/core/ui/index.ts`
3. `packages/core/ui/component-registry-data-*.ts`
4. `packages/core/showcase/previews/*`
5. 必要时更新 `docs/core-ui-governance.md` 或 `docs/reusable-components.md`

新增 L1 Surface 时必须显式设置 registry `uiLevel: 1`。L1 名单由 gate 硬锁为 `PageSurface`、`FormSurface`、`DataSurface`、`NavigationSurface`、`useFeedback`；任何其他 registry entry 声明或解析为 L1 都会失败。L2/L3 可以省略 `uiLevel` 使用默认派生；L4+ 必须由 `isCoreUiComponentVisibleInShowcase` 隐藏，且不得作为 UI 组件库主展示根节点或可见直接关系暴露。

## 6. Core Internal

Core Internal 是公开 API 的内部组合。它可以注册到关系图，但业务页不能直接 import。

例子：

- `ActionButton`
- `DropdownSurface`
- `PickerShell`
- `PickerOptionButton`
- `ToolbarOptionGroup`
- `TreeNodeCard`
- `TreeNodeBranch`
- `RemovableTag`
- `TagPill`
- `InlineCreatePanel`
- `BlockCreatePanel`
- `ModalCreatePanel`
- `DetailCreatePanel`

改造规则：

- 如果业务页正在直接用 Core Internal，必须补或扩 Page API，再替换业务调用点。
- 不保留 deprecated/compat 壳给业务继续用。
- 如果只是某个公开组件自己的拆分，不应注册为 Core Internal，应作为 Private Impl。

## 7. Foundation

Foundation 是视觉材料，不是业务可用接口。

例子：

- `ActionGlyph`
- `ACTION_GLYPH_KINDS`
- `ACTION_GLYPH_ORDER`
- `ACTION_GLYPH_GROUPS`
- `getToolbarActionClassName`
- `getFieldInputClassName`
- `getReadOnlyFieldClassName`
- `getFieldGridCellClassName`
- `dataTableClassNames`
- `moduleCardColorClasses`

Foundation 改造规则：

1. Foundation 必须伪注册，确保关系图可追踪。
2. Page API / Core Internal 使用 Foundation 时，必须写在 `foundations` 字段。
3. `composes` / `includes` 不得指向 Foundation。
4. 业务页不得直接 import Foundation。
5. 发现业务直引 Foundation 时，补 Page API 或扩已有 Page API，再替换业务调用点。

## 8. Private Impl

Private Impl 是公开 UI 自己拆出来的内部文件。它不注册为独立 UI，不出现在 `/settings/ui` 组件卡片里，不允许业务 import。

例子：

- `OptionPickerContent.tsx`
- `OptionPickerParts.tsx`
- `OptionPickerTypes.ts`
- `Toolbar.parts.tsx`
- `Toolbar.types.ts`
- `DataTable.types.ts`

Private Impl 修改等同于修改所属公开 UI，必须按 Core UI-system 任务处理。

## 9. 硬约束

本地提交前：

- `.githooks/pre-commit` 会运行 `scripts/check/check-core-ui-guard.js --staged`。
- 未授权修改 core UI / registry / preview 会失败。
- 新增业务包 `*Toolbar.tsx` 会失败。
- 新增 `eslint-disable` 会失败。
- 新增或删除 core UI 但 registry/preview 未同步会失败。

收口/CI：

- `npm run arch:gate` 会运行 Core UI guard、registry relation validation、Level 2 ratchet 和 package boundary。
- `Core Internal` / `Foundation` 业务直引、新增未注册 Core UI、重复 registry、非法 `uiLevel`、L4+ 主展示泄漏、页面设计漂移、重复基础 UI 都必须由 gate 或 baseline ratchet 拦住。
- 业务 UI 和 `app/(modules)` 只能从 `@workspace/core/ui` runtime 引入 `PageSurface`、`FormSurface`、`DataSurface`、`NavigationSurface`、`useFeedback`；其他 Core UI runtime 直引由 `businessCoreUiSurfaceBypassImports` baseline 锁定，只能减少。
- baseline 只能减少，不能把新增违规写入 baseline。
- 大规模 UI 迁移前后必须阅读或运行 Core UI governance checks，确认 L1/L2/L3/L4 展示层级、registry 关系和 `businessCoreUiSurfaceBypassImports` baseline 都在收敛；长期迁移按阶段定期复查，而不是等最后一次性补 gate。

授权方式：

```bash
CORE_UI_CHANGE=1 git commit ...
CORE_UI_CHANGE=1 npm run arch:gate
```

或创建明确任务说明：

```text
/Users/koito/Desktop/UI/core-ui-change-request.md
```

## 10. 标准改造流程

Core UI 收敛任务必须拆阶段：

1. 写阶段 MD，明确只处理一个对象，例如 Toolbar、Picker、DataTable、Tag、FieldGrid。
2. KIMI 或执行 agent 只读当前阶段 MD 和必要 result/review MD。
3. 完成后写 `*-result.md`。
4. Codex/review agent 写 `*-review.md`。
5. 只修 review 指出的项，不碰下一阶段。
6. 全部通过后提交，保持 CWD clean。

推荐命令：

```bash
kimi -p "执行 /Users/koito/Desktop/UI/kimi-core-ui-phaseX-name.md，完成后写 result。"
kimi --continue -p "读取 /Users/koito/Desktop/UI/codex-review-phaseX-name.md，只修 review 指出的问题。"
```

## 11. 审计命令

Core Internal 业务直引：

```bash
rg "ActionButton|RefreshActionButton|CreateStartButton|CreateConfirmActions|DataTableActionsCell|createDataTableEditActions|getDefaultVisibleColumns|PickerShell|PickerOptionButton|ToolbarOptionGroup|SelectorCard|TreeNodeCard|TreeNodeBranch|TagPill|TagPillButton|TagRemoveButton|RemovableTag|InlineCreatePanel|BlockCreatePanel|ModalCreatePanel|DetailCreatePanel|SplitWorkspace|ModuleCardBody" packages --glob '!packages/core/**' -n
```

Foundation 业务直引：

```bash
rg "getFieldInputClassName|getReadOnlyFieldClassName|getTagInputShellClassName|getTagPillClassName|getTagInlineInputClassName|getFieldGridCellClassName|getFieldGridLabelClassName|getFieldGridValueClassName|getFieldGroupTitleClassName|getToolbarActionClassName|dataTableClassNames|moduleCardColorClasses|getModuleCardClassName" packages --glob '!packages/core/**' -n
```

业务重复 Toolbar：

```bash
rg --files packages | rg '/ui/.*Toolbar\.tsx$'
```

业务 Toolbar custom 绕行：

```bash
rg 'kind:\s*"custom"' packages app --glob '!packages/core/**' -n
```

旧层级残留：

```bash
rg "CoreUiComponentTier|coreUiComponentTierMeta|旧层级|tierValue|TIER_OPTIONS|TIER_ORDER|\\btier\\b" packages/core packages/platform scripts -n
```

期望：前三组无业务违规；Toolbar custom 全局无结果；旧层级残留无结果。
