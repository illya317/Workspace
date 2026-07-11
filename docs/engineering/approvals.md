# 通用审批链

更新时间：2026-07-06
Owner：Platform / Architecture；业务 adapter 由对应 Feature owner 维护

## 定位

通用审批链是 Platform server 能力，用来承载跨模块可复用的审批流程。Platform 负责审批单、事件链、状态机、流程节点运行、并发版本检查和通知触发；业务模块只提供 payload 校验、访问判定、通知收件人、展示描述和审批通过后的正式落库逻辑。

当前版本支持审批节点 tree、排他/包容/并行 gateway、分支条件和会签式 `approvalMode = all`。仍不做转办、独立评论系统或正式数据删除申请。

## 分层

| 层 | 负责 | 不负责 |
|---|---|---|
| Platform approval engine | `ApprovalRequest` / `ApprovalEvent`、状态迁移、事件落库、版本检查、通知触发、通用 DTO | 业务字段校验、业务对象写入、业务权限细节 |
| Business adapter | payload 形状和业务校验、谁能发起/审批/评论、谁收到通知、标题摘要链接、approve 后 commit | 自己维护审批状态机、直接写通知表 |
| API route | 认证、请求形状、调用 adapter service、返回 JSON | Prisma 写入、业务状态机、绕过 adapter 直接审批 |
| UI | 草稿、提交、审批、事件链、评论和业务草稿展示 | 把通知 acknowledge/reject 当成审批同意/驳回 |

公共 server 入口是：

```ts
import {
  createDraft,
  submit,
  revise,
  withdraw,
  cancel,
  comment,
  reviewUpdate,
  approve,
  reject,
  listRequests,
} from "@workspace/platform/server/approvals";
```

业务 route-command 不应逐个重复注入同一个 adapter。使用 `bindApprovalLifecycle(adapter)` 绑定 `createDraft/revise/submit/withdraw/cancel/comment/approve/reject`；其中 `revise` 统一按当前状态选择发起人修订或处理人审核修改。Work OKR 等业务状态副作用仍留在业务 command 中，不能下沉进 Platform 生命周期。

## 数据模型

`ApprovalRequest` 是审批单当前态：

- `resourceKey` / `scopeId`：审批归属的权限资源和空间，例如 `space.department.tasks` + `department:1`。
- `businessActionKey`：注册表中的 base 流程行为；不再按部门、公司或委员会空间派生 `space.*` 流程 key。
- `subjectType` / `subjectId`：业务对象类型和对象 ID；新建审批可以没有 `subjectId`。
- `operation`：当前为 `create | update`。
- `status`：`draft | submitted | withdrawn | rejected | approved | cancelled`。
- `latestPayloadJson`：当前待审批 payload 快照，不是正式业务数据。
- `workflowNodesJson`、`activeWorkflowNodeKey`、`activeWorkflowNodeKeysJson`、`workflowJoinStateJson`：审批流 tree 快照、当前可处理节点和 gateway join 进度。
- `submitterUserId`、`submittedAt`、`resolvedByUserId`、`resolvedAt`：发起和处理信息。
- `committedEntityType` / `committedEntityId` / `committedAt`：审批通过并成功写入正式业务数据后的回写结果。
- `version`：乐观并发版本；审批动作可以传 expected version，版本不一致返回 409。

`ApprovalEvent` 是 append-only 流转记录：

- `sequence` 在同一审批单内递增，作为事件链顺序依据。
- `eventType` 当前为 `create_draft | submit | withdraw | revise | review_update | approve | reject | cancel | comment | commit_failed`。
- `comment` 同时承载审批动作备注和自由评论。
- `payloadJson` 是事件发生时的 payload snapshot；纯评论可以为空。

## 状态机

| 动作 | 允许来源 | 目标状态 | 说明 |
|---|---|---|---|
| `createDraft` | 无 | `draft` | 创建草稿并写 `create_draft` 事件 |
| `submit` | `draft`, `withdrawn`, `rejected` | `submitted` | 提交后通知审批人 |
| `revise` | `draft`, `withdrawn`, `rejected` | 不变 | 发起人修订草稿或被驳回内容 |
| `withdraw` | `submitted` | `withdrawn` | 发起人撤回 |
| `cancel` | `draft`, `submitted`, `withdrawn` | `cancelled` | 取消后不能继续评论 |
| `reviewUpdate` | `submitted` | 不变 | 审批人可先修改 payload，再 approve/reject |
| `approve` | `submitted` | 下一个节点或 `approved` | 完成当前活动节点；若正向路径结束，先调用 adapter commit，成功后记录通过；失败写 `commit_failed` |
| `reject` | `submitted` | `rejected` | 驳回后同一审批单可 revise + resubmit |
| `comment` | 非 `cancelled` | 不变 | 只追加 `comment` 事件 |

`approve` 只沿 workflow tree 的同意路径前进。`reject`、`withdraw`、`cancel` 和重新 `submit` 是审批单全局状态动作，不是 BPMN 图中的分支。排他/包容 gateway 没有条件命中时，流程提交或继续流转会失败，不会默认走第一条分支。

`submit` 和 `approve` 权限不互斥。同一个用户同时有两个权限时，可以提交后再审批同一条审批单；是否做职责分离由 `separationPolicy` 收窄。

## Adapter Contract

业务 adapter 必须实现 `ApprovalAdapter<TPayload>`：

- `subjectType`：业务对象类型，例如 `work.task`。
- `validatePayload(input)`：把不可信请求 payload 转成已校验的 `ApprovalPreparedPayload`。这里应复用业务 domain validator，并补充 FK、状态、归属、引用可见性校验。
- `resolveAccess(input)`：判断 actor 对 `listRequests/createDraft/submit/revise/withdraw/cancel/comment/reviewUpdate/approve/reject` 是否有权限。
- `resolveRecipients(input)`：按事件决定通知收件人；Platform 会去重并过滤 actor 本人。
- `describeRequest(input)`：返回通知和 UI 可用的 `title/summary/href`。
- `commitApprovedPayload(input)`：只在 approve 时执行正式业务写入，返回 `{ entityType, entityId }`。

业务 adapter 不应该直接写 `ApprovalRequest`、`ApprovalEvent` 或 `Notification`。审批事件只能通过 Platform approval engine 追加，通知只能通过 notification registry 的 `sendNotification(type + payload)`。

## 通知和评论

审批模块只发送四类通用通知：

- `approval.request.submitted`
- `approval.request.rejected`
- `approval.request.approved`
- `approval.request.commented`

通知标题、正文、链接和默认重要性由 `packages/platform/server/notifications.ts` 的 registry 渲染。通知只跳转审批详情或业务页上的审批详情，不把通知的 acknowledge/reject 当作审批同意/驳回入口。

V1 不做独立评论系统。审批备注和自由评论都写入 `ApprovalEvent.comment`；自由评论使用 `eventType = comment`，不支持编辑、删除或线程。

## Work Task Adapter

首个业务 adapter 是组织空间 `work.tasks` 的 WorkItem 新建/修改审批，入口在 `packages/work/server/task-approvals.ts`。

适配规则：

- `subjectType = "work.task"`。
- 只支持组织空间：`department`、`committee`、`company`；personal 空间不走审批流。
- 权限资源使用空间注册表派生的 resource key：
  - `space.department.tasks`
  - `space.company.tasks`
  - `space.committee.tasks`
- service guard 通过 Work access helper 走 `evaluatePermissionAction(..., { scopeId, projection: "space" })`，不要再用 `work.tasks` + scope 猜父级。
- 有直接 `create/update` 权限时，UI 继续显示“保存”并直接写正式 WorkItem。
- 有 `submit` 权限时，UI 显示“提交审核”；`submit` 和直接写权限同时存在时两个按钮都显示。
- 有 `approve` 权限时，可 `reviewUpdate`、`approve`、`reject`。
- approve 时复用 WorkItem create/update domain validator 和 service；成功后把正式 WorkItem id 写回 `ApprovalRequest.committedEntityId`。
- 引用项目、项目阶段或项目任务时，adapter 必须校验 actor 可见对应项目；审批流只降低 WorkItem 写入授权要求，不放开项目引用可见性。

Work task submissions API：

```txt
GET  /api/modules/work/tasks/submissions
POST /api/modules/work/tasks/submissions
PUT  /api/modules/work/tasks/submissions/:id
POST /api/modules/work/tasks/submissions/:id/submit
POST /api/modules/work/tasks/submissions/:id/withdraw
POST /api/modules/work/tasks/submissions/:id/cancel
POST /api/modules/work/tasks/submissions/:id/comment
POST /api/modules/work/tasks/submissions/:id/approve
POST /api/modules/work/tasks/submissions/:id/reject
```

## 新 Adapter 接入清单

1. 定义业务 payload 类型和 `subjectType`，确认 `operation` 是否只需要 `create/update`。
2. 在业务包 server 层实现 adapter，复用现有 domain validator 和 service。
3. `resolveAccess` 使用业务自己的对象级 guard，不在 route 或 UI 里补业务授权。
4. `resolveRecipients` 返回审批人、发起人或相关人，不直接写通知。
5. `describeRequest` 返回稳定 href；通知和列表都使用它。
6. `commitApprovedPayload` 只做 approve 后的正式落库，并返回可追踪的实体类型和 ID。
7. API route 只做认证、请求形状、调用 service、返回 DTO。
8. UI 展示当前草稿、事件链、评论和动作按钮；提交、保存、审批按钮按权限分别展示。
9. 增加状态迁移、事件顺序、权限分离、通知 registry 和业务 commit 的测试或检查。
