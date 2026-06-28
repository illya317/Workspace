# Core UI Surface Layering Plan

## Goal

把 Core UI 从“业务直接 import renderer”迁到清晰分层：

- `surface`：声明接口。业务默认可用，只描述 UI 意图，不直接渲染。
- `helper`：声明助手。业务可用，只返回 surface 声明或声明片段。
- `service`：非视觉服务接口，例如 feedback。
- `host`：宿主入口。当前默认空，只有确实需要执行 Surface 声明时才新增，并必须白名单。
- `internal`：内部实现。Renderer、primitive、resolver、样式 token 和工具都在这里，业务不可直接 import。

目录已按层建立在 `packages/core/ui/{surface,helpers,services,host,internal,registry}`。关键 Surface 声明、helper 和 feedback service 已移入对应目录；根目录同名文件只保留兼容 re-export shim。

## Current Rules

1. `role=surface` 必须有清晰 `declares`。
2. 非 `role=surface` 不应挂 public `declares`；service/helper 用 `capabilities` 或 description 描述能力。
3. 非 common 的 Surface 不应直接 compose 其他 Surface；共享能力应下沉到 `common` 或 helper。
4. `InputControl` 归 `common.input` 且作为 `role=surface` 的通用声明接口保留。
5. `host` 暂时为空；不要为了迁移便利新增 host。
6. 业务代码不得新增 `PageSurface.moduleView`、`DataSurface.raw`、`DataSurface.visual` 这类兼容逃生口；`arch:surface-boundaries` 会扫描 Core UI 以外源码并报错。

## Current Status

`npm run arch:surface-boundaries` 已通过。第一批 registry/lint 债已清理：

- `PageSurface` registry 不再直接 compose `DataSurface` / `FormSurface` / `DocumentSurface` / `VisualizationSurface`。
- `CreatePanel` / `SelectorPanel` 已降为 internal renderer，不再挂 public `declares`。
- `CreatePanel` / `SelectorPanel` 已撤掉旧 `runtime` exposure；业务入口只保留 helper / surface 声明路径。
- `DataSurface.kind.visual/raw`、`FormSurface.kind.control/modal` 已从公开类型层删除；`PageSurface.body.content` 不再作为 public declares 暴露。
- 外部 `DataSurface.raw` 使用已迁到 `BlockSurface`；`DataSurface` 顶层 kind 只剩 `table/structured/records/metrics`。
- QC 批号输入已从复杂 `FormSurface.note` 迁到 `BlockSurface.content`；`note` 继续只承担说明/提示。
- `PageSurfaceBlockSpec` 已收窄为 `data/document/form/visualization/block/navigation/modal` wrapper；旧 `message/empty/panel/section/actions/metrics/moduleGrid/surfaceGroup/analysis` 不再是 PageSurface public block kind。
- `PageSurface.body` / `PageSurface.navigation` 已作为新代码入口，顶层 `blocks/empty/actions/tabs/activeTab/activeChild/onTabChange/onChildChange` 仅保留兼容迁移。
- 关键声明与 helper 已移动到 `packages/core/ui/surface/`、`packages/core/ui/helpers/`、`packages/core/ui/services/`；`host` 目录保持空。

`structure` import gate 当前按 role 判定：

- 业务和 Platform UI 只能 import `role=surface/helper/service`。
- `role=host` 默认不可 import，必须显式白名单。
- `role=internal` 不可被业务或 Platform UI 直接 import。
- 深层 import（例如 `@workspace/core/ui/X`）同样按 role 判定，不能靠已注册名字绕过。

`arch:structure:ui` 已通过。第一批 direct internal import 已迁移：

- `CreatePanel`：HR 4 处改为 `createCreatePanelBlock` helper。
- `SelectorPanel`：Library 1 处、Work 3 处、Platform 1 处改为 `createSelectorPanelBlock` helper。
- `page-style-preview` 深层模板数据入口登记为 `role=helper`。

## Surface Declare Boundaries

- `PageSurface`：只管页面壳、全局布局、字体/格式、header、navigation、toolbar、body slot、footer。
- `FormSurface`：只管字段填写、表单内布局、校验、提交、dirty/actions。
- `DataSurface`：只管 rows、columns、records、metrics 和 data-local actions。
- `VisualizationSurface`：只管 chart、gantt、timeline、graph 等图形声明。
- `DocumentSurface`：只管纸面/QC/打印布局；允许拥有 `pageClassName/style/className` 这类纸面覆盖。
- `BlockSurface`：只管 section、panel、group、message、empty、actions 等通用区块。
- `InputControl`：作为 `common.input` 的通用输入声明接口，被其他 Surface 使用。

## Migration Order

1. **PageSurface 薄壳化**
   - Page 只保留页面壳声明：布局、字体、格式、header、navigation、toolbar、body slot、footer。
   - Page 不展开 Data/Form/Document/Visualization 的内部协议。
   - Page 与其他 Surface 的关系改成 slot/reference/helper，而不是直接 compose Surface renderer。

2. **CreatePanel 拆成声明接口**
   - 已去掉 `CreatePanel` renderer 上的 public declares。
   - 当前过渡入口是 `createCreatePanelBlock` helper；后续可继续抽成更明确的 create Surface。
   - Renderer 留在 internal。

3. **SelectorPanel 拆成声明接口**
   - 已去掉 `SelectorPanel` renderer 上的 public declares。
   - 当前过渡入口是 `createSelectorPanelBlock` helper；后续可继续抽成更明确的 common selection Surface。
   - Renderer 留在 internal。

4. **业务直接 import 收敛**
   - 第一批 `CreatePanel` / `SelectorPanel` direct internal import 已归零。
   - 新增业务只 import `surface/helper/service`。
   - `host` import 仍保持空，除非架构确认需要执行入口。

5. **目录迁移**
   - 已移动关键 Surface 声明、helper、feedback service。
   - 根目录 shim 仅用于兼容旧 import；新增文件必须进入对应层目录。
   - 后续逐步把 renderer/primitive 移入 `internal/`，但不得改变业务可见入口。

## Validation

阶段性：

- `npm run arch:surface-boundaries`
- `npm run arch:surface-page-adoption`
- `npm run check:hygiene:warn`
- `CORE_UI_CHANGE=1 npm run gate:ui`
- `npm run typecheck:quick`
- `git diff --check`

最终：

- `npm run arch:surface-boundaries` 无 warning。
- `npm run arch:surface-page-adoption` 无 PageSurface 顶层兼容入口 warning。
- `npm run check:hygiene:warn` 无 Core UI surface boundary / PageSurface adoption warning。
- `CORE_UI_CHANGE=1 npm run gate:ui` 通过。
- `npm run lint:changed` 与 `npm run typecheck:quick` 通过。

## Subagent Split

- Architecture 主线程：维护 role、lint、docs、review 子 agent 迁移方案。
- Hygiene 子 agent：按 warning 清单迁移历史债，不改架构规则。
- Feature 子 agent：处理业务 UI 直接 import 收敛和页面行为回归。
- Review 子 agent：最终检查 Page 是否薄壳、Surface declares 是否不过度复杂、warning 是否归零。
