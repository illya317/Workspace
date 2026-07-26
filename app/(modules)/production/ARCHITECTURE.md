# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.entry` |
| 产品主档 | `/production/products` | `production.products.entry` |
| 批次检验 | `/production/qc` | `production.qc.entry` |
| 批次阶段确认 | `/production/qc/[batchId]/[stageKey]` | `production.qc.entry` |
| 批次检测项目 | `/production/qc/[batchId]/[stageKey]/[testName]` | `production.qc.entry` |

## 模块边界

Production 负责产品主档维护和 QC / 批检验执行：

- `Product` 承载制剂身份，`InventoryItem` 承载具体 SKU 与包装/库存属性，`ProductSourceMapping` 保存旧 ERP、入库报单、发货和成本来源别名。
- `/production/products` 是产品与 SKU 的唯一人工维护入口；Inventory 只读取 SKU 并维护库存事实，不再创建物料卡片。
- 产品、SKU 和来源名称都保留稳定 FK；无法唯一匹配的来源进入待关联，不按模糊名称猜测。
- 承接 pharma-ops 的批次检验、检验记录和运行时 QC 配置读取。
- QC 模板浏览、编辑、复制和官方发布入口由文档中心 `/docs/editor` 承接，不再作为 Production L2 暴露。
- 库存轻台账不再作为生产管理入口开放；旧库存 API 已移除。

## pharma-ops 迁移原则

第一阶段做 Workspace 入口、权限、官方模板快照、批次台账和记录页面。QC 官方模板由 `/docs/editor` 发布，Production 运行态只读取批次快照中的 docs editor document。

批次执行数据落在 PostgreSQL 的 `ProductionQcBatch`、`ProductionQcFieldValue`、`ProductionQcSignature` 和 `ProductionQcAuditEvent`。历史 `WORKSPACE_CONFIG_DIR/data/qc.json` 只作为一次性迁移源；迁移必须先运行 `production:qc:file-state:migrate` dry-run，再显式运行 `production:qc:file-state:migrate:execute`。

QC 执行模块的持久化不变量：

- 创建批次时固化官方模板快照和 SHA-256；后续模板发布不得改写既有批记录。
- `ProductionQcBatch.templateId -> DocumentTemplate.id` 使用 `ON DELETE RESTRICT` 约束模板身份并保护仍被批次引用的模板；模板快照和哈希继续作为批次执行真相，模板更新不得回写历史批次。
- 所有更新、签名和删除都提交 `expectedVersion`，由 Serializable 事务和版本条件共同阻断 lost update。
- 字段值由服务端按模板字段类型、选项和公式校验；公式结果由服务端重算并作为 `source=formula` 的字段值保存。
- 电子签名按次追加，保存账号 ID、可用时的员工编号、操作者姓名、签名含义、服务端时间、记录版本、认证方式和被签记录哈希；root admin 无员工档案时以“管理员”签名且员工编号留空，普通账号仍必须绑定员工。签名不覆盖历史签名，Personal API Key 不得执行签名动作。
- `ProductionQcAuditEvent` 只允许 INSERT，数据库 trigger 阻断 UPDATE/DELETE。测试阶段批次允许硬删除，但删除前必须把完整记录快照写入审计账，审计账不与批次建立级联 FK。

当前已接入：

1. `packages/production/server/qc/` 读取已发布的 docs editor QC 官方模板，并在创建批次时固化模板快照。
2. `packages/production/ui/qc/` 承载 QC 批次与检验记录 UI；桌面端保留纸面预览，移动端把同一 document slice 映射为原生章节表单。`app/(modules)/production/qc/*` route 只做鉴权、必要预取和挂载 package component。
3. `/production/qc` 提供批次创建、批次台账、检验状态和记录入口。
4. `/production/qc` 展示批次队列和当前批次阶段入口；不再保留独立的 `/production/qc/[batchId]` 中间页。
5. `/production/qc/[batchId]/[stageKey]` 使用 docs editor document 的阶段切片展示检验前确认；桌面端显示纸面记录，移动端先选章节再进入满宽字段表单。同阶段检验前确认和检测项目是一个记录工作台的平级页签，不互相作为解锁前置。
6. `/production/qc/[batchId]/[stageKey]/[testName]` 使用 docs editor document 的检验项目切片展示记录；桌面端保留纸面预览，移动端按标题、表格行和字段模型转换成章节化原生表单。公式、引用、只读、选项、字段值和保存/复核仍由同一 docs field model 与 QC workflow 驱动，不另建移动端数据协议。
7. `/api/modules/production/qc*` 提供 PostgreSQL 批次台账读写接口；route 只解析身份/请求，事务、版本、校验、签名和审计收口在 `packages/production/server/qc/batches.ts`。
8. `/docs/editor` 从租户 profile 指向的私有 QC 模板快照目录同步官方模板，并按 profile 中的 QC 组织身份解析目标部门空间，负责模板空间、纸面编辑、复制、发布和权限管理。
9. Workspace 云端 Agent 可通过 Docs Editor 自有工具按自然语言查询、分段检查、完整编辑和发布 QC 官方模板；完整编辑覆盖 `document + fieldModel` 内的章节、表格、行列、字段、公式与引用。写入只在请求人和虚拟员工都具备具体空间权限时直接执行，不创建 Agent 审批提案，也不绕过 Docs Editor 领域校验或必须走流程的业务配置。

QC 批次页面只使用批次固化的 docs editor 模板快照。模板编辑器入口不再通过 Production L2 暴露。

QC 记录页的响应式边界是展示层边界：`QcEditorRuntimePaper` 只在桌面 section 渲染，`QcEditorRuntimeMobile` 只在移动 section 渲染；两者必须复用 `qc-editor-runtime-field` 的字段解析和同一 `values/onFieldChange`，不能分别保存、计算或定义字段。移动端章节目录使用 Core `BodySurface.mobilePresentation="drilldown"`，避免缩放 A4、横向表格或一次铺开整份记录。

后续迁移目标：

1. 在生产验证前把 `active_session` 电子签名升级为可配置的新鲜认证/二次认证策略。
2. 把检验限度、条件必填、附件和异常/OOS 路由继续沉淀为 Workspace 原生运行时能力。

## 工作空间轻代码读取模型

Production owner 登记产品、待关联来源、SKU、来源映射，以及 QC 批次、签名、动态字段值、批次模板快照分区目录和分段字段共 9 个版本化 source。产品目录与 QC 接口中的稳定数组关系按 child source 展开；批次详情只是这些已登记事实的单批次组合，不建立第二套口径。完整产品来源映射显式使用 `ownerDerived / boundedRelationSnapshot`：产品 GET 只提供原 `production.products.read` 授权合同，owner 直接按映射 ID 升序分页读取 `ProductSourceMapping`，返回真实 total，并在超过 4,000 行时 fail closed；它不沿用产品页面为交互速度设置的每产品 100 条和 pending 200 条载荷上限，也不扩大原 GET/UI 返回。两个模板快照 source 显式使用 `ownerDerived / partitionedSnapshot` adapter：批次详情 GET 只提供原授权合同，不声称响应里存在分页 rows/total，也不得声明 `workspace.api` v2 的 directRows 等价迁移。公开批次快照中的 `document + fieldModel` 先按必填 `batchId + section` 列出稳定分区目录，再由必填 `batchId + section + segment` 按 `ordinal/path/value` 读取；对象 key 使用与 locale 无关的 Unicode code-point 顺序、数组保持原顺序、每段最多 1,000 个叶子，共同保证全部分区可确定性拼回原快照，同时任一执行只读取一个批次、一个 section、一个有界分段，不会先展开全库模板。字段名称、单位、范围、公式、规则和公开模板正文均保留；二进制文件内容、写入命令和审批控制仍不进入分析源。

Production 目前没有可信的个人、部门或项目归属外键，所以三类空间都使用诚实的 `workspace` scope：用户仍须分别通过原接口的 `production.products.read` 或 `production.qc.read`，看到的是其在原业务模块可见的全公司事实，不得标成“本部门生产”或“本项目生产”。字段敏感级不会形成第二次读取限制；导出仍必须走独立导出权限和策略。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.products` | 产品、SKU、包装和来源映射维护 |
| `production.qc` | 批次检验、记录填写、提交复核 |
| `docs.editor` | QC 官方模板浏览、复制、编辑和发布 |

页面入口使用注册路由对应的资源权限。

QC 批次 API 权限动作：

- GET：`production.qc.read`
- POST `/api/modules/production/qc`：`production.qc.create`
- PATCH `/api/modules/production/qc/[batchId]`：`production.qc.update`，只用于保存检验前确认和检验项目记录
- DELETE `/api/modules/production/qc/[batchId]`：`production.qc.delete`；当前测试阶段保留硬删除，但必须提交版本并追加删除审计
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
