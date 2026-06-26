# Core UI 五层治理

Core UI 是整个产品的公共视觉和交互接口。业务页、Platform 页和 agent 不能按局部需求随手复制基础控件；所有通用 UI 都必须通过 Core UI 的五层治理收口。

## 1. 五层模型

| 层 | 用途 | 业务/agent 可直接使用 |
|---|---|---|
| `Page Frame` | 页面骨架，只管理区域、slot 和结构关系 | 仅 `stable` 可默认使用；`tbc` 只能在明确 UI-system 任务中打磨 |
| `Page API` | 业务页可直接 import 的公开 UI 接口 | 可以 |
| `Core Internal` | 只服务 Page API 的内部组合或部件 | 不可以 |
| `Foundation` | token、recipe、glyph taxonomy、class helper 等视觉材料 | 不可以 |
| `Private Impl` | 某个公开 UI 的私有实现文件 | 不可以 |

只有 `accessLayer` 是治理层。旧 `tier / primitive / assembly / shell` 已删除，不再作为分类、筛选、展示或 gate 依据。

## 2. Agent 使用规则

普通 Feature/Data/Operations agent：

- Toolbar 规则另见 `docs/core-toolbar.md`；该文档是所有页面级工具栏的专门规范。
- 只从 `@workspace/core/ui` 使用已注册的 `Page API`。
- 只在明确确认为 `stable` 时使用 `Page Frame`；`tbc` Frame 不作为默认页面骨架。
- 不直接 import `Core Internal`、`Foundation`、`Private Impl`。
- 不新增业务包 `Toolbar`、`Picker`、`Select`、`Search`、`Table`、`Modal`、`DateInput`、`Pagination`、`Tab` 等重复基础 UI。
- 业务页不得在 Core Page API 中塞 `custom` 渲染自定义控件；例如 `Toolbar` 业务调用禁止 `kind: "custom"`。`custom` 和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则。
- 发现现有 Page API 不够用时，先停下来写清缺口；由 Architecture/Core UI 任务补公开接口，再回业务页替换。

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
- 重点审查业务是否直接 import `SelectorList`、`SelectorTree`、`SelectorCard`，或手写 `PanelCard + Selector*` 作为左侧选择区；业务应改用 `SelectorPanel`。
- 发现 `Core Internal` / `Foundation` 业务直引时，结论必须是不通过，除非该文件是明确的 Core UI-system 任务。

## 3. Page Frame

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

## 4. Page API

Page API 是业务页可以直接使用的公开接口，必须满足：

- 在 registry 中登记。
- 有中文 `description` 和中文 `example`。
- 有 `/settings/ui` 预览；复杂组件需要覆盖关键参数。
- props 契约稳定。
- 不暴露内部样式 recipe 或内部部件给业务页。

典型 Page API：

- 页面/布局：`PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`WorkspaceSplitPage`
- 工具栏：`Toolbar`、`CommandButton`
- 数据：`DataTable`、`StructuredTable`、`TableScrollFrame`
- 表单：`FormField`、`TextField`、`SelectField`、`CalendarDateInput`、`TimeField`、`FieldGrid`
- 选择：`OptionPicker`、`SelectorPanel`
- 标签：`TagListInput`
- 反馈：`ConfirmModal`、`ConfirmProvider`、`Toast`

Page API 使用红线：

- `Toolbar` 只能接收语义化 item：`create`、`search`、`field-filter`、`option-group`、`column-toggle`、`page-size`、`text`、`icon-button`、`action-group`、`edit-group` 等。
- 业务调用 `Toolbar` 禁止使用 `kind: "custom"` 拼装搜索、筛选、统计、分页、动作或任意自定义节点。
- 如果现有语义 item 不够表达业务需要，必须扩展 `Toolbar` 的 Page API 或写入 special-to-be-reviewed 说明等待 Core UI 评审；不得用 `custom` 临时绕过。
- Core 内部 preview/showcase 或明确 UI-system 任务也不得恢复 `ToolbarCustomItem`；临时验证应扩展标准 item 或使用非 Toolbar 的普通预览容器。
- Toolbar 内 `option-group` 默认是 micro accordion；普通 agent 不要把长分段筛选常驻铺开。
- 业务侧左侧列表、目录树、选择区统一使用 `SelectorPanel`；`SelectorList`、`SelectorTree`、`SelectorCard` 是 Core 内部组合件，不作为业务 Page API。

新增 Page API 时必须同步：

1. `packages/core/ui/<Name>.tsx`
2. `packages/core/ui/index.ts`
3. `packages/core/ui/component-registry-data-*.ts`
4. `packages/core/showcase/previews/*`
5. 必要时更新 `docs/core-ui-governance.md` 或 `docs/reusable-components.md`

## 5. Core Internal

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

## 6. Foundation

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

## 7. Private Impl

Private Impl 是公开 UI 自己拆出来的内部文件。它不注册为独立 UI，不出现在 `/settings/ui` 组件卡片里，不允许业务 import。

例子：

- `OptionPickerContent.tsx`
- `OptionPickerParts.tsx`
- `OptionPickerTypes.ts`
- `Toolbar.parts.tsx`
- `Toolbar.types.ts`
- `DataTable.types.ts`

Private Impl 修改等同于修改所属公开 UI，必须按 Core UI-system 任务处理。

## 8. 硬约束

本地提交前：

- `.githooks/pre-commit` 会运行 `scripts/check/check-core-ui-guard.js --staged`。
- 未授权修改 core UI / registry / preview 会失败。
- 新增业务包 `*Toolbar.tsx` 会失败。
- 新增 `eslint-disable` 会失败。
- 新增或删除 core UI 但 registry/preview 未同步会失败。

收口/CI：

- `npm run arch:gate` 会运行 Core UI guard、registry relation validation、Level 2 ratchet 和 package boundary。
- `Core Internal` / `Foundation` 业务直引、新增未注册 Core UI、重复 registry、页面设计漂移、重复基础 UI 都必须由 gate 或 baseline ratchet 拦住。
- baseline 只能减少，不能把新增违规写入 baseline。

授权方式：

```bash
CORE_UI_CHANGE=1 git commit ...
CORE_UI_CHANGE=1 npm run arch:gate
```

或创建明确任务说明：

```text
/Users/koito/Desktop/UI/core-ui-change-request.md
```

## 9. 标准改造流程

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

## 10. 审计命令

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
