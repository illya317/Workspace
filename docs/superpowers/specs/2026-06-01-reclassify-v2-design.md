# 重分类 v2 设计方案

## 现状

v1 简单粗暴：看科目期末余额，1xxx 贷方 → 重分到负债，2xxx 借方 → 重分到资产。

问题：只看科目余额，不看交易性质。122101 其他应收款-单位 有 48M 贷方，但里面混了"收到往来款"和"支付往来款"，按单笔交易性质可能部分应留在资产。

## 目标

从凭证明细层面重分类，规则可配置，结果可审核修改。

## Phase 1: 数据模型

### 科目表加字段

```prisma
model FinanceAccount {
  // 现有字段...
  reclassTargetCode  String?  // 重分类目标科目编码。例：1221 的 reclassTargetCode="2241"
                              // 含义：该科目期末为贷方时，自动重分到目标科目
  reclassCondition   String?  // 预留：额外条件 "entity_contains:丰华" 等，暂不用
}
```

不需要新表。规则跟着科目走：科目 1221 设 `reclassTargetCode=2241`，引擎自动把 1221 贷方余额重分到 2241。

### 凭证明细加字段

```prisma
model FinanceVoucherItem {
  // 现有字段...
  relatedEntity  String?  // 从描述中提取的实体名称，如 "江苏丰华生物制药有限公司"
}
```

### 新表：ReclassResult（重分类结果）

```prisma
model ReclassResult {
  id              Int      @id @default(autoincrement())
  periodId        Int
  period          FinancePeriod @relation(fields: [periodId])
  voucherItemId   Int?     // 来源凭证明细（如果是逐笔重分类）
  sourceAccount   String   // 原科目
  targetAccount   String   // 目标科目
  amount          Float    // 重分类金额
  ruleId          Int?     // 应用的规则
  status          String   @default("pending")  // pending | approved | adjusted
  adjustedBy      Int?     // 修改人 userId
  adjustedAt      DateTime?
  note            String?  // 审核备注
  createdAt       DateTime @default(now())
}
```

## Phase 2: 相关实体

先从凭证明细描述中正则提取：

```
"收到丰华生物往来款_江苏丰华生物制药有限公司_2025.01.06"
  → 实体名: "江苏丰华生物制药有限公司"

"支付员工借款_张三"
  → 实体名: "张三"
```

暂不建统一实体表——先用 `relatedEntity` 字符串字段存。以后要跨公司/个人查询时再建 `Entity` 表（type: company/external/person + name + externalId）。

## Phase 3: 规则引擎

```
对每个期间：
  1. 查出所有需重分类的凭证明细（根据 ReclassRule）
  2. 逐笔匹配规则
  3. 生成 ReclassResult（status=pending）
  4. 汇总展示
```

## Phase 4: 可编辑审核

ReclassResult 表格：
- 显示所有待审核条目
- 可修改目标科目、金额
- 可添加备注
- 审核通过/拒绝
- 通过后锁定，参与报表计算

## 实施顺序

| 步骤 | 内容 | 涉及 |
|------|------|------|
| 1 | Schema: FinanceAccount + reclassTargetCode, FinanceVoucherItem + relatedEntity, ReclassResult 表 | Prisma migration |
| 2 | Seed: 1221.reclassTargetCode="2241", 其他按需 | Seed |
| 3 | 脚本: 回填现有凭证明细的 relatedEntity（正则提取） | 一次性脚本 |
| 4 | Service: 新引擎 — 读科目 reclassTarget + 扫凭证明细 → 生成 ReclassResult | server/services/finance/schedules/ |
| 5 | API: ReclassResult CRUD（可编辑审核） | app/api/finance/schedules/ |
| 6 | UI: ReclassTab 改为规则配置 + 结果审核表 | app/finance/schedules/ |
| 7 | 集成: 报表引擎读 ReclassResult 替代现有关键借贷判断 | balance-sheet.ts |

## 相关问题

### 实体 ID 要不要跨公司/个人？

**建议先不做。** 用 `relatedEntity` 字符串存名称。理由：
- 天力通 148 笔往来款全是"江苏丰华生物"，正则就能提取
- 跨公司/个人查询需求还没出现
- 以后需要时再建 `Entity` 表 + 回填

### 重分类规则谁维护？

初期 seed 预置 + 管理员在 UI 上增删改。常用规则：
```
1221 + 贷方 + 含"往来款" → 2241 其他应付款
1122 + 贷方 + 含"预收"   → 2203 预收账款
```
