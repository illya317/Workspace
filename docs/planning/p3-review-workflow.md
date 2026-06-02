# P3 Review Workflow Plan

> 状态：设计草案。不改 prisma、不改 compute、不改 statement-mappings。
> 依赖：P3 Batch 2 底稿输入（workpaper）已完成。

## 1. 目的

校对（review）是 workpaper（底稿输入）和 final report（最终报表）之间的桥。

```
Workpaper (输入)  →  Review (校对)  →  Report (消费)
会计填数字          校对签核            报表取数
```

**原则：**
- Review 不改 workpaper。Workpaper 始终是会计的原始输入。
- 只有经过 review confirmed 的金额才进入最终报表。
- Review 可反复重建（从 workpaper 重新快照），历史 review 保留。

## 2. 数据模型（草案，不改 prisma）

### FinanceStatementReview（校对头）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int PK | |
| workpaperId | Int FK (unique) | 1 workpaper → 1 active review |
| status | String | `"pending"` → `"inProgress"` → `"confirmed"` |
| reviewedBy | Int? → User | |
| reviewedAt | DateTime? | |
| note | String? | |

唯一键：`workpaperId`。

### FinanceStatementReviewLine（校对行）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int PK | |
| reviewId | Int FK → FinanceStatementReview | |
| lineCode | String | |
| systemAmount | Float @default(0) | 系统计算建议（Batch 5 前为 0） |
| workpaperAmount | Float | 校对发起时 workpaper 快照（manual + imported） |
| adjustedAmount | Float? | 校对人的调整金额，null = 未调整 |
| finalAmount | Float | 最终确认金额 = `adjustedAmount ?? workpaperAmount` |
| status | String | `"pending"` / `"confirmed"` / `"adjusted"` / `"flagged"` |
| comment | String? | |

唯一键：`(reviewId, lineCode)`。

**为什么 finalAmount 存 DB：** 它是校对签核的事实——"校对人在此时此地确认了这个数字"。不是派生字段，是审批事实。schema-governance 允许存审批结果。

## 3. 生命周期

```
1. 会计填 workpaper → PUT save → status=draft
2. 会计点"提交校对" → POST create review
   - 快照 workpaper 金额到 workpaperAmount
   - 每行 status=pending
3. 校对人对每条 line：
   - 确认 → status=confirmed, adjustedAmount=null
   - 调整 → status=adjusted, adjustedAmount=<新数字>
   - 标记 → status=flagged, comment=<原因>
   - finalAmount 自动 resolve
4. 全部行非 pending → 可点"完成校对" → review status=confirmed
5. 最终报表只读 finalAmount WHERE review.status=confirmed
```

## 4. 报表消费路径

```
for each lineCode in lineConfig:
  if review exists AND review.status == "confirmed":
    return reviewLine.finalAmount   ← 校对签核后的数字
  else:
    return 0（或无数据标记）

不消费：
  - workpaper.manualAmount / importedAmount（未经校对）
  - reviewLine.systemAmount（诊断参考）
  - reviewLine.workpaperAmount（快照记录）
```

唯一消费路径：**workpaper → review confirmed → finalAmount**。

## 5. API 草案

```
POST /api/finance/statement-reviews
  Body: { workpaperId }
  Auth: withFinanceReportWrite
  → 从 workpaper 生成 review（快照金额）
  → 幂等：已有 review 则返回已有
  → 返回 { id, status, lines[] }

GET /api/finance/statement-reviews?workpaperId=
  Auth: withFinanceReportAccess
  → 返回 review + lines（含四列金额）

PUT /api/finance/statement-reviews/[id]/lines
  Body: { lines: [{ lineCode, adjustedAmount?, status, comment? }] }
  Auth: withFinanceReportWrite
  → 局部更新：只改传入的行
  → resolve finalAmount = adjustedAmount ?? workpaperAmount

POST /api/finance/statement-reviews/[id]/confirm
  Body: {}
  Auth: withFinanceReportWrite
  → 校验所有行 status != pending
  → review status → confirmed, 记录 reviewedBy/At
```

## 6. UI 草案

页面：`/finance/statement-review`

```
┌─ 筛选 ──────────────────────────────────────────────────────┐
│ 公司 [02▾] 年度 [2025▾] 月份 [6▾] 报表 [利润表▾]           │
│ [从底稿生成校对]  [完成校对]                                  │
├──────────┬──────────┬──────────┬──────────┬────────┬───────┤
│ 项目      │ 系统建议  │ 底稿输入  │ 调整金额  │ 最终    │ 状态  │
├──────────┼──────────┼──────────┼──────────┼────────┼───────┤
│ 营业收入   │        0 │1,000,000 │ [      ] │1,000K  │ ✓已确认│
│ 营业成本   │        0 │  600,000 │ [      ] │  600K  │ ✓已确认│
│ 销售费用   │        0 │        0 │ [ 5000] │    5K  │ ⚡已调整│
│ 管理费用   │        0 │        0 │ [      ] │      0 │ ⚠已标记│
│ ...       │          │          │          │        │        │
├──────────┼──────────┼──────────┼──────────┼────────┼───────┤
│ 净利润    │        0 │  400,000 │          │  395K  │ 待确认  │
└──────────┴──────────┴──────────┴──────────┴────────┴───────┘
```

**列说明：**
- 系统建议：Batch 5 前为 0，之后从科目 mapping 取
- 底稿输入：workpaper 快照（只读）
- 调整金额：校对人的可编辑列，inline edit
- 最终：自动计算，只读
- 状态：行级状态标签，可下拉切换

**关键交互：**
- Header/Total/GrandTotal 行只读
- 调整金额列 inline edit
- 行尾状态下拉
- "完成校对"需全行非 pending

## 7. 实施分 Batch

| Batch | 内容 | 估算 |
|---|---|---|
| Batch 3 | review schema + API（不改 compute） | 1 session |
| Batch 4 | review UI 页面骨架（/finance/statement-review） | 1 session |
| Batch 5 | 利润表 mapping preview + systemAmount 连接 | 1-2 sessions |
| Batch 6 | 天力通 2025 smoke 全量 | 1 session |

## 8. 边界

- 不做 balanceSheet review（资产负债表已有 authoritative 口径）
- 不做多轮校对（一轮确认即可）
- 不做校对历史/回滚（第一版只保留最新）
- 不做邮件通知/审批流
- `systemAmount` Batch 5 前为 0，UI 列可先隐藏
