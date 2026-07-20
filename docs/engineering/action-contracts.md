# Action Contract

ActionContract 是业务 action 的完整契约。它回答同一个问题：某个 action 在页面、校验、API、流程和最终写库之间是不是同一件事。

## 分层

| 层 | 含义 | 规则 |
|---|---|---|
| `resource` | 属于哪个 L2/resource，直写、提交、处理分别用什么权限动作 | 不从页面位置推断权限 |
| `payload` | 单条/批量、全字段/字段补丁/变更集、新记录/已有记录 | 流程草稿不能只保存展示摘要 |
| `persistence` | 写入策略：正式表状态、审批 payload、独立草稿表 | 审批通过写正式表前仍要走 domain 校验 |
| `form` | 表单 adapter 和 payload 版本 | 业务页和流程详情页复用同一个表单 adapter |
| `domain` | domain validator / commit 的事实来源 | 不维护第二套审批校验 |
| `api` | 普通 API、流程 API、统一 envelope 版本 | 普通写入也尽量按 action envelope 迁移 |
| `workflow` | 是否可接流程、默认节点、可配置范围、请求可撤回/修订/删除/重发 | 后台只能展示 contract 允许的配置 |
| `display` | 流程标题、摘要和跳转目标 | 只做展示，不替代 payload |

## Action 类型

读取类暂时不做流程：`entry`、`read`、`audit`、`export`。

控制、治理类暂时不做流程：`lock`、`unlock`、`grant`、`configure`、`apiuse`、`share`。

业务写入类是重点：`create`、`import`、`update`、`revise`、`save`、`delete`、`archive`、`reverse`、`submit`、`approve`、`reject`。其中 `submit/approve/reject/reverse` 是流程处理动作时，不能再当作新的业务申请入口。

## Payload

单条记录用 `cardinality=single`，通常是完整表单。

批量修改用 `cardinality=batch`，并声明 `shape=field_patch` 或 `change_set`、批次内原子性和允许修改的字段。批量提交不是简单多个 submit 按钮，而是同一个 action 下多条 item 的提交 envelope。

## Persistence

`active_table_state`：流程状态直接在业务正式表上表达，适合天然有草稿/提交/通过状态的业务对象。

`approval_payload`：流程记录持有完整 payload，通过后复制或 patch 到正式表。适合 HR 基础资料这类不希望污染正式表的申请。

`draft_table`：独立草稿表承载未生效数据，通过后写正式表。适合复杂表单或需要长期编辑的申请。

## Workflow

Workflow contract 只定义能力边界和默认定义，不保存管理员当前设置。

后台 WorkflowPolicy 是运行配置：开关、处理人来源、职责分离、请求能否撤回/删除/重发等。后台只能在 contract 的 `configuration` 范围内显示选项；如果 action 已经 workflow-ready 但缺少 contract，显示“配置异常”，不能保存策略。

节点设置属于 workflow contract 的一部分，但分两层：

| 内容 | 放哪里 |
|---|---|
| V1 支持几个节点、哪些节点类型、哪些审批人来源、是否允许豁免 | ActionContract |
| 某个租户/管理员当前选择谁处理、是否开启、是否允许撤回/删除/重发 | WorkflowPolicy |

## 运行时约束

- `workflow.validateOn` 是 Approval engine 的运行规则，不是说明性 metadata。`draft` 在写入流程草稿前、`submit` 在状态迁移前、`commit` 在抢占为 `committing` 后分别调用同一个业务 adapter validator。
- submit / commit 重验只能规范化 payload，不能改变已冻结的 `businessActionKey`、`resourceKey`、`scopeId` 或 `subjectId`。身份漂移必须 fail closed。
- `ApprovalRequest.sourceActionContractVersion` 与当前 contract 版本不一致时，submit / commit 返回 `409`，由发起人基于当前 contract 重新提交，不能把旧 payload 静默写入新语义。
- `commitApprovedPayload()` 只接受 Approval engine 在原子抢占成功后签发的一次性 capability；capability 同时绑定 request id、claimed version 和 business action，不能用字符串或裸 helper 伪造“已批准”。
- direct command 必须把 `direct` 语义显式传到最终 service guard；不得给 `workflow-approved` 设置默认值，也不得让 direct 路径借审批 bypass 跳过对象级权限。
- commit 重验或正式写入失败时，engine 追加 `commit_failed` 并把请求恢复到 `submitted`；不会留下永久 `committing`，也不会执行批准状态迁移。

## 覆盖与检查

ActionContract registry 必须与 BusinessAction registry 一一对应；完整清单由 `docs/generated/action-contracts.md` 生成，不在本页维护易过期的手写样板。

`npm run action-contract:check` 对缺失/重复 contract、domain binding、真实 route、direct/workflow route 双向映射和 persistence/form/runtime 矩阵执行 hard fail。`npm run test:contract` 负责 command binding、一次性批准 capability、route binding 和 ActionRuntime 的行为证据；两者都通过才可把 action 视为已接入。
