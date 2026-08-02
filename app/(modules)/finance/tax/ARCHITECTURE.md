# Finance Tax 税务管理架构

## 注册 interface

| 项目 | 事实 |
|------|------|
| L2 route | `/finance/tax` |
| resource | `finance.tax` |
| canonical API prefix | `/api/modules/finance/tax` |
| owner package | `@workspace/finance` |
| lifecycle | `workspace-owned` |

稳定 view keys：

| View key | 页面语义 |
|----------|----------|
| `accrual` | 按公司、税种和期间维护税费计提工作底稿 |
| `filing-payment` | 申报、应缴、实缴及缴款证据 |
| `reconciliation-evidence` | 税表、缴款、总账之间的差异与证据闭环 |

这些 key 是 route shell、业务 UI 和关账 deep link 共用的稳定 interface；UI 不得再创建另一套同义 tab key。

## Owner 与事实边界

税务管理是独立 Finance L2，不属于总账会计。它拥有：

- 税务期间、税种、纳税主体和税辖区范围内的计提工作底稿与来源追溯。
- 申报状态、申报金额、应缴金额、实缴金额、缴款日期和申报/缴款证据引用。
- 税表、缴款、总账之间的勾稽差异、处置结论、责任状态和证据版本。
- 支撑税费关账的事实状态、阻断项和可追溯证据，不以总账净余额替代税务明细。

`finance.ledger` 继续拥有税费凭证、科目余额和过账结果。税务管理引用这些凭证和余额完成勾稽，但不复制总账或直接改写余额。`finance.statements` 继续拥有合并抵销事项的税务影响；合并层递延所得税不是本 L2 的普通纳税申报事实。

数据库保存来源事实、稳定关联、状态和追溯字段；应缴与实缴差异、累计金额和展示汇总由 Finance server 从事实行计算。原始或 normalized 文件是导入证据，不是运行时 UI schema。

## 权限 interface

`finance.tax` 当前只支持：

- `entry` / `read`：进入 L2、读取税务工作底稿、申报缴款和证据。
- `create` / `update`：维护计提、申报、缴款和差异处置事实。
- `export`：外发当前查询范围的税务台账或关账证据包，必须显式授权。

本阶段不注册 `delete/import/revise/submit/approve/lock/unlock`。受控数据导入不等同于页面 `import` 权限；删除、重算、审批、报税提交和期间锁定只有在 Phase 3 证明真实命令与状态机后，才能连同 action policy、domain validator 和测试一起加入。

## 与其他台账及关账的 seam

- 存货数量、计价和存货关账事实仍由 `inventory.operations` 拥有。税务管理未来可通过 Platform contract 引用进销存或发票证据，但不得 import Inventory 实现或复制存货台账。
- 关联方目录由 External/Capital/HR 的既有 owner 维护；关联方财务余额与对账仍归 `finance.ledger`，不是 Tax 或 Close 的平行台账。
- `finance.assets` 继续拥有资产卡片、会计折旧/摊销和账面结转；`finance.tax` 拥有资产相关税务口径、税法折旧/摊销参数及税会差异证据，但不复制资产台账或重算会计折旧。
- 关账视图是聚合 consumer，不是税务台账 owner。它只读取期间状态、阻断项、证据引用、关联凭证和 deep link，不复制或修改计提、申报、缴款和勾稽事实。

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

## 当前实现状态

Tax 已作为独立 Finance L2 进入运行面，而不是总账会计下的占位模块：

- `/finance/tax` route shell 负责鉴权、默认公司期间和 `create/update` 权限投影，并挂载 package UI。
- `/api/modules/finance/tax` 已提供 `GET/POST/PUT`；`/api/modules/finance/tax/reference-options` 提供受控引用候选读取。
- 写入链路按 `Zod schema -> domain validator -> service/Prisma` 收口，route 不承载税务业务判断。
- `finance.tax.workspace.create/update` 已登记 BusinessAction 与 ActionContract；module registry、API guard、permission action policy 和 RBAC resource 使用同一 `finance.tax` 边界。
- UI 只消费已注册 API；关账 contributor 只读取税务期间事实、阻断项和证据，不反向修改 Tax 台账。
- 新建税务事项使用页面 CreateSurface block；编辑事项时在当前页签内用声明式 analysis/fields 区块替换业务内容，保留公司、期间和页签上下文，不打开业务弹窗。

尚未登记的删除、导入、重算、审批、报税提交和期间锁定仍不属于当前 contract；新增这些能力时必须同时补齐状态机、权限动作、API contract、domain validator 和测试。
