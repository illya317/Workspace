按 **Phase 3：利润表 + 现金流量表框架 / 底稿 / 校对** 做。不要现在直接把两张表接成最终计算，先把“表结构 + API + 页面框架”搭好。

```text
开始 Phase 3：利润表 + 现金流量表框架、底稿输入、人工校对。

背景：
资产负债表第一阶段已收口。现在基于已有“天力通 2025 年报表”作为模板，搭利润表和现金流量表框架。
本阶段目标不是把所有现金流自动算准，而是：
1. 两张表的完整报表项目框架齐全；
2. 底稿输入有 DB/API/UI；
3. 人工校对有 DB/API/UI；
4. 三张表的校对页面结构统一。

限制：
- 不改资产负债表核心计算。
- 不改现有 balance mapping authoritative 口径。
- 不要把现金流量表硬做成全自动。
- 现金流量表先允许“系统建议 + 底稿输入 + 人工确认”。
- 文件大小遵守红线。
```

**Phase 3A：报表项目配置扩展**

```text
目标：
基于天力通 2025 年报表，补齐利润表和现金流量表的 line config。

Schema：
复用 FinanceStatementLineConfig：
- reportType = "incomeStatement"
- reportType = "cashFlow"

利润表：
1. 从现有 income-statement-lines.ts 迁移到 FinanceStatementLineConfig。
2. 保留 lineCode / label / section / side / sortOrder / isTotal / isGrandTotal。
3. 新增 seed/ensure：
   ensureStatementLineConfigs(companyCode, year, reportType)
4. 新年度继承上一年，没有上一年则用 TS default seed。

现金流量表：
1. 新增 cash-flow-lines.ts，覆盖标准现金流项目：
   - 经营活动现金流入
   - 销售商品、提供劳务收到的现金
   - 收到的税费返还
   - 收到其他与经营活动有关的现金
   - 经营活动现金流出
   - 购买商品、接受劳务支付的现金
   - 支付给职工以及为职工支付的现金
   - 支付的各项税费
   - 支付其他与经营活动有关的现金
   - 经营活动产生的现金流量净额
   - 投资活动现金流入/流出/净额
   - 筹资活动现金流入/流出/净额
   - 汇率变动影响
   - 现金及现金等价物净增加额
   - 期初现金及现金等价物余额
   - 期末现金及现金等价物余额
2. reportType = "cashFlow"
3. 暂不强求自动取数，先让 line config 完整。
```

**Phase 3B：利润表科目映射**

```text
目标：
利润表走和资产负债表类似的 mapping 框架，但 statementType="income"。

使用：
FinanceStatementAccountMapping:
- statementType = "income"

逻辑：
1. P&L 科目 5xxx/6xxx 按公司年度映射到利润表项目。
2. 从 income-statement-lines.ts 的 chnPrefixes/canPrefixes 初始化 mapping。
3. 天力通 2025 作为第一套验证模板。
4. 最近祖先继承继续适用。
5. 不影响 balance statementType。

API：
扩展 /api/finance/statement-config 支持 type=income。
但如果范围太大，先新增内部 service，不急着 UI 全接。
```

**Phase 3C：底稿输入表**

新增底稿表，建议叫：

```prisma
model FinanceStatementWorkpaper {
  id          Int      @id @default(autoincrement())
  companyCode String
  year        Int
  month       Int?
  reportType  String   // balanceSheet | incomeStatement | cashFlow
  source      String   // imported | manual | system | template
  status      String   @default("draft") // draft | confirmed | locked
  note        String?
  createdBy   Int?
  confirmedBy Int?
  confirmedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  @@unique([companyCode, year, month, reportType])
}

model FinanceStatementWorkpaperLine {
  id          Int      @id @default(autoincrement())
  workpaperId Int
  lineCode    String
  label       String
  amount      Float    @default(0)
  sourceType  String   @default("manual") // system | manual | imported | formula
  formulaJson String   @default("{}")
  note        String?
  evidenceRef String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  @@unique([workpaperId, lineCode])
}
```

用途：

```text
利润表：
- 系统可以根据科目映射生成建议金额
- 用户可导入/录入底稿金额

现金流量表：
- 很多项目先通过底稿输入，不强求自动算
- 后续再做规则化
```

API：

```text
GET /api/finance/statement-workpapers?companyCode=&year=&month=&reportType=
PUT /api/finance/statement-workpapers
POST /api/finance/statement-workpapers/confirm
```

权限：

```text
GET: finance.statement.access
PUT/POST confirm: finance.statement.write
```

**Phase 3D：人工校对表**

人工校对不要覆盖底稿原值，单独记录 adjustment / review。

```prisma
model FinanceStatementReview {
  id          Int      @id @default(autoincrement())
  companyCode String
  year        Int
  month       Int?
  reportType  String
  status      String   @default("draft") // draft | reviewed | locked
  reviewedBy  Int?
  reviewedAt  DateTime?
  note        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  @@unique([companyCode, year, month, reportType])
}

model FinanceStatementReviewLine {
  id          Int      @id @default(autoincrement())
  reviewId    Int
  lineCode    String
  systemAmount Float   @default(0)
  workpaperAmount Float?
  adjustedAmount Float?
  finalAmount Float    @default(0)
  status      String   @default("pending") // pending | confirmed | adjusted | ignored
  note        String?
  updatedBy   Int?
  updatedAt   DateTime @updatedAt

  @@unique([reviewId, lineCode])
}
```

逻辑：

```text
systemAmount = 系统计算金额
workpaperAmount = 底稿输入金额
adjustedAmount = 人工调整金额
finalAmount = 最终确认金额

优先级：
adjustedAmount ?? workpaperAmount ?? systemAmount
```

API：

```text
GET /api/finance/statement-reviews?companyCode=&year=&month=&reportType=
PUT /api/finance/statement-reviews/[id]/lines
POST /api/finance/statement-reviews/[id]/confirm
```

**Phase 3E：三张表校对页面设计**

页面放在：

```text
/finance/statement-config
```

或者新增：

```text
/finance/statement-review
```

我建议新增 `/finance/statement-review`，避免配置页太重。

页面结构：

```text
顶部筛选：
公司 / 年度 / 月份 / 报表类型

Tab 1：资产负债表
Tab 2：利润表
Tab 3：现金流量表
```

每个 Tab 共用同一种校对表格：

```text
报表项目 | 系统金额 | 底稿金额 | 人工调整 | 最终金额 | 差异 | 状态 | 备注 | 操作
```

状态规则：

```text
系统金额 = 底稿金额 → 自动建议 confirmed
系统金额 != 底稿金额 → pending
人工填 adjustedAmount → adjusted
用户确认 → confirmed
```

资产负债表校对：

```text
系统金额来自当前 mapping-based balance sheet。
底稿金额可选。
主要看是否平衡、是否有 outstanding item。
```

利润表校对：

```text
系统金额来自 income mapping。
底稿金额来自天力通 2025 报表/用户输入。
差异用于校对科目归属。
```

现金流量表校对：

```text
系统金额初期可以为空或只提供现金余额校验：
期初现金 + 净增加额 = 期末现金

底稿金额是主输入。
人工确认后作为最终现金流量表。
```

**Phase 3F：以天力通 2025 做 smoke**

新增 smoke：

```text
npm run finance:statement-review-smoke
```

检查：

```text
02 / 2025 / incomeStatement:
- line config 完整
- workpaper 可创建
- review 可生成
- finalAmount 可确认

02 / 2025 / cashFlow:
- line config 完整
- workpaper 可创建
- review 可生成
- 期初现金 + 净增加额 = 期末现金 可校验
```

**执行顺序**

```text
Batch 1：Schema + seed line configs
Batch 2：workpaper service/API
Batch 3：review service/API
Batch 4：statement-review 页面骨架
Batch 5：利润表 mapping preview
Batch 6：天力通 2025 smoke
```

**关键原则**

```text
利润表可以逐步自动化。
现金流量表先底稿优先，不要硬算。
三张表校对页面统一。
底稿、系统计算、人工确认三者分开存。
```

还有一点：当前工作区已有未提交 UI 改动：

```text
app/finance/components/FinanceFilters.tsx
app/finance/statement-config/ConfigTab.tsx
app/finance/statement-config/MappingTab.tsx
app/finance/statement-config/StatementConfigClient.tsx
app/finance/statement-config/StatementConfigContext.tsx
```

开 Phase 3 前必须先确认这些改动属于谁。如果是上一轮 UI 共享 company/year，就先提交或 stash，别和 Phase 3 schema/API 混在一个 commit。
