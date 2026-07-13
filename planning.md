# 流程复核平台改造计划

日期：2026-07-02
Owner：Coordinator / Architecture / Platform；业务接入由对应 Feature owner 维护
状态：执行中

## 目标

把现有单步 `ApprovalRequest` 能力升级为全局可复用的“流程复核平台”。平台统一管理写库行为注册、流程策略、状态链、通知分层、状态图标和通用 UI 入口；业务模块只声明自己有哪些写入行为、选择什么流程、payload 怎么校验、正式数据怎么保存、原地页面如何承载。

## 术语

| 术语 | 含义 |
|---|---|
| 业务行为 | 一个具体写库业务动作，例如保存 OKR 计划、保存节点、保存汇报、发布文档模板、QC 复核。 |
| 权限动作 | RBAC 能力，例如 `write`、`submit`、`approve`、`grant`。它不是业务行为。 |
| 流程类型 | 业务语义，例如审批、复核、发布。 |
| 职责分离策略 | 是否要求提交人和处理人不是同一人。 |
| 原地处理 | 用户在业务页面上下文里完成提交、复核、驳回、修订等动作。 |
| 轻量流程收件箱 | 通知中心里的流程 tab，只显示 summary、状态和跳转，不复制业务详情页。 |

## 核心设计

### 1. 业务行为注册表

新增 Platform 级业务行为注册表，覆盖所有用户可见的数据库写入行为。不是所有行为都走流程，但都要能被列出来、设置、审计和检查。

注册项建议字段：

```ts
type BusinessActionRegistration = {
  key: string;
  label: string;
  moduleKey: string;
  resourceKey: string;
  scopeTypes?: Array<"personal" | "department" | "committee" | "company">;
  writeKind: "create" | "save" | "update" | "delete" | "archive" | "submit" | "review" | "publish" | "import" | "export" | "system";
  targetKind: string;
  eligibility: "workflow_optional" | "workflow_required" | "permission_only" | "internal";
  defaultFlowType?: "approval" | "review" | "publish";
  separationPolicy?: "independent_required" | "self_allowed" | "auto_pass_if_authorized";
  directPermissionAction?: string;
  submitPermissionAction?: string;
  processPermissionAction?: string;
  iconStateProfile?: string;
  originHrefPattern?: string;
  notes?: string;
};
```

口径：

- 纳入：业务模块中用户触发的 create/save/update/delete/archive/import/publish/submit/review 等写库行为。
- 暂不纳入：登录 session、通知已读、审批/流程事件自身、审计流水、seed/migration、内部缓存刷新。
- 删除/归档 V1 标记为 `permission_only`，先继续用权限控制。
- 已有历史行为必须补注册，后续新增写 API 如果没有注册应被检查拦住或至少 warning。

### 2. 流程类型和职责分离分开

流程类型描述业务语言：

| 类型 | 显示语义 | 例子 |
|---|---|---|
| `approval` | 提交审批、同意、驳回 | OKR 保存、模板发布审核 |
| `review` | 提交检验/复核、复核通过、复核驳回 | QC 双人复核 |
| `publish` | 提交发布、发布通过、已发布 | Docs 模板发布 |

职责分离策略描述提交人和处理人关系：

| 策略 | 行为 |
|---|---|
| `independent_required` | 必须另一个有处理权限的人通过。适合 QC、财务关键复核。 |
| `self_allowed` | 同一个人如果同时有提交和处理权限，可以自己点通过。适合普通 OKR/Docs 审批。 |
| `auto_pass_if_authorized` | 提交人有处理权限时自动生成提交+通过两条事件并提交正式数据，避免点两次。 |

无论是否自动通过，都不能绕过事件链；自动通过也要保留完整 `submit` + `approve/review/publish` 事件。

### 3. 流程策略设置

在 `/settings/admin` 增加主 tab：`流程设置` 和 `流程台账`，和 `权限管理 / 授权台账 / 模块管理` 平级。流程只保留一个统一入口，不再区分普通流程 / 空间流程。

设置维度：

- 业务行为：来自注册表。
- 策略：直接保存、允许提交流程、必须走流程、仅权限控制。
- 流程类型：审批、复核、发布。
- 职责分离策略：必须分离、允许同人、授权自动通过。
- 处理人来源：拥有处理权限的人、部门负责岗位、指定岗位、业务 adapter 自定义。

流程按注册表中的 base `businessActionKey` 维护全局策略。业务页面当前选择的部门/公司/委员会只作为 adapter 判权、单据归属和处理人解析上下文，不参与策略匹配。

流程分类由 Platform registry 统一维护，现有流程先映射到考核、文档、人事、协作、质量五类；财务、行政、采购、合同、IT 分类预留。空间资源仍保留 `tasks` / `projects` / `templates` 权限投影，但不再派生流程行为或独立策略。

DB 先沿用 `WorkflowPolicy`，V1 固定写入 `businessActionKey + global + ""`。未配置时使用注册表默认策略。

### 4. 流程引擎

现有 `ApprovalRequest` / `ApprovalEvent` 可作为 V1 基础，但语义应逐步中性化：

- 添加 `businessActionKey`
- 添加 `flowType`
- 添加 `separationPolicy`
- 添加 `originHref`
- 添加 `stateLabelProfile` 或从注册表派生

中期可以保留表名 `ApprovalRequest` 以降低迁移风险；公共 API 和 UI 命名先转为 `workflow`。等使用稳定后再评估是否重命名表。

### 5. Notification 分层

不新建重审批中心。扩展 `NotificationBell`：

- tab 1：普通通知
- tab 2：流程待办
- tab 3：我发起的

流程 tab 只展示轻 summary：标题、业务来源、状态、发起人、最近事件、时间、入口按钮。

通知的确认/拒绝仍只表示通知处理，不代表流程通过/驳回。流程动作必须在业务原地页面或通用嵌入组件里执行。

### 6. 前端改造模式

#### A. 左右分栏 / 工作台类

适用：Work tasks、Docs editor、Work projects。

做法：

- toolbar 加 micro segmented：全部、待处理、我发起、已通过、已驳回。
- 列表行和详情头部显示统一 `WorkflowStatusBadge`。
- 右侧详情原地显示提交/撤回/修订/通过/驳回按钮。
- 不再每个业务页复制审批列表和状态机。

#### B. 表格列表 + 详情类

适用：Finance、Production QC 批次列表。

做法：

- 表格加 `流程状态` 列。
- 表格筛选接入流程状态。
- 详情页顶部放状态条，底部或右上角放动作按钮。
- QC 文案使用 `检验/复核`，不叫审批。

#### C. 表单详情类

适用：HR 这类大表单。

做法：

- 表单顶部增加醒目的流程状态横幅：状态、发起人、时间、最近意见、处理人。
- 被驳回时横幅红色，提示可修订后重新提交。
- 底部 sticky action bar 放保存草稿、提交、撤回、通过、驳回。
- 变更字段可选高亮，但 V1 不强制做复杂 diff。

#### D. 轻量弹窗/配置页类

适用：简单配置、模板小改动。

做法：

- 保存按钮旁显示状态 badge。
- 提交/通过动作使用统一小弹窗填写备注。
- 点击通知回到原配置入口并打开对应记录。

### 7. 统一状态图标

平台提供 `WorkflowStatusBadge` / `WorkflowStateIcon`：

| 状态 | 推荐 icon | 颜色 | approval 文案 | review 文案 | publish 文案 |
|---|---|---|---|---|---|
| `draft` | edit | gray | 草稿 | 草稿 | 草稿 |
| `submitted` | send | amber | 待审批 | 待复核 | 待发布审核 |
| `in_review` | shield-check | blue | 审批中 | 复核中 | 发布审核中 |
| `rejected` | x-circle | red | 已驳回 | 复核驳回 | 发布驳回 |
| `withdrawn` | undo | slate | 已撤回 | 已撤回 | 已撤回 |
| `approved` | check-circle | emerald | 已通过 | 已复核 | 已通过 |
| `published` | archive/upload-cloud | green | 已归档 | 已归档 | 已发布 |
| `cancelled` | ban | gray | 已取消 | 已取消 | 已取消 |
| `failed` | alert-triangle | red | 提交失败 | 复核失败 | 发布失败 |

## Agent 分配

| Agent | 角色 | 范围 | 产出 |
|---|---|---|---|
| Coordinator/Reviewer | 本线程 | 计划、拆包、冲突处理、最终 review、提交前检查 | `planning.md`、任务包、review 结论 |
| Agent A | Architecture | 业务行为注册表、流程策略 contract、历史债扫描规则 | Platform registry/types/check/doc |
| Agent B | Data/Platform server | WorkflowPolicy schema、ApprovalRequest 扩展、workflow engine policy resolver | Prisma/schema/server API |
| Agent C | Platform UI | NotificationBell 分层、WorkflowStatusBadge、轻量流程列表组件 | Platform UI |
| Agent D | Work/Docs Feature | 左右分栏类接入样板，Work tasks 优先，Docs editor 如时间允许 | business action 注册和原地入口 |
| Agent E | Production/QC Feature | QC submit/check/review 语义调研和 review 流程接入方案/实现 | QC mapping |
| Agent F | HR Feature | HR 表单类 UI 接入方案，优先输出组件 contract，谨慎改页面 | form pattern |
| Agent R | Independent Review | 最终 diff 审查：绕过、权限、状态、通知、UI 重复实现 | review findings |

## 分阶段执行

### Phase 0：计划和边界

- 写入本计划。
- 开启 `.planning/2026-07-02-workflow-review-platform`。
- 派发只读/小范围子 agent，先确认文件和冲突。

### Phase 1：注册表及历史债

- 新增 business action registration contract。
- 补 Work/QC/Docs/HR/Finance 关键写入行为的首批注册。
- 写扫描脚本，至少能列出未登记的业务写 API。
- 注册历史行为时标明 `workflow_optional`、`workflow_required`、`permission_only`、`internal`。

### Phase 2：流程复核平台 server

- 在现有 approval engine 上增加 business action 和 flow type。
- 增加 policy resolver。
- 实现职责分离策略：必须分离、允许同人、授权自动通过。
- 保持旧 Work approval API 可运行，逐步转 workflow vocabulary。

### Phase 3：Notification 分层

- Notification registry 增加流程分类元数据。
- Notification API 支持 category/tab/filter。
- NotificationBell 增加普通通知、流程待办、我发起的。
- 流程通知点击跳原地页面，不做通知内通过/驳回。

### Phase 4：统一状态 UI

- Platform UI 增加 `WorkflowStatusBadge` / `WorkflowStateIcon`。
- 把图标、颜色、文案按 flow type 自动派生。
- 提供可嵌入的轻量流程 action panel。

### Phase 5：业务接入样板

- Work tasks：保存 OKR 计划、保存计划修改、保存节点、保存汇报，按 policy 决定保存或提交流程。
- Docs editor：模板发布/保存行为注册并接入 badge。
- QC：复核语义映射为 review flow，保持原地复核。
- HR：先接入表单状态横幅和 sticky action bar contract，具体业务行为按风险逐步接。

### Phase 6：Review 和收口

- 独立 review。
- 检查直接写 API 是否绕过 policy。
- 检查业务是否重复实现流程状态机。
- 跑 `db:generate`、`db:seed:resources`、`check:data`、`check:arch`、`typecheck:quick`；按实际改动补 `check:changed` 或更重检查。

## Reviewer 风险清单

- 不能把所有复核硬叫审批，QC 必须保持复核语义。
- 不能让 notification acknowledge/reject 变成流程通过/驳回。
- 不能只有 UI 控制，直接写 API 必须被 policy resolver 拦住。
- 自动通过必须写完整事件链，不能静默落正式数据。
- 业务 adapter 不得直接写通知表或流程事件表。
- 平台 UI 提供组件和状态，不拥有业务 payload 编辑器。
- 删除/归档暂不进流程，避免扩大范围。
- 注册表不能和 RBAC action 混淆。

## 本次落地状态

已落地：

- Phase 1 首批业务行为注册表、workflow eligibility 标记、历史写 API 扫描脚本。
- Phase 2 server 基座：`WorkflowPolicy`、`ApprovalRequest` workflow 字段、职责分离策略、自动通过、`committing` 防双写状态。
- Phase 3 notification 分层：普通通知、流程待办、我发起的；流程通知不在通知里执行同意/驳回。
- Phase 4 基础状态 UI：`WorkflowStatusBadge` / `WorkflowStateIcon`。
- `/settings/admin` 流程设置入口：可查看业务行为注册表、维护 `WorkflowPolicy` 覆盖策略、恢复默认。
- Work tasks 适配器已接入 workflow 默认策略和组织空间派生资源口径。
- Agent C 原地流程样板：
  - QC 批次、阶段、检验项目已把真实检验/复核状态映射为 `flowType="review"` 的统一 badge。
  - HR 新增表单状态横幅和底部 sticky action bar props-driven 样板。
  - Finance 的独立校对流程样板已随模块删除，不再作为 workflow 接入示例。
  - 补登记 HR 员工详情合同/部门岗位保存等历史写入行为。

未在本次完成：

- Work OKR 计划、节点、汇报等所有保存入口的全量提交流程改造。
- Docs 原地流程 UI 接入，以及 HR/Finance 从样板到真实 workflow request 数据源的全量落地。
- 历史写 API 注册表的 blocking ratchet；当前扫描仍是 warning-only。
