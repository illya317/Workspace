# 财务重分类工作流重构计划

## 背景

当前重分类已经有一条技术链路：

```text
FinanceAccount.reclassTargetCode
  -> buildReclassResults()
  -> ReclassResult 审核
  -> 资产负债表消费 approved / adjusted 结果
```

但这个形态还没有完全贴合实际业务：

- 规则被单独放在“重分类规则”Tab，脱离了科目设置。
- 审核被单独放在“重分类审核”Tab，脱离了凭证明细。
- 规则只靠 `FinanceAccount.reclassTargetCode`，表达不了“公司 + 年份 + 科目 + 借贷方向 + 目标报表项目/科目”。
- 系统还没有在科目设置中置顶“本年凭证明细里借贷方向异常”的科目。
- 凭证明细还不能直接展示、编辑、确认某条明细的重分类建议。
- 事实数据、规则数据、最终审核结果需要更清晰地分层，避免导入覆盖人工判断。

本计划目标是把重分类从“独立功能页”收敛为财务总账里的自然工作流：

```text
科目设置：维护科目级默认规则
凭证明细：查看和审核明细级重分类结果
财务报表：只读消费最终确认结果
```

## 总目标

### 1. 科目设置承载规则

在 `科目设置` 中增加重分类视图/筛选：

- 公司 + 年份筛选后，系统扫描该年度已过账凭证明细。
- 优先置顶“借贷方向与科目常规方向相反”的科目。
- 展示异常方向、异常金额、建议目标科目、当前规则、启用状态。
- 用户可以确认、修改或清除规则。
- 用户也可以搜索任意科目，手动配置特殊规则。

示例：

```text
公司：丰华生物
年份：2026
科目：1221 其他应收款
异常方向：贷方
异常金额：94,336.88
建议目标：2241 其他应付款
用户确认：1221 credit -> 2241
```

### 2. 凭证明细承载审核

在 `凭证明细` 中增加重分类筛选与编辑能力：

- 显示系统按规则生成的重分类建议。
- 支持筛选：全部、待重分类、已确认、已调整、已驳回、异常方向。
- 支持在某条凭证明细上继续细化目标科目、金额、备注。
- 支持手工将某条凭证明细加入重分类。

### 3. 财务报表只读消费结果

资产负债表只消费最终确认结果：

- `approved`
- `adjusted`

报表页不编辑规则、不审核明细、不触发生成。

## 核心原则

1. DB 存事实、规则、审核结果，不存临时展示计算。
2. 导入只写事实，不覆盖人工规则和人工审核结果。
3. 系统建议可以重复生成，但已人工处理的结果不能被自动覆盖。
4. 科目级规则是默认规则，明细级结果可以覆盖默认规则。
5. 报表只消费最终结果，不参与决策。

## 目标数据模型

### 事实表

继续使用现有事实表：

- `FinanceAccount`
- `FinanceVoucher`
- `FinanceVoucherItem`
- `FinancePeriod`

事实表只保存外部导入或业务原始事实，例如：

- 科目编码、名称、余额方向、公司、年份
- 凭证号、日期、摘要
- 分录借方、贷方、科目
- 凭证明细 `relatedEntity`

### 规则表

新增 `FinanceReclassRule`。

建议字段：

```prisma
model FinanceReclassRule {
  id                Int      @id @default(autoincrement())
  companyCode       String?
  year              Int
  sourceAccountCode String
  abnormalSide      String   // debit | credit
  targetAccountCode String
  enabled           Boolean  @default(true)
  source            String   @default("manual") // suggested | manual
  confirmedBy       Int?
  confirmedAt       DateTime?
  note              String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @default(now()) @updatedAt

  confirmer User? @relation("FinanceReclassRuleConfirmer", fields: [confirmedBy], references: [id])

  @@unique([companyCode, year, sourceAccountCode, abnormalSide])
  @@index([companyCode, year])
  @@index([sourceAccountCode])
}
```

说明：

- `companyCode + year + sourceAccountCode + abnormalSide` 唯一。
- 同一个科目可以理论上同时有 debit 和 credit 两种异常规则，但实际通常只会有一侧。
- `source="suggested"` 表示系统根据异常方向生成过建议。
- `source="manual"` 表示用户手动配置。
- 规则表替代长期使用 `FinanceAccount.reclassTargetCode` 的方案。

### 结果表

继续使用 `ReclassResult`，但需要补充 `ruleId`。

建议改动：

```prisma
model ReclassResult {
  id            Int      @id @default(autoincrement())
  periodId      Int
  voucherItemId Int
  ruleId        Int?
  sourceAccount String
  targetAccount String
  amount        Float
  status        String   @default("pending") // pending | approved | adjusted | rejected
  adjustedBy    Int?
  adjustedAt    DateTime?
  note          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now()) @updatedAt

  rule FinanceReclassRule? @relation(fields: [ruleId], references: [id])

  @@unique([periodId, voucherItemId])
  @@index([periodId, status])
  @@index([ruleId])
}
```

说明：

- `ReclassResult` 是明细级结果。
- `ruleId` 为空表示手工添加或历史兼容。
- 已经 `approved / adjusted / rejected` 的结果，不被引擎重跑覆盖。

## 导入幂等规则

### 科目导入

唯一键：

```text
companyCode + year + code
```

行为：

- 完全相同：跳过。
- 事实字段变化：更新事实字段或进入差异处理，视现有导入策略决定。
- 不覆盖 `FinanceReclassRule`。
- 不覆盖人工确认过的规则。

### 凭证明细导入

凭证头唯一键沿用：

```text
companyCode + voucherNo
```

明细建议使用稳定 fingerprint：

```text
companyCode
voucherNo
date
accountCode
debit
credit
description
sortOrder
```

行为：

- 完全相同：跳过。
- 新增明细：写入事实表，等待规则引擎生成 pending 重分类结果。
- 已存在明细且已审核：不自动覆盖审核结果。
- 明细事实变化较大时：建议生成新结果或标记需复核，不直接覆盖人工结果。

## 批次计划

## Batch 1：数据模型落位

目标：把规则从 `FinanceAccount.reclassTargetCode` 迁到独立规则表。

任务：

- [ ] 新增 `FinanceReclassRule` model。
- [ ] 给 `ReclassResult` 增加 `ruleId` 可空外键。
- [ ] 生成 / 更新 Prisma client。
- [ ] 编写迁移脚本：把现有 `FinanceAccount.reclassTargetCode` 迁移为 `FinanceReclassRule`。
- [ ] 保留 `FinanceAccount.reclassTargetCode` 作为兼容字段，暂不删除。
- [ ] 更新 `docs/database.md` 或 `app/finance/ARCHITECTURE.md`。

验收：

- [ ] 旧规则能迁到新表。
- [ ] 同一个公司、年份、科目、方向不会重复生成规则。
- [ ] 现有报表不受影响。

不做：

- 不改 UI。
- 不删除 `FinanceAccount.reclassTargetCode`。

## Batch 2：规则候选 service

目标：扫描公司 + 年份的凭证明细，找出借贷方向异常的科目，并生成规则候选。

新增 service 建议：

```text
server/services/finance/ledger/reclass-rules/
├── candidates.ts
├── rules.ts
└── types.ts
```

候选逻辑：

- 读取指定 `companyCode + year` 的 posted 凭证明细。
- 按科目聚合异常方向金额：
  - `balanceDirection = debit` 且 `credit > 0` -> 异常贷方。
  - `balanceDirection = credit` 且 `debit > 0` -> 异常借方。
- 查已有 `FinanceReclassRule`。
- 返回：
  - 科目编码 / 名称
  - 科目常规方向
  - 异常方向
  - 异常金额
  - 建议目标科目
  - 已配置目标科目
  - 规则状态

建议目标规则第一版：

```text
资产类异常贷方 -> 2241 其他应付款
负债类异常借方 -> 1463 其他流动资产
```

注意：

- 第一版可以先用保守默认建议。
- 后续再扩展按 sourceAccount / relatedEntity / account category 的推荐逻辑。

验收：

- [ ] 能返回异常方向科目列表。
- [ ] 金额来自凭证明细，不来自余额表。
- [ ] 已有规则优先展示用户确认值。
- [ ] 候选结果不直接写 DB，除非用户确认。

## Batch 3：科目设置集成规则

目标：把“重分类规则”并入 `科目设置`，不再作为主要独立工作流。

UI 改动：

- 在 `AccountTab` 或其子组件中增加重分类视图。
- 公司 + 年份筛选后，置顶异常方向候选科目。
- 增加筛选：
  - 全部科目
  - 有规则
  - 系统建议
  - 本年有异常方向
- 增加列：
  - 科目编码
  - 科目名称
  - 常规方向
  - 异常方向
  - 异常金额
  - 建议目标
  - 当前目标
  - 状态
  - 操作

API：

- `GET /api/finance/reclass-rules/candidates`
- `PUT /api/finance/reclass-rules`
- `DELETE /api/finance/reclass-rules/[id]`

权限：

- 查看：`finance.ledger.access`
- 修改：`finance.ledger.write`

验收：

- [ ] 异常方向科目置顶。
- [ ] 用户可确认建议。
- [ ] 用户可手动改目标科目。
- [ ] 用户可搜索任意科目并配置特殊规则。
- [ ] 规则保存到 `FinanceReclassRule`。

不做：

- 不在本批生成 `ReclassResult`。

## Batch 4：引擎改用规则表

目标：`buildReclassResults()` 不再依赖 `FinanceAccount.reclassTargetCode`，改用 `FinanceReclassRule`。

逻辑：

- 查询 period 对应的 `companyCode + year`。
- 读取 enabled 的 `FinanceReclassRule`。
- 对 posted 凭证明细逐条匹配：
  - account code = `sourceAccountCode`
  - 异常方向 = `abnormalSide`
  - 借贷方向命中
- 生成 / upsert `ReclassResult`。
- 写入 `ruleId`。
- 非 pending 的历史结果不覆盖。

验收：

- [ ] 科目级规则能生成明细级 pending 结果。
- [ ] `approved / adjusted / rejected` 不被覆盖。
- [ ] `ruleId` 能追溯到规则。
- [ ] `FinanceAccount.reclassTargetCode` 不再作为主规则来源。

## Batch 5：凭证明细集成审核

目标：把“重分类审核”并入 `凭证明细`。

UI 改动：

- 在 `VoucherTab` / `VoucherItemTable` 中展示重分类状态。
- 增加筛选：
  - 全部
  - 异常方向
  - 待重分类
  - 已确认
  - 已调整
  - 已驳回
- 每条明细展示：
  - 凭证号
  - 摘要
  - 科目
  - 借方
  - 贷方
  - 关联实体
  - 建议目标
  - 重分类金额
  - 状态
  - 操作

操作：

- approve
- reject
- adjust targetAccount / amount / note
- 手工加入重分类

验收：

- [ ] 重分类过的凭证明细置顶或可筛选。
- [ ] 可以在凭证明细内审核。
- [ ] 可以对某一条凭证明细继续细化。
- [ ] 审核结果写入 `ReclassResult`。

## Batch 6：生成入口

目标：让用户明确触发“按当前规则生成待审核结果”。

入口建议：

- 放在 `凭证明细` 中。
- 条件：必须选择公司 + 年份 + 月份。

行为：

- 点击“生成重分类建议”。
- 调用 `buildReclassResults(periodId, { dryRun: false })`。
- 返回：
  - 扫描明细数
  - 新增 pending 数
  - 跳过已审核数
  - 无规则数
  - 无实体数
  - 目标无效数

验收：

- [ ] 不会覆盖已审核结果。
- [ ] 生成后凭证明细中能看到 pending 建议。
- [ ] 结果可继续审核。

## Batch 7：报表只读收口

目标：确认资产负债表只消费最终结果。

要求：

- 只消费 `approved / adjusted`。
- 不消费 `pending`。
- 不消费 `rejected`。
- 使用 `sourceAccount + targetAccount + amount`。
- 按 source 扣减对应报表行。
- 按 target 增加对应报表行。

验收：

- [ ] `1221 -> 2241, amount=5000`：其他应收款减少 5000，其他应付款增加 5000。
- [ ] `1122 -> 2202, amount=2000`：应收账款减少 2000，应付账款增加 2000。
- [ ] `2241 -> 1463, amount=3000`：其他应付款减少 3000，其他流动资产增加 3000。
- [ ] pending 不进报表。
- [ ] rejected 不进报表。

## Batch 8：旧 Tab 和兼容字段收口

目标：减少重复入口。

任务：

- [ ] 如果规则已并入科目设置，移除或隐藏独立 `重分类规则` Tab。
- [ ] 如果审核已并入凭证明细，移除或隐藏独立 `重分类审核` Tab。
- [ ] 确认 `FinanceAccount.reclassTargetCode` 无调用后，计划删除或标记 deprecated。
- [ ] 更新 `app/finance/ARCHITECTURE.md`。

验收：

- [ ] 用户只需要在科目设置、凭证明细、财务报表三个地方完成重分类工作。
- [ ] 没有重复入口造成口径不一致。

## 最终用户工作流

```text
1. 导入科目和凭证
2. 打开科目设置
3. 选择公司 + 年份
4. 查看系统置顶的异常方向科目
5. 确认或修改科目级重分类规则
6. 打开凭证明细
7. 选择公司 + 年份 + 月份
8. 生成重分类建议
9. 审核、调整、驳回具体凭证明细
10. 打开财务报表
11. 查看只读的最终资产负债表结果
```

## 关键风险

### 1. 导入覆盖人工结果

必须避免：

- 重新导入科目覆盖规则。
- 重新导入凭证覆盖已审核结果。
- 引擎重跑覆盖 `approved / adjusted / rejected`。

### 2. 规则与结果混在一起

规则是“以后怎么处理类似数据”。

结果是“这一条凭证明细最终怎么处理”。

两者必须分表。

### 3. 报表行项目映射不完整

报表消费必须按 `sourceAccount` 和 `targetAccount` 路由。

如果目标科目不属于现有资产负债表行，需要明确：

- 显示为 0 并记录审计？
- 还是进入某个默认兜底行？

第一版建议：不 crash，但在后续审计视图中暴露未路由金额。

## 不做事项

- 不把规则长期保存在 `FinanceAccount.reclassTargetCode`。
- 不让财务报表承担编辑职责。
- 不让导入流程覆盖人工判断。
- 不一次性删除旧兼容字段。
- 不在 API route 里写复杂规则。

## 交付硬约束

每个 batch 完成后运行：

```bash
npm run size:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

涉及 schema / 架构文档时补充：

```bash
npm run schema:check
npm run arch:gate
npm run docs:check
```
