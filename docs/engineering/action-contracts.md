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

## V1 样板

当前首批已登记：

| Action | 状态 | 说明 |
|---|---|---|
| `hr.roster.department.create` | 可配置 | 表单、domain、API、approval payload、单节点审批 contract 已声明 |
| `hr.roster.position.create` | 无流程配置 | 表单、domain、API 已声明；runtime 仍是权限直写，未接流程 |

历史 action 缺 contract 暂时是 warning-only 债务；`npm run action-contract:check` 会列出缺口。
