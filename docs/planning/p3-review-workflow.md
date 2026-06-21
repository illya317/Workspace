# P3：利润表 / 现金流量表底稿与校对计划

本文档用于指导 P3 后续实现。当前状态：

- Batch 1 已完成：利润表 / 现金流量表 line config 框架。
- Batch 2 已完成：`statement-workpapers` 输入底稿 schema、service、API、smoke。
- Batch 3 尚未开始：校对 review schema + API。

重要前置条件：

- 在资产负债表 Phase 2 的 `finance:bs-smoke:all` 恢复稳定前，不继续 P3 Batch 3 schema。
- P3 不改变资产负债表 mapping 计算口径。
- P3 的目标是给利润表、现金流量表补齐“底稿输入 -> 人工校对 -> 最终报表消费”的链路。

---

## 1. 分层原则

P3 必须保持三层分离：

| 层 | 表 / 服务 | 说明 |
|---|---|---|
| 输入底稿 | `FinanceStatementWorkpaper` / `FinanceStatementWorkpaperLine` | 会计录入或导入的原始底稿输入 |
| 人工校对 | `FinanceStatementReview` / `FinanceStatementReviewLine` | 校对人确认后的事实快照 |
| 最终报表 | report generator | 只读消费 confirmed review，不直接消费 workpaper |

核心规则：

```text
Workpaper 是输入，不是最终数。
Review 是确认结果，可以进入报表。
Report 只读，不写业务状态。
```

---

## 2. Batch 3：Review Schema

### 2.1 FinanceStatementReview

用途：校对头表。表示某个底稿已经进入人工校对流程。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `Int @id` | 主键 |
| `workpaperId` | `Int @unique` | 1 个 workpaper 对应 1 个 active review |
| `companyCode` | `String` | 冗余快照，便于查询 |
| `year` | `Int` | 冗余快照 |
| `month` | `Int` | 冗余快照 |
| `reportType` | `String` | `incomeStatement` / `cashFlow` |
| `status` | `String` | `draft` / `confirmed` / `voided` |
| `generatedFromVersion` | `Int` | 创建 review 时的 workpaper version |
| `reviewedBy` | `Int?` | 最终确认人 |
| `reviewedAt` | `DateTime?` | 最终确认时间 |
| `note` | `String?` | 校对备注 |
| `editedBy` | `Int?` | 最近编辑人 |
| `editedAt` | `DateTime?` | 最近编辑时间 |
| `version` | `Int @default(1)` | 乐观版本 |
| `createdAt` | `DateTime @default(now())` | 创建时间 |
| `updatedAt` | `DateTime @updatedAt` | 更新时间 |

约束：

```prisma
@@unique([workpaperId])
@@index([companyCode, year, month, reportType])
@@index([status])
```

说明：

- `companyCode/year/month/reportType` 是快照冗余，不用于替代 `workpaperId` 外键。
- `generatedFromVersion` 用来判断 review 是否落后于 workpaper。
- 如果 workpaper 后续被改动，review 不自动改；UI 应提示“底稿已更新，需要重新生成校对”。

### 2.2 FinanceStatementReviewLine

用途：校对行表。保存每个报表项目的系统数、底稿数、人工调整数和最终确认数。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `Int @id` | 主键 |
| `reviewId` | `Int` | FK |
| `lineCode` | `String` | 报表项目编码 |
| `label` | `String` | 创建 review 时的项目名称快照 |
| `sortOrder` | `Int` | 创建 review 时的排序快照 |
| `systemAmount` | `Float` | 系统建议数，Batch 5 前可为 0 |
| `workpaperAmount` | `Float` | 创建 review 时 `manualAmount + importedAmount` 快照 |
| `adjustedAmount` | `Float?` | 人工调整数；`null` 表示未调整 |
| `finalAmount` | `Float` | 最终确认数快照 |
| `status` | `String` | `pending` / `confirmed` / `adjusted` / `flagged` |
| `comment` | `String?` | 行备注 |
| `createdAt` | `DateTime @default(now())` | 创建时间 |
| `updatedAt` | `DateTime @updatedAt` | 更新时间 |

约束：

```prisma
@@unique([reviewId, lineCode])
@@index([reviewId, status])
```

`finalAmount` 的规则：

```text
finalAmount = adjustedAmount ?? workpaperAmount
```

为什么允许存 `finalAmount`：

- 它不是普通派生字段，而是“校对人在某一时点确认的最终事实快照”。
- 未来底稿或系统建议重算，不应静默改变已经确认的报表。
- 报表消费 `confirmed review` 的 `finalAmount`，保证口径可追溯。

---

## 3. Workpaper 与 Review 的关系

```text
FinanceStatementWorkpaper
  manualAmount
  importedAmount
  version
        │
        │ generate review
        ▼
FinanceStatementReview
  generatedFromVersion
  status
        │
        ▼
FinanceStatementReviewLine
  systemAmount
  workpaperAmount
  adjustedAmount
  finalAmount
        │
        │ confirmed only
        ▼
Report generator
```

生命周期：

1. 会计维护 workpaper，状态保持 `draft`。
2. 用户点击“生成校对”，系统从 workpaper 创建 review。
3. review 行快照保存 `systemAmount`、`workpaperAmount`、`finalAmount`。
4. 校对人逐行调整 `adjustedAmount/status/comment`。
5. 全部关键行完成后，用户点击“确认校对”。
6. review 进入 `confirmed`。
7. 最终利润表 / 现金流量表只读消费 confirmed review。

重建规则：

- 如果 review 未确认，可以允许重新生成，覆盖旧 review line。
- 如果 review 已确认，不允许自动覆盖。
- 若确需重做，新增 `voided` 或 `reopened` 流程，不在 Batch 3 实现。

---

## 4. 报表消费规则

Batch 5/6 实现报表消费时使用以下优先级：

```text
if confirmed review exists:
  line amount = reviewLine.finalAmount
else:
  line amount = 0
  diagnostics: missingConfirmedReview
```

不直接消费：

- `workpaper.manualAmount`
- `workpaper.importedAmount`
- `reviewLine.systemAmount`
- `reviewLine.workpaperAmount`

原因：

- workpaper 是输入草稿，不代表已确认。
- systemAmount 是参考，不代表最终口径。
- workpaperAmount 是快照，不代表校对后结果。

---

## 5. Batch 3 API

### 5.1 POST `/api/modules/finance/statement-reviews`

用途：从 workpaper 生成 review。

权限：

```text
withFinanceReportWrite
```

Body：

```json
{
  "workpaperId": 123
}
```

行为：

1. 查 workpaper + lines。
2. 校验 reportType 只能是 `incomeStatement` / `cashFlow`。
3. 加载对应 line config。
4. 若已有 confirmed review，返回 409。
5. 若已有 draft review，允许重建或返回现有 review。建议 Batch 3 先返回现有 review，避免误覆盖。
6. 创建 review + review lines。
7. `workpaperAmount = manualAmount + importedAmount`。
8. `systemAmount = 0`，Batch 5 再接系统建议。
9. `finalAmount = workpaperAmount`。
10. 返回 DTO。

### 5.2 GET `/api/modules/finance/statement-reviews`

用途：读取 review。

权限：

```text
withFinanceReportAccess
```

Query：

```text
workpaperId=123
```

或：

```text
companyCode=02&year=2025&month=12&reportType=incomeStatement
```

行为：

- 优先支持 `workpaperId`。
- company/year/month/reportType 查询用于页面初始化。
- 返回 review + lines。
- 没有 review 时返回 `{ review: null }`，不要自动创建。

### 5.3 PUT `/api/modules/finance/statement-reviews/[id]`

用途：局部更新 review 行。

权限：

```text
withFinanceReportWrite
```

Body：

```json
{
  "lines": [
    {
      "lineCode": "revenue",
      "adjustedAmount": 1000000,
      "status": "adjusted",
      "comment": "按审计底稿调整"
    }
  ],
  "note": "本月已核对"
}
```

行为：

- 局部更新，只改 payload 中出现的行。
- 不删除未出现的行。
- `adjustedAmount === null` 表示清除人工调整。
- 更新后重新计算该行 `finalAmount`。
- 如果 review 已 confirmed，Batch 3 先禁止修改，返回 409。

### 5.4 POST `/api/modules/finance/statement-reviews/[id]/confirm`

用途：最终确认 review。

权限：

```text
withFinanceReportWrite
```

行为：

1. 校验 review 存在。
2. 校验不是 confirmed / voided。
3. 校验没有 `flagged` 行。
4. 校验关键数据行都不是 `pending`。
5. 写入 `status=confirmed`、`reviewedBy`、`reviewedAt`。

---

## 6. Batch 4 UI：校对页面

建议路径：

```text
/finance/statement-review
```

页面结构：

```text
筛选栏：
  公司 / 年度 / 月份 / 报表类型

操作区：
  [读取底稿] [生成校对] [确认校对]

表格：
  项目
  系统建议
  底稿输入
  调整金额
  最终金额
  状态
  备注
```

表格示例：

| 项目 | 系统建议 | 底稿输入 | 调整金额 | 最终金额 | 状态 | 备注 |
|---|---:|---:|---:|---:|---|---|
| 营业收入 | 0.00 | 1,000,000.00 |  | 1,000,000.00 | confirmed |  |
| 营业成本 | 0.00 | 600,000.00 | 580,000.00 | 580,000.00 | adjusted | 按审计底稿调整 |
| 税金及附加 | 0.00 | 0.00 |  | 0.00 | confirmed |  |

交互要求：

- 调整金额 inline edit。
- 状态可切换：`pending` / `confirmed` / `adjusted` / `flagged`。
- `adjustedAmount` 非空时默认状态为 `adjusted`。
- `flagged` 行阻止最终确认。
- confirmed review 页面只读。
- 若 workpaper.version > review.generatedFromVersion，顶部提示“底稿已更新，需要重新生成校对”。

---

## 7. Batch 5：系统建议数

Batch 5 才接系统建议，不要在 Batch 3 提前实现。

利润表建议数：

- 从凭证明细按 line config prefixes 聚合。
- 收入类按贷方方向。
- 成本费用类按借方方向。
- `subtract` 类项目按配置反向。

现金流量表建议数：

- 第一版不要试图自动完整编制现金流量表。
- 先支持底稿输入 + 人工校对。
- 后续再接现金流辅助底稿。

---

## 8. Batch 6：最终报表消费

目标：

- 利润表页面消费 confirmed review。
- 现金流量表页面消费 confirmed review。
- 没有 confirmed review 时，显示空表 + 提示，不要静默用 workpaper。

报表 API 应返回 diagnostics：

```json
{
  "diagnostics": [
    {
      "type": "missingConfirmedReview",
      "message": "当前期间没有已确认校对结果"
    }
  ]
}
```

---

## 9. 与资产负债表 Phase 2 的关系

P3 Batch 3 之前必须满足：

```text
npm run finance:bs-smoke:all
```

验收口径：

```text
02/2024、02/2025、02/2026 必须恢复 OK。
05/2025、05/2026 的 3001 100K 可继续作为业务 pending。
```

如果资产负债表 smoke 仍然是 `10 OK / 5 GAP`，不得继续 P3 Batch 3 schema。

---

## 10. Batch 3 交付清单

Batch 3 只交付 schema + service + API，不做 UI，不接报表消费。

交付文件建议：

```text
prisma/models/finance-ledger.prisma
prisma/models/auth-rbac.prisma
server/services/finance/statements/reviews/types.ts
server/services/finance/statements/reviews/service.ts
app/api/modules/finance/statement-reviews/route.ts
app/api/modules/finance/statement-reviews/[id]/route.ts
app/api/modules/finance/statement-reviews/[id]/confirm/route.ts
app/finance/ARCHITECTURE.md
```

验收：

```text
npx prisma validate
npx prisma generate
npx prisma db push
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm run build
npm run finance:wp-smoke
```

如果本批新增 smoke：

```text
npm run finance:review-smoke
```

---

## 11. 不在 Batch 3 范围

- 不做校对 UI。
- 不做利润表系统建议聚合。
- 不做现金流量表自动编制。
- 不修改资产负债表 mapping 计算。
- 不让最终报表消费 review。
- 不引入复杂审批流。
