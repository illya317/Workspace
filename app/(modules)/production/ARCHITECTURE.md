# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.entry` |
| 批次检验 | `/production/qc` | `production.qc.entry` |
| 批次阶段确认 | `/production/qc/[batchId]/[stageKey]` | `production.qc.entry` |
| 批次检测项目 | `/production/qc/[batchId]/[stageKey]/[testName]` | `production.qc.entry` |

## 模块边界

生产管理目前只保留 QC / 批检验迁移线：

- 承接 pharma-ops 的批次检验、检验记录和运行时 QC 配置读取。
- QC 模板浏览、编辑、复制和官方发布入口由文档中心 `/docs/editor` 承接，不再作为 Production L2 暴露。
- 库存轻台账不再作为生产管理入口开放；旧库存 API 已移除。

## pharma-ops 迁移原则

第一阶段做 Workspace 入口、权限、官方模板快照、批次台账和记录页面。QC 官方模板由 `/docs/editor` 发布，Production 运行态只读取批次快照中的 docs editor document。

迁移期批次数据先落在 `WORKSPACE_CONFIG_DIR/data/qc.json`。QC 官方模板的编辑、复制、发布和权限管理归 `/docs/editor`，生成模板快照由 `generated/production/qc/template-snapshots` 提供同步源，Docs Editor 会把它们 upsert 成质量控制部的真实部门模板。

当前已接入：

1. `packages/production/server/qc/` 读取已发布的 docs editor QC 官方模板，并在创建批次时固化模板快照。
2. `packages/production/ui/qc/` 承载 QC 批次与检验记录 UI；桌面端保留纸面预览，移动端把同一 document slice 映射为原生章节表单。`app/(modules)/production/qc/*` route 只做鉴权、必要预取和挂载 package component。
3. `/production/qc` 提供批次创建、批次台账、检验状态和记录入口。
4. `/production/qc` 展示批次队列和当前批次阶段入口；不再保留独立的 `/production/qc/[batchId]` 中间页。
5. `/production/qc/[batchId]/[stageKey]` 使用 docs editor document 的阶段切片展示检验前确认；桌面端显示纸面记录，移动端先选章节再进入满宽字段表单。同阶段检验前确认和检测项目是一个记录工作台的平级页签，不互相作为解锁前置。
6. `/production/qc/[batchId]/[stageKey]/[testName]` 使用 docs editor document 的检验项目切片展示记录；桌面端保留纸面预览，移动端按标题、表格行和字段模型转换成章节化原生表单。公式、引用、只读、选项、字段值和保存/复核仍由同一 docs field model 与 QC workflow 驱动，不另建移动端数据协议。
7. `/api/modules/production/qc*` 提供 JSON 批次台账读写接口。
8. `/docs/editor` 把 `generated/production/qc/template-snapshots` 中的 QC 官方模板快照同步到质量控制部部门空间，负责模板空间、纸面编辑、复制、发布和权限管理。
9. Workspace 云端 Agent 可通过 Docs Editor 自有工具按自然语言查询、分段检查、完整编辑和发布 QC 官方模板；完整编辑覆盖 `document + fieldModel` 内的章节、表格、行列、字段、公式与引用。写入只在请求人和虚拟员工都具备具体空间权限时直接执行，不创建 Agent 审批提案，也不绕过 Docs Editor 领域校验或必须走流程的业务配置。

QC 批次页面只使用批次固化的 docs editor 模板快照。模板编辑器入口不再通过 Production L2 暴露。

QC 记录页的响应式边界是展示层边界：`QcEditorRuntimePaper` 只在桌面 section 渲染，`QcEditorRuntimeMobile` 只在移动 section 渲染；两者必须复用 `qc-editor-runtime-field` 的字段解析和同一 `values/onFieldChange`，不能分别保存、计算或定义字段。移动端章节目录使用 Core `BodySurface.mobilePresentation="drilldown"`，避免缩放 A4、横向表格或一次铺开整份记录。

后续迁移目标：

1. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
2. 把 docs field model 的公式、引用和检验规则继续沉淀为 Workspace 原生运行时能力。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qc` | 批次检验、记录填写、提交复核 |
| `docs.editor` | QC 官方模板浏览、复制、编辑和发布 |

页面入口使用 `requireResourceAccess(resourceKey)`。QC 批次 API 权限动作：

- GET：`production.qc.read`
- POST `/api/modules/production/qc`：`production.qc.create`
- PATCH `/api/modules/production/qc/[batchId]`：`production.qc.update`，只用于保存检验前确认和检验项目记录
- DELETE `/api/modules/production/qc/[batchId]`：`production.qc.delete`
- POST `/approve-review`：`production.qc.approve`，只用于检验前确认复核和检验项目复核
- 批次列表导出：`production.qc.export`

前端动作位置和图标约定：

- `create`：批次列表声明 inline `CreateSurface`；PageSurface 固定派生 toolbar `+`，表单提交使用 `save` 语义和图标。
- `delete`：批次队列单条记录右侧显示 `delete-bin`，避免和新建区混在一起。
- `update`：检验前确认和检验项目记录页使用 `save` 图标保存记录。
- `approve`：记录页使用 `approve` 图标执行复核通过；QC 不再暴露批次级 `submit` 动作，待复核状态由记录保存后产生。
- `export`：批次列表 toolbar 的动作组使用 `download` 图标导出 CSV。

检验前确认与检验项目一致采用同一记录页和双签名流：首人保存写入 inspector，另一人复核写入 reviewer；已复核后前端只读，service 拒绝继续修改。同一阶段内的检验前确认和各检测项目是平级页签，不能让第一个页签阻塞其他检测项目的进入、填写或复核。不要为检验前确认另建特殊 toolbar、按钮或只读状态机。

QC 保存动作的流程能力、默认复核节点、职责分离和修改权限以 `packages/platform/action-contract-registry-production-qc.ts` 为唯一声明源；Platform readiness 只投影该合同，Production service 继续负责原生双签状态迁移，不另建 QC workflow definition 或通用审批台账。

正式 QC 模板浏览、复制、编辑、发布和空间权限仍归 `docs.editor`，不归 Production L2。

Docs Editor 的模板空间和空间权限细节见 `docs/engineering/reference/docs-editor-template-spaces.md`。
