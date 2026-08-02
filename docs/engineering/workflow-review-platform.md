# Workflow Review Platform

本文只记录流程复核平台的工程契约。当前版本已经落地业务行为注册表、`WorkflowPolicy` 策略表、Approval engine 流程语义扩展、NotificationBell 分层和流程状态 UI 第一版。业务页面原地处理入口仍按模块逐步接入。

## 业务行为注册表

源码入口：`packages/platform/business-action-registry.ts`。

业务行为注册表描述“用户可见的业务写库动作”，例如保存工作计划、保存 QC 检验记录、保存文档模板。它不是 RBAC 权限动作表；新权限动作字典在 `packages/platform/action-registry.ts`，当前运行时仍由 `packages/platform/permission-actions.ts` 和 permission policy 执行。注册项只通过 `directPermissionAction`、`submitPermissionAction`、`processPermissionAction` 引用当前运行时 RBAC action，用来说明直接写入、提交流程和处理流程时分别需要哪类权限。

注册项核心口径：

| 字段 | 含义 |
|---|---|
| `key` | 稳定业务行为 key，不等同于 API path 或 RBAC action。 |
| `moduleKey` / `resourceKey` | 行为归属的模块和 RBAC resource。 |
| `writeKind` | 业务动作类别。保存、提交、复核、发布、归档等都可以是独立业务 action；流程处理动作不能冒充新的申请入口。 |
| `eligibility` | `workflow_optional`、`workflow_required`、`permission_only`、`internal`。 |
| `flowType` | 业务流程语言：`approval`、`review`、`publish`。仅 workflow eligible 行为需要。 |
| `workflowCategoryKey` | 流程业务分类；必须引用 Platform workflow category registry，不得由各页面自行推断。 |
| `separationPolicy` | 提交人与处理人的关系：`independent_required`、`auto_pass_if_authorized`。后台只保留“是/否”两种配置。 |
| `apiRoutes` | 当前 API route 覆盖；与 ActionContract command/direct route 双向校验，同一路由承载多个行为时必须登记为 typed dispatcher。 |
| `notes` | 当前缺口、保守判定或后续迁移说明。 |

`eligibility` 的边界：

- `workflow_optional`：该保存类行为支持接入流程，但注册默认是不接流程；只有管理员显式配置后才由 workflow 接管。
- `workflow_required`：保存类行为语义上应进入流程，典型是 QC 检验记录保存后的双人复核。
- `permission_only`：只受权限控制，不进入 workflow V1；删除、归档、导出默认先归为此类。
- `internal`：系统维护写入、缓存刷新、seed/migration 或流程事件自身，不进入业务流程设置。

首批注册覆盖 Work tasks、Docs editor templates、Production QC、HR roster，并给 Finance 关键校对/导入动作提供种子项。流程设置页只展示已适配的保存类入口；未适配或不适用的资源不在树里宣传为可选流程。

检查脚本：`node --import tsx scripts/check/check-business-action-registry.ts`。

脚本已接入 domain gate 并强制未登记写 API 与 workflow readiness 缺口为零。真正不落库的 POST/DELETE 必须以 method + route 精确声明理由；permission management、submission/workflow event 和 internal cache 等系统路由继续按受控路径族排除。

业务行为注册表首版明确不做：

- 不在注册表文件里直接读取数据库、判断权限或执行业务保存。
- NotificationBell 只做轻量流程收件箱，不承载流程通过/驳回动作。
- 业务页面原地入口按 Work、Docs、QC、HR、Finance 分批迁移，不由 Platform UI 自己猜业务字段。
- 不让业务包反向维护第二套 workflow/action registry。

## Workflow readiness projection

源码入口：`packages/platform/workflow-action-readiness.ts`。

流程 readiness 是业务行为注册表之上的 Platform 投影，不是第二套业务行为 registry。它回答“contract 是否声明了可接入的执行路径”，不创建新动作、不替代 RBAC、不查询数据库策略，也不能单独作为生产运行证明。

流程定义、默认节点、路由、职责分离和修改权限统一来自 ActionContract。`workflow.kind` 是唯一能力判别：`not_applicable` 表示动作固有地不可接流程，`configurable` 表示通用审批请求，`native` 表示业务原生状态流转；不要再组合 `capable/readiness/adminConfigurable` 推断。`workflow-action-readiness.ts` 只把合同投影为 readiness 和 warning，不再维护或编译独立的 workflow definition；策略解析由 `packages/platform/server/workflow-contract-defaults.ts` 从同一合同生成默认值。

readiness V1 只维护 warning/展示所需事实：

| 字段 | 含义 |
|---|---|
| `workflowIntent` | 该动作的流程意图：默认流程、可选接入、权限直写、不适用或内部行为。 |
| `workflowReadiness.state` | `ready`、`partial`、`not_ready`、`not_applicable`。 |
| `executionPath` | `approval_request`、`native_business_state` 或 `ui_status_only`。 |
| `evidence` | contract 所声明的 adapter、直写 guard、批准后落库、提交路由、状态 UI、台账路径等接入面；真实数据流另由 checker 与行为/integration test 证明。 |
| `workflowProductState` | Admin UI 的产品状态基础值，例如未设置、默认启用、未接入、不适用。 |

事实边界：`configurable` 使用通用 `ApprovalRequest`，`native` 使用业务原生状态机，`not_applicable` 不进入流程设置。删除、归档、导出、审批处理等是否可接流程必须逐 ActionContract 声明，不能按 `writeKind` 全局猜测。readiness 全绿只代表声明面完整；route payload 传播、三阶段校验、权限 guard 和批准后写入仍必须由 `action-contract:check`、`test:contract` 及相关 integration test 覆盖。

检查脚本 `node --import tsx scripts/check/check-business-action-registry.ts` 同时校验 route 覆盖和 readiness，任何 default-flow/opt-in readiness gap 都会阻断 domain gate。QC 原生复核通过 ActionContract 声明 `native_business_state` 证据；不得只改 readiness 常量绕过 contract。

## Workflow node tree

源码入口：`packages/platform/server/workflow-policy-nodes.ts`、`packages/settings/ui/admin/tabs/WorkflowPoliciesGraphModel.ts`、`packages/settings/ui/admin/tabs/WorkflowPoliciesBpmnXml.ts`。

`WorkflowPolicy.workflowNodesJson` 保存审批流 tree，不再使用旧的扁平 incoming/route 图。管理员在 BPMN 画布中维护正向通过路径；后端运行时会把 tree 编译成临时 split / branch approval / join 图，不把编译图写回数据库。

节点模型：

| 节点 | 运行语义 |
|---|---|
| `approval` | 一个审批节点，按 `assignees` 和 `approvalMode` 派单。 |
| `gateway` | 成对的 split / join，`gatewayKind` 为 `exclusive`、`inclusive` 或 `parallel`。 |
| branch | gateway 下的分支；分支本身也是审批节点，先进入分支审批人，再串行执行 `children`。 |

gateway 分支选择规则：

| gatewayKind | 分支规则 |
|---|---|
| `exclusive` | 按分支顺序选择第一个条件命中的分支。 |
| `inclusive` | 激活所有条件命中的分支，并在 join 等待全部命中分支到达。 |
| `parallel` | 激活全部分支，不读取条件。 |

排他和包容网关没有隐式兜底：若没有任何分支条件命中，提交或继续流转返回流程路由错误，不会默认走第一条分支。管理员应显式覆盖实际业务场景；当前产品暂不提供“默认分支”。

条件只支持当前显式建模字段：`company` 和 `department`。同一分支内多条件按字段分组：同字段多个值是 OR，不同字段之间是 AND。空条件不视为命中；parallel 分支不保存运行条件。

Approval engine 仍只在通过路径上读取 workflow tree。`reject`、`withdraw`、`cancel`、`resubmit` 是审批单全局状态动作，不是 BPMN 图里的分支；UI 也在审批节点说明中明确这条边界。运行中改策略不会改写已存在审批单快照。

## Workflow server / policy resolver

源码入口：`@workspace/platform/server/approvals`、`@workspace/platform/server/workflows`。

现阶段继续复用 `ApprovalRequest` / `ApprovalEvent` 表名，避免把已有 Work approval API 和历史数据迁移风险一次放大。`ApprovalRequest` 新增流程语义快照字段：

| 字段 | 含义 |
|---|---|
| `businessActionKey` | 业务行为 key；旧 adapter 未显式传入时使用 `${subjectType}.${operation}`，历史行默认 `legacy.approval`。 |
| `flowType` | `approval`、`review`、`publish`，只表达业务显示和事件语义，不替代权限。 |
| `separationPolicy` | `independent_required`、`auto_pass_if_authorized`。 |
| `handlerSource` | 审批人来源快照，例如直属上级、部门负责人或有处理权限者。 |
| `requestCanWithdraw` | 提交后、处理前，发起人是否可撤回请求。 |
| `requestCanResubmit` | 被驳回后，发起人是否可在同一流程记录中重新提交。 |
| `requestCanCancel` | 处理前，发起人是否可删除请求；不要求业务删除权限。 |
| `requestCanRevise` | 在 `draft`、`withdrawn`、`rejected` 状态，发起人是否可修订请求；不要求业务修订权限。 |
| `sourceWorkflowPolicyId` / `sourceWorkflowPolicyVersion` | 创建请求时采用的流程策略来源；后续策略变化不覆盖。 |
| `sourceActionContractVersion` | 创建请求时采用的 ActionContract 版本。 |
| `sourceOkrControlVersion` | OKR 请求创建时采用的时间管控版本；非 OKR 请求为空。 |

`WorkflowPolicy` V1 按 `businessActionKey` 生效。表里仍保留 `scopeType/scopeId` 兼容旧 schema，但流程设置 API 固定写入 `global + ""`，不会让管理员配置具体部门/公司/委员会范围。resolver 调用形态为：

```ts
resolveWorkflowPolicy({
  businessActionKey,
  resourceKey,
  actorUserId,
  defaults,
});
```

resolver 只合并数据库策略和调用方默认值；它不读取 RBAC grant。首次创建流程草稿和处理人身份仍由业务 adapter 提供上下文；审批单一旦创建，发起人的 `submit/withdraw/revise/cancel` 则只按请求快照、当前状态和发起人身份判定，不再叠加正式资料的写入、修订或撤回权限。业务页面当前选择的部门/公司/委员会属于业务上下文，只能在 adapter、收件人解析和业务 guard 中使用，不能参与流程策略匹配。`WorkflowPolicy` 每次 upsert 都递增版本并写 EditHistory 快照；关闭流程只改变模式，必须保留已有 `workflowNodesJson` 和请求自助策略，重新开启时不得丢失原拓扑。

ActionContract 把过去混在一个开关里的三件事显式拆开：

| 字段 | 含义 |
|---|---|
| `canDisable` | 管理员是否允许关闭该流程；为 `false` 时旧的关闭策略也会被 resolver 收敛回启用。 |
| `whenDisabled` | 关闭后的运行结果：`direct_write` 继续按权限保存，`unavailable` 则没有新入口且 API 拒绝执行。 |
| `entrySemantics` | `form_finalization` 是同一编辑表单的最终动作，`explicit_submission` 是独立业务提交，`domain_transition` 是原生状态机动作。 |

运行矩阵固定如下：

| 入口语义 | 流程启用 | 流程关闭 |
|---|---|---|
| `form_finalization` | 同一表单只显示“提交”，取代“保存” | `direct_write` 时同一表单只显示“保存”；`unavailable` 时不显示入口 |
| `explicit_submission` | 显示“提交”并创建真实流程单 | 不显示入口；合同 gate 禁止配置成 direct write |
| `domain_transition` | 使用 ActionContract 定义的业务动词和原生状态机 | 按合同决定是否允许关闭；不得伪装成普通表单保存 |

### 统一 mutation executor 与表单动作

保存类写入使用 `@workspace/platform/server/business-action-executor` 作为统一切换缝：调用方只提供业务行为 key、direct 授权/commit 回调和可选 Approval adapter。executor 按 adapter 的领域校验解析同一个策略；流程启用时只创建并提交 `ApprovalRequest`，正式资料只能由 `commitApprovedPayload()` 写入；流程关闭时仅 `whenDisabled=direct_write` 才执行 direct 授权和正式表写入，`whenDisabled=unavailable` 必须返回 409，不能偷偷降级。业务 domain service 还要在实际 Prisma mutation 前执行同一 direct guard。审批 bypass 不是公开字符串约定：engine 只有在把指定 request/version 原子抢占为 `committing` 后才签发绑定 action 的一次性 capability，approved command seam 消费成功后才可进入正式写入；direct helper 必须显式传递 `direct`，不能沿用或默认成 `workflow-approved`。归档、删除等 `permission_only` 行为不复用保存流程，也不能和保存字段混在同一次 mutation 中。

历史 direct route 尚未迁到 executor 时，必须调用同文件导出的 `assertBusinessActionDirectExecutionAllowed()`；Work、HR department、Docs editor 不再各自复制策略判断。新 route 不应继续采用“先直写，发现启用流程后返回 409”或“前端自行改打 submissions API”的双路径。

读模型通过 `resolveBusinessActionRuntime()` 返回 `ActionRuntime`。页面不再用 `canUpdate || canSubmit` 猜测按钮：

- direct + 正式写权限：表单声明 `record.save` 和 `form.cancel`；
- workflow + 发起权限：同一表单声明 `workflow.request.submit` 和 `form.cancel`；
- unavailable：不返回保存或提交 action，UI 不渲染入口，写 API 同样拒绝；
- 已提交的发起人按请求快照得到 withdraw/revise/resubmit/cancel；
- 处理人得到 approve/reject，以及策略允许时的 reviewUpdate。

Platform UI 的 `actionRuntimeCommands()` 只把 runtime action 映射为语义 command，不声明 icon、variant 或顺序；表单再交给 `workflowActionSurfaceActions()` 生成 `FormSurface.actions`。图标、样式和固定排序始终由 Core Action registry / FormSurface 渲染层决定。Work 工作节点、HR 组织单元、HR 绩效和 Docs 模板是 runtime + FormSurface 的贯通样板；不适用流程的动作继续 direct，workflow eligible 动作自动随有效策略切换。HR 绩效属于 workflow-only 多阶段写入：新建/编辑仍只进入本地写入态，最终由 request runtime 映射提交、再次提交、通过或驳回，撤回/取消申请才是列表上的显式生命周期动作。

标准页面级新建流统一声明 `PageSurface.create`，局部新建流声明 `CreateSurface trigger="surface"`，不另设 workflow-inline 版本。Platform UI 的 `actionRuntimeCreateSubmission()` 将 direct runtime 映射为 `save`，将 workflow runtime 映射为 `submit`。入口归属和 presentation 不改变流程语义。

创建类型需要预选时使用 `CreateSurface flow.kind="two-stage"`。第一段只有选择字段，第二段仍按最终业务 action runtime 决定保存或提交；第一段不得另设保存动作或独立布局。

多 section 与 anchor 不改变流程语义或表单格式：`sections` 只替换单 form 内容树，`anchor` 只决定 block 内容 target。最终保存或提交仍由同一个 CreateSurface submission 和 ActionRuntime adapter 决定。

`npm run arch:action-runtime-ui` 对全部业务 UI 和 app shell 执行阻断：页面不得用 `workflowEnabled` / `canSubmitWorkflow` 等权限布尔值或条件表达式选择保存/提交，不得在 CreateSurface 硬编码提交，也不得在同一动作区并列两个持久化出口。`npm run action-contract:check` 同时校验上述三态 runtime 矩阵，并阻止“声明关闭后 direct write、却没有 active persistence/direct form”或“显式提交关闭后仍 direct write”的伪合同。审批处理、发布、结案等显式业务状态流转继续按各自 ActionContract 呈现，不与同一表单的保存/提交替换关系混为一谈。

策略匹配优先级：

1. `businessActionKey + global + ""`。
2. 调用方 defaults。

流程策略在产品语义上拆成两个互斥维度：

| 维度 | 可选值 | 含义 |
|---|---|---|
| 流程接入 | 不接流程 / 接入流程 | 是否由流程策略接管该行为。 |
| 职责分离 | 是，必须他人处理 / 否，有处理权自动处理 | 仅接入流程后生效，决定提交人能否自动连续完成处理动作。 |

数据库仍用 `WorkflowPolicy.mode` 存储 V1 运行值，映射如下：

| `mode` | UI 展示 | 运行语义 |
|---|---|---|
| `permission_only` | 不接流程 | 只按权限动作控制，不生成流程单。 |
| `direct` | 不接流程 | 旧值兼容，按不接流程处理。 |
| `optional` | 接入流程 | 旧值兼容，按接入流程处理；保存策略时统一写回 `required`。 |
| `required` | 接入流程 | 禁止直接写入正式数据，必须提交流程后处理。 |

无数据库策略时，以 ActionContract 的 `defaultExecutionMode` 为唯一运行事实：`direct` 解析为不接流程，`workflow` 解析为接入流程；BusinessAction 的 eligibility 只是管理投影，不再独立决定执行模式。

管理入口位于 `/settings/admin` 的“流程管理 -> 设置”子 tab。产品界面只提供一个统一流程入口，左侧按“流程分类 -> 流程”组织 workflow-eligible base business action；源业务模块只保留为工具栏筛选。部门、公司、委员会等空间不再派生流程行为或独立策略入口。

统一入口维护流程接入、流程语义、职责分离、审批人来源和请求自助动作，不展示具体 `scopeId`。不接流程时只保存流程接入状态，其余流程字段不参与运行。无论请求来自个人、部门、公司还是委员会，同一业务操作始终使用注册表中的单一 `businessActionKey`；`resourceKey/scopeId/projection` 只表达权限与单据归属，不参与策略选择。

同一“流程管理”分组下还提供统一的“台账”子 tab，复用相同的分类树，并按选中的 `businessActionKey` 展示 `ApprovalRequest` 摘要。

流程业务分类由 `packages/platform/workflow-category-registry.ts` 统一注册，`BusinessActionRegistration.workflowCategoryKey` 是唯一归属字段。当前已使用考核、文档、人事、协作、质量五类；财务、行政、采购、合同、IT 先保留注册项，空分类不展示。设置、台账和收件箱不得各自维护另一份分类映射。

流程管理授权由 `packages/platform/workflow-management-resources.ts` 统一投影为三层 capability：

1. `settings.admin.workflow`：管理全部流程。
2. `settings.admin.workflow.category.<categoryKey>`：管理分类下当前及未来流程。
3. `settings.admin.workflow.action.<businessActionKey>`：只管理单一流程。

三层资源都只支持 `configure`，不支持 `grant`，也不授予业务 `submit/approve/reject`。IT/信息部门负责人岗位默认拥有 workflow root；其余员工、岗位或部门由 IT/root 在通用权限矩阵中按分类或单流程授权。流程设置和流程台账通过同一 `workflow-admin-access` interface 计算 effective action set；分类管理权、提交范围、审批人来源和业务空间归属互相正交。

旧的普通业务 resource `configure` 会在 permission action normalization 阶段精确迁移到 action capability；旧 space/scoped workflow configure 直接清理，不恢复空间流程管理入口。

管理 API 为 `/api/settings/admin/workflow-policies`：

| 方法 | 说明 |
|---|---|
| `GET` | 返回 base 业务行为、当前策略行和可选枚举。 |
| `PUT` | 按 `businessActionKey` upsert 流程策略。 |
| `DELETE` | 删除流程策略，恢复注册默认。 |

`PUT` body 固定使用当前所选 base action 的 `businessActionKey`，不接受 scope 字段：

```ts
{
  businessActionKey: string;
  mode: "permission_only" | "required";
  flowType: "approval" | "review" | "publish";
  separationPolicy: "independent_required" | "auto_pass_if_authorized";
  handlerSource: "direct_manager" | "department_owner" | "permission";
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  workflowNodes?: WorkflowPolicyNode[];
}
```

`workflowNodes` 使用上文的 tree 模型：顶层是 `approval` 或 `gateway` 数组；gateway 的 `branches` 最少 1 个、最多 3 个，每个分支保存 `conditions`、`assignees`、`approvalMode` 和嵌套 `children`。

流程台账 API 为 `/api/settings/admin/workflow-ledger`：

| 方法 | 说明 |
|---|---|
| `GET` | 按 `businessActionKey`、`status`、分页参数返回流程请求摘要。 |

Approval engine 的职责分离规则只保留两种：

- `independent_required`：提交人不能执行 `reviewUpdate`、`approve` 或 `reject`。
- `auto_pass_if_authorized`：`submit` 时如果 actor 同时通过 adapter 的 `approve` 授权，会先写 `submit` 事件，再调用正式 commit，成功后追加通过事件；通过事件可按 `flowType` 展示为审批、复核或发布结果。没有处理权限则停留在 `submitted` 等审批人处理；commit 失败仍保留 `commit_failed` 事件，状态停留在 `submitted`。

请求自助动作按审批单快照执行，不受后续策略修改影响：

- `requestCanWithdraw`：允许提交人在 `submitted` 且尚未处理时撤回。
- `requestCanResubmit`：允许提交人在 `rejected` 后重新 `submit`，事件链保留在同一请求内。
- `requestCanCancel`：允许提交人在 `draft`、`submitted`、`withdrawn` 时删除请求，落 `cancel` 事件和 `cancelled` 状态。
- `requestCanRevise`：允许提交人在 `draft`、`withdrawn`、`rejected` 时修订请求；它与撤回、重发能力独立，不要求正式资料的修订权限。

审批人来源 V1 开放“直属上级”“部门负责人”和“有权限者”。“直属上级”按发起人的当前任职记录 `reportTo` 解析在职员工并映射到用户；“部门负责人”由部门负责人岗位解析，当前仅对能落到部门上下文的流程生效；两者解析不到人员时回退到“有权限者”，避免流程提交后无人可处理。“有权限者”由 adapter 的 `approve` 判权和通知收件人解析决定；`review/publish` 只作为流程显示语义或业务结果，不作为权限 action。

正式 commit 前会先把 request 从 `submitted` 原子抢占到内部短暂状态 `committing`。抢占后，engine 按 ActionContract `validateOn=commit` 使用提交者身份重跑 adapter validator，并验证 action/resource/scope/subject 与 request 快照一致；contract 版本变化或业务状态失效都会写 `commit_failed` 并回到 `submitted`。验证成功后才签发绑定 request id、claimed version 和 businessActionKey 的一次性 capability，并调用业务 `commitApprovedPayload()`，避免两个处理人同时通过或普通 server helper 伪造批准上下文。commit 失败同样回到 `submitted`；成功后从 `committing` 转到 `approved`。`committing` 期间不允许评论或其他状态动作。

业务 adapter 可以继续只实现 Approval V1 contract；需要覆盖默认值时，可在 `ApprovalPreparedPayload` 或 adapter `workflowDefaults` 中传 `businessActionKey`、`flowType`、`separationPolicy`、`mode` 或 `handlerSource`。`scopeType/scopeId` 可以继续作为审批单归属和业务判权上下文，但不参与流程策略选择。空间业务仍用空间 `resourceKey + scopeId + projection: "space"` 判权，审批单的 `businessActionKey` 必须使用 base action。

当前 Work task submission adapter 已写入默认 `businessActionKey`。普通工作节点历史审批 key 继续兼容运行时；目标配置入口按 8 个显式 action 展示：

| 操作 | businessActionKey | scope/resource |
|---|---|---|
| 部门期初目标提交 | `work.tasks.goal.department.objective.submit` | 组织空间使用 `space.department.tasks` / `space.company.tasks` / `space.committee.tasks` 资源和 `projection: "space"` |
| 个人期初目标提交 | `work.tasks.goal.personal.objective.submit` | 个人计划的审批归属可投影到其管控部门空间 |
| 部门期初目标修订 | `work.tasks.goal.department.objective.revise` | `changeTarget=okr_plan` |
| 个人期初目标修订 | `work.tasks.goal.personal.objective.revise` | `changeTarget=okr_plan` |
| 部门考核结果提交 | `work.tasks.goal.department.report.submit` | 使用同上组织空间资源 |
| 个人考核结果提交 | `work.tasks.goal.personal.report.submit` | 个人考核结果可投影到其管控部门空间 |
| 部门考核结果修订 | `work.tasks.goal.department.report.correct` | `changeTarget=work_report` |
| 个人考核结果修订 | `work.tasks.goal.personal.report.correct` | `changeTarget=work_report` |

OKR 的日期控制不是第二套流程开关。目标截止只约束 `objective.submit`，结果截止只约束 `report.submit`，并且仅在对应 ActionRuntime 为 workflow 时生效；关闭流程或停用时间管控只让规则失效，不删除设置或范围例外。每个 OKR `WorkPlan` 创建时固化上述四类动作的完整 policy、ActionContract 版本、关闭行为和 OKR 设置/范围策略版本；后续全局配置不得反向改变存量计划。管理员迁移存量计划必须显式选择计划并填写原因，未结束流程、已完成、已关闭或已归档计划拒绝迁移，前后快照写入 `WorkPlanGovernanceEvent`。新 `ApprovalRequest` 同时保存 policy/contract/OKR 来源版本，已经存在的请求继续使用请求自身快照。

普通工作项的 personal 空间不进入旧通用 submission adapter；上表四个 personal OKR 动作使用各自显式 adapter。组织空间仍由业务 guard 判断能否首次发起以及谁是处理人，已有请求的发起人生命周期动作由 Platform engine 按状态和策略快照执行。

## Notification 分层

源码入口：`packages/platform/server/notifications.ts`、`app/api/settings/account/notifications/route.ts`、`packages/platform/ui/NotificationBell.tsx`。

通知列表支持 `category` / `filter` 查询：

| 参数 | 可选值 | 说明 |
|---|---|---|
| `category` | `all`、`ordinary`、`workflow`、`approval`、`review`、`publish` | 区分普通通知、流程通知和流程类型。 |
| `filter` | `all`、`todo`、`originated` | 流程通知下区分待我处理和我发起相关。 |

账户收件箱的三个视角固定为：

- 普通通知：`category=ordinary`，保留原有确认、拒绝、已读和清除能力。
- 我收到的：`category=workflow&filter=todo`，聚合当前用户实际可处理的流程；保留已接入流程的就地处理能力，每条记录另提供业务页面入口。
- 我发起的：`category=workflow&filter=originated`，直接按 `ApprovalRequest.submitterUserId` 查询本人全部流程记录，不依赖是否生成过通知；记录行进入注册的业务页面。

通知确认/拒绝仍然只是通知处理，不等同于流程通过/驳回。流程通知在 UI 上不展示通知确认/拒绝按钮，流程动作必须回到业务原页面或后续通用嵌入组件执行。

收件箱不查询模块业务表，不把通知中心做成第二套流程引擎；received 从通知和已注册 todo provider 聚合，originated 直接读取 Platform `ApprovalRequest`。DTO 的 workflow 信息包含 `flowType`、`status`、`role`、`requestId`、`businessActionKey`、`categoryKey/categoryLabel`、`resourceKey`、`scopeId`、`href`、`title`、`summary`。分类一律由 business action registry 关联的 workflow category registry 解析，前端不得按 href 或 resource key 猜测。

兼容通知类型仍使用 `approval.request.*`，但流程语义必须以 payload `flowType` 为准。评论通知只用于提醒；“我发起的”事实源始终是审批单本身，处理人待办则由 active notification/provider 汇总。

## 流程状态 UI

状态事实源是 `packages/platform/workflow-status.ts`；`packages/platform/ui/WorkflowStatusBadge.tsx` 只负责图标和样式呈现。

Platform UI 提供 `WorkflowStatusBadge` 和 `WorkflowStateIcon`，统一支持：

- `status`：`draft`、`submitted`、`in_review`、`rejected`、`withdrawn`、`approved`、`published`、`cancelled`、`failed`。
- `flowType`：`approval`、`review`、`publish`。

组件根据 `flowType + status` 自动派生中文文案、颜色和 ActionGlyph 图标。业务页面后续只消费 Platform UI 组件，不在 Work/QC/HR/Docs/Finance 页面里重复维护状态文案或图标表。

## 原地流程接入模式

流程处理优先留在业务原页面，不把 NotificationBell 做成第二个审批中心。当前分三类原地接入：

| 页面类型 | 接入方式 | 当前入口 |
|---|---|---|
| QC 检验/复核 | 使用 `flowType="review"`，文案保持“检验/复核”。批次、阶段、检验项目的真实签名状态映射到 `WorkflowStatusBadge`，不跳独立审批页。 | `packages/production/qc/workflow.ts`、`packages/production/ui/qc/QcBatchRecordStageList.tsx` |
| HR 表单类 | 使用醒目的状态横幅 + 底部 sticky action bar 样板；组件只消费外部传入的 workflow state/actions，不主动请求流程数据。 | `packages/hr/ui/workflow/HrWorkflowInline.tsx` |

原地组件的共同规则：

- 有真实业务状态时只做映射，例如 QC 双签名、Finance review status。
- 没有 `ApprovalRequest` / workflow request 数据源时，只做 props-driven reusable component，不造假数据、不隐藏写入副作用。
- QC 与 Finance 的语义是 `review` / 复核 / 校对，不显示为审批。
- HR 类表单后续接入时，页面顶部必须可见状态，底部动作条承载保存、提交、撤回、驳回、通过等操作；实际可用动作统一消费 Platform action runtime，不再由业务页面或 adapter 重复解释。
