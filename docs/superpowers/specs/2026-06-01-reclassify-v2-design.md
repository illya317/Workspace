# 重分类 v2 设计方案（修订版）

## 架构

```
总账基础
├── 科目设置      → 表 + 列可见性开关（reclassTargetCode 默认隐藏）
├── 凭证明细      → 表 + 列可见性开关（relatedEntity 默认隐藏）
├── 余额表
├── 重分类规则    → 新增 tab：科目→目标映射，引擎自动Run
└── 重分类审核    → 新增 tab：ReclassResult 逐笔过/改/拒
```

## 数据模型

### FinanceAccount 加字段

```prisma
reclassTargetCode  String?  // 如 "2241"。该科目贷方余额重分到此科目
```

### FinanceVoucherItem 加字段

```prisma
relatedEntity  String?  // 正则从描述提取，如 "江苏丰华生物制药有限公司"
```

### ReclassResult（新表）

```prisma
model ReclassResult {
  id             Int       @id @default(autoincrement())
  periodId       Int
  period         FinancePeriod @relation(fields: [periodId])
  voucherItemId  Int       // 来源凭证明细
  sourceAccount  String    // 原科目编码
  targetAccount  String    // 目标科目编码（规则默认值，可改）
  amount         Float     // 重分类金额
  status         String    @default("pending")  // pending|approved|adjusted|rejected
  adjustedBy     Int?      // 修改人 userId
  note           String?   // 审核备注
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

## 流程

```
1. 科目表设 reclassTargetCode（规则配置 tab）
2. 导入凭证时，正则提取 relatedEntity
3. 引擎跑：逐笔匹配规则 → 生成 ReclassResult（pending）
4. 审核人看：ReclassResult + 展开源凭证 → 过/改/拒
5. 锁定的结果 → 报表引擎消费
```

## 列可见性模块

### ColumnToggle（全局）

```tsx
// app/components/ColumnToggle.tsx
interface ColumnDef {
  key: string; label: string; defaultVisible: boolean;
}
<ColumnToggle columns={columns} visible={visible} onChange={setVisible} />
```

用法：
```tsx
const columns = [
  { key: "reclassTarget", label: "重分类目标", defaultVisible: false },
  { key: "balanceDirection", label: "余额方向", defaultVisible: true },
];
const [visible, setVisible] = useState(columns.filter(c => c.defaultVisible).map(c => c.key));
```

UI 上就是一个 `[+选择字段]` 按钮，下拉显示未选中的字段，点了就加到表头。
不常用字段默认隐藏，表头不臃肿。

## 权限

```
finance.ledger.access   → 能看总账基础全部 tab（含重分类规则+审核）
finance.schedules.access → 废弃（重分类回归 ledger 后不需要了）
finance.statement.access → 读最终报表（自动用重分类结果）
```

## 实施顺序

| 步骤 | 内容 |
|------|------|
| 1 | Schema: FinanceAccount + reclassTargetCode, VoucherItem + relatedEntity, ReclassResult 表 |
| 2 | ColumnToggle 全局组件 |
| 3 | 科目设置 tab 加列可见性 + reclassTargetCode 编辑（默认隐藏） |
| 4 | 凭证明细 tab 加列可见性 + relatedEntity 列（默认隐藏） |
| 5 | 正则回填脚本（提取现有凭证的 relatedEntity） |
| 6 | 重分类引擎 service（规则匹配 → 生成 ReclassResult） |
| 7 | 重分类规则 tab（科目→目标对照表，CRUD） |
| 8 | 重分类审核 tab（ReclassResult 表 + 展开凭证 + 过/改/拒） |
| 9 | 报表引擎集成（读 ReclassResult） |
| 10 | 清理 schedules（重分类 tab 删除，只留折旧占位） |
