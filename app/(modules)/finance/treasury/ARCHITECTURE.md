# Finance Treasury 资金管理架构

## 注册 interface

| 项目 | 事实 |
|------|------|
| L2 route | `/finance/treasury` |
| resource | `finance.treasury` |
| canonical API prefix | `/api/modules/finance/treasury` |
| owner package | `@workspace/finance` |
| lifecycle | `workspace-owned` |

稳定 view keys：

| View key | 页面语义 |
|----------|----------|
| `bank-accounts` | 银行账户主档与状态 |
| `bank-reconciliation` | 银行余额、总账余额、未达项及对账证据 |
| `loans` | 借款合同事实、余额和还款计划 |
| `interest` | 利率期间、计息明细、计提与实付勾稽证据 |

这些 key 是 route shell、业务 UI 和关账 deep link 共用的稳定 interface；UI 不得再创建另一套同义 tab key。

## Owner 与事实边界

资金管理拥有以下 Workspace 事实：

- 银行账户主档，包括所属公司、账户标识、银行、币种、启停状态和来源追溯。
- 期间银行对账工作底稿，包括银行余额、总账余额、未达项、差异结论和证据引用。
- 借款合同及计划，包括出借方/借款方、币种、本金、起止日、利率条款、还款计划和来源追溯。
- 期间利息工作底稿，包括计息基础、适用利率、期间、计算结果、计提/实付勾稽和证据引用。

数据库保存来源事实、稳定关联、状态和追溯字段；可由本金、利率和日期稳定派生的利息结果由 Finance server 统一计算，并保存计算版本或输入指纹作为关账证据。不得为了复刻 Excel 把合计、小计或展示列直接变成独立事实。

`finance.ledger` 继续拥有凭证、科目余额和过账结果。资金管理只能引用相关凭证和余额，不复制总账，不直接改写总账余额；后续需要形成凭证时，通过明确的 Finance 内部 posting seam 生成提案或引用，不能让 UI 双写两套账。

## 权限 interface

`finance.treasury` 当前只支持：

- `entry` / `read`：进入 L2、读取主档、工作底稿与证据。
- `create` / `update`：维护银行账户、对账工作底稿、借款与利息事实。
- `export`：外发当前查询范围的资金台账或关账证据包，必须显式授权。

本阶段不注册 `delete/import/revise/submit/approve/lock/unlock`。受控数据导入不等同于页面 `import` 权限；删除、重算、审批和期间锁定只有在 Phase 3 证明真实业务命令与状态机后，才能连同 action policy、domain validator 和测试一起加入。

## 与其他台账及关账的 seam

- 存货数量、计价和存货关账事实仍由 `inventory.operations` 拥有；资金管理不导入 Inventory 实现。后续需要付款或关账佐证时，通过 Platform contract 或稳定证据引用读取。
- 关联方目录由 External/Capital/HR 的既有 owner 维护；关联方财务余额与对账仍归 `finance.ledger`。资金管理只在借款或银行流水事实中保存稳定主体引用，不创建平行关联方主档。
- 资产折旧摊销继续由 `finance.assets` 独立拥有，本 L2 不改变其页面、数据或权限。
- 关账视图是聚合 consumer，不是资金台账 owner。它只读取期间状态、阻断项、证据引用、关联凭证和 deep link，不复制或修改银行对账、借款与利息事实。

后续关账 contributor 应通过小 interface 暴露：

```txt
inspectPeriodClose(scope)
  -> status
  -> version
  -> blockers[]
  -> evidenceRefs[]
  -> voucherRefs[]
  -> deepLink
```

实现可留在 Finance package 内部；跨业务 owner 时必须通过 Platform contract，不允许业务包之间直接 import。

银行回单检查与银行余额对账是两个独立 contributor。回单检查按期间适用银行账户逐户要求存在本期银行对账底稿，并具备覆盖期末（期间内销户账户覆盖至销户日）的 `evidenceRef`，或同时具备来源类型、SHA-256 及发布/文件标识的受治理来源追溯。余额已对平不能替代回单证据；对账差额由银行余额对账 contributor 单独阻断。没有期间适用账户时以 `applicable: false` 明示不适用；会计期间缺失仍 fail-closed。

## 当前实现状态

- `/finance/treasury` 页面和 `/api/modules/finance/treasury` 已投入使用；主 API 提供 GET、POST、PUT，`/api/modules/finance/treasury/reference-options` 提供受范围约束的引用候选读取。
- API route 保持薄壳：使用 Treasury Zod schema 校验请求形状，经 `route-commands.ts` 调用 domain validator，再由 `service.ts` 在 Prisma 事务中读取或写入事实。浏览器和 route shell 不重算资金业务事实。
- 新增、更新已分别登记 `finance.treasury.workspace.create`、`finance.treasury.workspace.update` BusinessAction 与 ActionContract；模块 API prefix、`finance.treasury` resource policy 和 create/update RBAC 同步生效。
- 页面 UI 消费上述已注册 API，并复用稳定 view keys；引用字段统一消费 reference-options，不在客户端维护平行主数据。
- 关账已接入 `finance.treasury.receipts`、`finance.treasury.reconciliation`、`finance.treasury.interest` 三个独立 contributor，分别验证回单证据、银行对账和借款利息事实。
