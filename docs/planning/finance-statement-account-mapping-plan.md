# 财务报表科目映射重构计划

## 目标

把资产负债表等财务报表的取数逻辑，从当前 `FinanceStatementLineConfig.prefixesJson` 的字符串前缀配置，升级为可审计、可继承、可解释的“科目树 → 报表项目”映射体系。

本计划先打好方案 2 的根基：

```text
底层数据模型：科目节点归属到报表项目
用户操作方式：L1 默认覆盖子树，L2/L3 例外覆盖父级
报表查看方式：从报表项目反查实际收纳了哪些余额表科目
```

## 适用范围

这是财务现有模块内新增能力，不是新增业务 domain。

涉及范围：

- Prisma schema：新增科目映射表
- Service：映射解析、映射预览、余额校对、诊断
- API：扩展 `/api/modules/finance/statement-config`
- UI：重做 `/finance/statement-config`
- 报表计算：逐步从 `prefixesJson` 切换到 mapping resolver
- 文档：更新 `app/finance/ARCHITECTURE.md`

不在第一阶段做：

- 不新增独立财务子资源，先复用 `finance.statement`
- 不做三表完整 UI，一期先把资产负债表打通
- 不做拖拽式配置
- 不删除 `prefixesJson` / `subtractPrefixesJson`，先兼容迁移
- 不把 mapping 直接塞进 `FinanceAccount`，避免公司/年度/报表类型耦合

## 当前问题

### 1. prefix 字符串不可解释

现在资产负债表项目依赖：

```text
FinanceStatementLineConfig.prefixesJson
FinanceStatementLineConfig.subtractPrefixesJson
```

用户看到的是 `1221`、`1231` 这类字符串，不知道实际命中了哪些科目，也不知道是否重复或遗漏。

### 2. L1 能解决大部分，但缺少 L2/L3 例外机制

实际业务规则是：

- 大多数资产负债表项目可以由 L1 科目直接归属
- 少数 L2/L3 需要调到其他报表项目
- L1 下如果全部子科目都继承同一报表项目，UI 应显示清晰的“全部”
- 如果部分子科目被例外覆盖，UI 应显示“部分例外”

当前 prefix 方案只能表达“收某个前缀”，不能自然表达“L1 默认 + 深层例外覆盖”。

### 3. 报表配置入口不够清楚

现有 `/finance/statement-config` 已存在，但主导航和财务顶部导航没有完整挂出，且页面没有服务端 guard。用户很难发现，也不符合页面安全边界。

### 4. 余额校对和报表映射混在一起

用户需要先确认：

```text
一级科目余额是否等于子科目合计
```

再确认：

```text
资产负债表每一行到底收纳了哪些余额表科目
```

这应该是两个视图，不能混成一个 prefix 编辑表。

## 推荐方案

选方案 2 作为底层模型：

```text
FinanceStatementAccountMapping:
  companyCode + year + statementType + accountCode -> lineCode
```

但 UI 不做成“在科目表里填字段”，而是做成两个视角：

1. 科目映射树：从余额表科目树出发，配置科目归属
2. 报表项目视图：从资产负债表项目出发，查看实际命中科目

核心规则：

```text
最近祖先优先。
```

例如：

```text
1221 -> otherReceivableNet
122103 -> otherCurrentAssets
```

则：

```text
122101 -> otherReceivableNet
122102 -> otherReceivableNet
122103 -> otherCurrentAssets
12210301 -> otherCurrentAssets
```

用户不需要手动维护 exclude。只要把 L2/L3 指到新报表项目，系统自然覆盖父级归属。

## 数据模型设计

### 新表：FinanceStatementAccountMapping

建议新增到 `prisma/models/finance-ledger.prisma`：

```prisma
/// 财务报表科目映射：某个科目节点归属到某张报表的某一行
model FinanceStatementAccountMapping {
  id              Int      @id @default(autoincrement())
  companyCode     String
  year            Int
  statementType   String   // balance | income | cashflow
  lineCode        String   // FinanceStatementLineConfig.lineCode
  accountCode     String   // FinanceAccount.code
  includeChildren Boolean  @default(true)
  source          String   @default("manual") // default | manual | copied | migrated
  note            String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @default(now()) @updatedAt

  @@unique([companyCode, year, statementType, accountCode])
  @@index([companyCode, year, statementType, lineCode])
  @@index([companyCode, year, accountCode])
}
```

### 为什么 unique 放在 accountCode 上

同一公司、年度、报表类型下，一个科目节点只能归属一个报表项目。

```prisma
@@unique([companyCode, year, statementType, accountCode])
```

这样可以直接阻止同一科目节点被配置到两个资产负债表项目里。

如果未来确实要把一个科目拆分到多个报表项目，那是公式或调整规则，不应污染基础映射。

### 与 FinanceStatementLineConfig 的关系

`FinanceStatementLineConfig` 继续定义报表行：

```text
lineCode
label
section
side
sortOrder
isHeader
isTotal
isGrandTotal
reclassSource
reclassTarget
```

`FinanceStatementAccountMapping` 定义科目归属：

```text
accountCode -> lineCode
```

短期兼容：

- 保留 `prefixesJson`
- 保留 `subtractPrefixesJson`
- 从现有 prefix 迁移出初始 mapping
- 报表计算切换完成后，再单独开任务清理 prefix 字段

## 解析规则

### 最近祖先优先

给定叶子科目 `12210301`：

1. 查 `12210301`
2. 查 `122103`
3. 查 `1221`
4. 查 `122`
5. 查 `12`
6. 查 `1`
7. 找到最近祖先 mapping，作为最终归属

伪代码：

```ts
function resolveLineForAccount(accountCode, mappings) {
  const candidates = ancestorsFromSelfToRoot(accountCode);
  for (const code of candidates) {
    const mapping = mappings.get(code);
    if (mapping) return mapping.lineCode;
  }
  return null;
}
```

### includeChildren

一期默认 `includeChildren=true`。

保留字段是为了支持少数情况：

```text
只把当前节点归到某报表行，不让子科目继承。
```

但 UI 一期可以不暴露这个字段，避免复杂化。

### L1/L2/L3 展示层级

默认展示到 L1。

可展开：

- L1 → L2
- L2 → L3

L3 以下一期不展开，显示：

```text
含 N 个下级明细科目
```

后续如果需要，可加详情弹窗看 L4/L5。

## UI 设计

页面：`/finance/statement-config`

顶部筛选：

```text
公司 | 年度 | 报表类型
```

一期报表类型默认 `balance`，后续扩展 `income` / `cashflow`。

页面分两个 Tab：

```text
一级余额校对
科目映射树
报表项目视图
诊断
```

如果要更简洁，一期可先做前三个，诊断并入顶部提示。

### Tab 1：一级余额校对

目的：校验余额表本身，不处理报表映射。

表头：

| 字段 | 说明 |
|---|---|
| 科目 | `1002 银行存款` |
| 方向 | 借/贷 |
| L1 账面期末借方 | L1 自身 `FinanceAccountBalance.closingDebit` |
| L1 账面期末贷方 | L1 自身 `FinanceAccountBalance.closingCredit` |
| 子科目合计借方 | 子树叶子科目借方合计 |
| 子科目合计贷方 | 子树叶子科目贷方合计 |
| 差异 | L1 自身 - 子科目合计 |
| 状态 | OK / 差异 |

手风琴展开 L2：

| L2 科目 | 名称 | 方向 | 期末借方 | 期末贷方 | 净额 |
|---|---|---|---:|---:|---:|

注意：

- 借贷平衡校验只看叶子科目
- 父子汇总校验单独展示
- 不要把所有父级+子级一起 sum 后判断借贷平衡

### Tab 2：科目映射树

这是主编辑界面。

行结构：

```text
1221 其他应收款                       [其他应收款] ◐ 部分例外
  122101 其他应收款-单位               继承：其他应收款
  122102 其他应收款-个人               继承：其他应收款
  122103 特殊往来                      [其他流动资产] 例外
```

每行字段：

| 字段 | 说明 |
|---|---|
| 科目编码 + 名称 | 必须同时显示 |
| 余额方向 | 借/贷 |
| 期末余额 | 当前公司年度选中期间的金额 |
| 当前归属 | 报表项目 label |
| 来源 | 继承 / 手动 / 复制 / 默认 |
| 状态 | 全部 / 部分例外 / 未映射 / 重复 |
| 操作 | 修改归属 / 清除例外 |

状态规则：

| 状态 | 含义 | UI |
|---|---|---|
| 全部 | 当前节点整个子树最终都归到同一报表项目 | 绿色实心勾 |
| 部分例外 | 子树里有后代映射到其他报表项目 | 灰/黄半选 |
| 例外 | 当前节点有显式 mapping，且覆盖了父级 | 蓝色 chip |
| 未映射 | 当前节点及祖先都没有 mapping | 红/灰 chip |
| 重复 | 理论上 DB unique 阻止，诊断仍保留 | 红色 chip |

操作规则：

- L1 行下拉选择报表项目，默认影响整棵子树
- L2/L3 行下拉选择报表项目，即创建例外
- 清除 L2/L3 例外后，重新继承最近祖先
- 不要求用户手填 exclude

### Tab 3：报表项目视图

这是查看和校验界面。

结构：

```text
流动资产
  货币资金
    1001 库存现金
    1002 银行存款 ✅ 全部
      100201 基本-浦发银行
      100202 一般-宁波银行

  其他应收款
    1221 其他应收款 ◐ 部分
      122101 其他应收款-单位
      122102 其他应收款-个人
      排除：122103 特殊往来 -> 其他流动资产
```

每个报表项目显示：

| 字段 | 说明 |
|---|---|
| 报表项目 | 如 `其他应收款` |
| Section | 流动资产/非流动资产/流动负债/权益 |
| 收纳科目 | 实际归属到该 lineCode 的 L1/L2/L3 |
| 例外来源 | 从其他 L1 子树调入的科目 |
| 本行余额 | 当前计算金额 |
| 重分类源/目标 | 是否参与重分类扣减/增加 |

### Tab 4：诊断

一期可以做成页面顶部提示，后续独立 Tab。

诊断项：

| 诊断 | 判定 |
|---|---|
| 未映射科目 | 有余额的叶子科目 resolve 后无 lineCode |
| 空报表项目 | 非 header/total 行无任何科目命中 |
| 重复映射 | DB 层理论阻止，导入迁移时仍检测 |
| 父子余额差异 | L1 自身余额和子树叶子合计不一致 |
| 重分类源无承接 | reclass deduction source 没有匹配到 `reclassSource=true` 的 line |
| 重分类目标无承接 | targetAccount 没有匹配到 `reclassTarget=true` 的 line |

## Service 设计

新增目录：

```text
server/services/finance/statements/mapping/
├── types.ts
├── account-tree.ts
├── resolver.ts
├── preview.ts
├── l1-checks.ts
└── seed-from-config.ts
```

### types.ts

定义 DTO：

```ts
interface StatementAccountNode {
  code: string;
  name: string;
  level: number;
  balanceDirection: string;
  closingDebit: number;
  closingCredit: number;
  netAmount: number;
  explicitLineCode: string | null;
  resolvedLineCode: string | null;
  resolvedLineLabel: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  status: "all" | "partial" | "exception" | "unmapped";
  children: StatementAccountNode[];
}

interface L1BalanceCheck {
  code: string;
  name: string;
  balanceDirection: string;
  ownDebit: number;
  ownCredit: number;
  childrenDebit: number;
  childrenCredit: number;
  diffDebit: number;
  diffCredit: number;
  ok: boolean;
  children: L1BalanceCheckChild[];
}

interface StatementLineMappingPreview {
  lineCode: string;
  label: string;
  section: string;
  side: string;
  accounts: StatementMappedAccount[];
  exceptionsIn: StatementMappedAccount[];
  exceptionsOut: StatementMappedAccount[];
  amount: number;
  reclassSource: boolean;
  reclassTarget: boolean;
}
```

### account-tree.ts

职责：

- 查询当前公司/年度 `FinanceAccount`
- 查询指定 period 或年度末 period 的 `FinanceAccountBalance`
- 构建科目树
- 标注 level
- 默认返回 L1-L3

不要在 UI 里拼树。

### resolver.ts

职责：

- 加载 mapping 表
- 最近祖先优先解析每个叶子科目归属
- 返回 `accountCode -> lineCode`
- 标注 explicit/inherited/none

### preview.ts

职责：

- 基于 resolver 输出报表项目视图
- 每个 lineCode 收集实际命中的科目
- 计算 exceptionsIn / exceptionsOut
- 检测未映射和空项目

### l1-checks.ts

职责：

- 对 L1 科目做父子余额校对
- 用叶子合计做借贷平衡判断
- 输出 L1 和 L2 明细

### seed-from-config.ts

职责：

- 从现有 `FinanceStatementLineConfig.prefixesJson` 初始化 `FinanceStatementAccountMapping`
- 一次性迁移或懒加载补齐
- 标记 `source="migrated"`

规则：

- 如果当前公司/年度/报表类型已有 mapping，不重复生成
- 如果没有 mapping，先从上一年度复制
- 如果上一年度也没有，再从 `FinanceStatementLineConfig.prefixesJson` 生成

## API 设计

扩展现有：

```text
GET /api/modules/finance/statement-config
PUT /api/modules/finance/statement-config
```

### GET

参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| companyCode | 是 | 公司 |
| year | 是 | 年度 |
| statementType | 否 | 默认 `balance` |
| periodId | 否 | 不传默认取该年 12 月或最新期间 |

返回：

```ts
{
  config: FinanceStatementLineConfigDto[];
  accountTree: StatementAccountNode[];
  l1Checks: L1BalanceCheck[];
  mappingPreview: StatementLineMappingPreview[];
  diagnostics: StatementMappingDiagnostic[];
}
```

### PUT

保留现有 line config 保存能力。

新增 mapping 保存建议用独立 action：

```ts
{
  companyCode,
  year,
  statementType,
  action: "upsertMapping",
  accountCode,
  lineCode,
  includeChildren
}
```

清除例外：

```ts
{
  companyCode,
  year,
  statementType,
  action: "deleteMapping",
  accountCode
}
```

如果 route 超过 120 行，拆到：

```text
server/services/finance/statements/mapping/actions.ts
```

API route 只做鉴权、参数校验、调 service、返回 DTO。

## 报表计算迁移

### 当前

`computeBalanceSheet()` 依赖 line config 的：

```text
prefixes
subtractPrefixes
```

### 目标

普通报表行金额改为：

```text
leaf account -> mapping resolver -> lineCode -> aggregate debit/credit
```

Header/Total/GrandTotal 仍由 `FinanceStatementLineConfig` 控制。

### 迁移策略

Batch 早期不直接切换报表计算，先做到可预览。

切换时需要保证：

- 与旧 prefix 口径在默认迁移后金额一致
- 显示 diagnostics
- 保留 fallback：如果某公司/年度 mapping 为空，则先从旧 config seed mapping
- 不再让报表计算直接读 `prefixesJson` 聚合普通行

### subtractPrefixes 怎么处理

短期：

- 把 `subtractPrefixesJson` 迁移为特殊 mapping 类型会复杂
- 一期可以继续保留 `subtractPrefixesJson` 给折旧/坏账准备等减项

中期：

新增字段或独立表：

```text
mappingRole = include | subtract
```

但一期不建议扩大范围。

## 批次计划

### Batch M1：Schema 根基

改动：

- 新增 `FinanceStatementAccountMapping`
- 补索引和注释
- 更新 `app/finance/ARCHITECTURE.md` 数据模型说明

不做：

- 不改 UI
- 不改报表计算

验收：

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
```

### Batch M2：Mapping seed / inheritance

改动：

- 新增 `seed-from-config.ts`
- 实现 `ensureStatementMappings(companyCode, year, statementType)`
- 规则：
  - 当前年已有 mapping：不动
  - 当前年无 mapping，上年有：复制上年
  - 上年无：从 `FinanceStatementLineConfig.prefixesJson` 生成

验收：

- 对 `02/2025/balance` 能生成初始 mapping
- 重复执行幂等
- 不覆盖手动 mapping

### Batch M3：Resolver + account tree

改动：

- 新增 `account-tree.ts`
- 新增 `resolver.ts`
- 实现最近祖先优先
- 输出 L1-L3 科目树

验收：

- `1221 -> otherReceivableNet`、`122103 -> otherCurrentAssets` 时，`12210301` resolve 到 `otherCurrentAssets`
- 无 mapping 的叶子返回 unmapped
- L1 status 能区分 all / partial / unmapped

### Batch M4：L1 余额校对

改动：

- 新增 `l1-checks.ts`
- 计算 L1 自身余额、子树叶子合计、差异
- 明确 leaf 借贷平衡校验

验收：

- 02/2024 baseline leaf debit = leaf credit 显示 OK
- all rows 不作为借贷平衡口径
- 父子差异单独显示

### Batch M5：API 扩展

改动：

- 扩展 `GET /api/modules/finance/statement-config`
- 返回 `config/accountTree/l1Checks/mappingPreview/diagnostics`
- 增加 mapping upsert/delete action

验收：

- route 不超过 120 行
- GET 用 `withFinanceReportAccess`
- PUT 用 write wrapper，如果没有现成 wrapper，需要复用当前财务报表写权限或新增清晰 wrapper
- 参数非法返回 400

### Batch M6：页面 guard + 导航

改动：

- `/finance/statement-config/page.tsx` 改为 server component
- 调用 `requireResourceAccess("finance.statement")`
- 把现有 client UI 移到 `StatementConfigClient.tsx`
- 在 `app/lib/module-nav.tsx` finance children 挂出“报表配置”
- 在 `app/finance/lib/nav-utils.ts` 顶部导航挂出“报表配置”

验收：

- 无权限用户不能 URL 直进
- 财务首页能看到入口
- 财务子页顶部能看到入口

### Batch M7：UI Tab 1 - 一级余额校对

改动：

- 新增 `L1BalanceCheckTab.tsx`
- 手风琴显示 L1/L2
- 差异高亮
- 显示编码 + 名称

验收：

- 02/2024 显示 leaf 平衡 OK
- 父子差异如果存在，显示在“父子汇总差异”，不误报借贷不平

### Batch M8：UI Tab 2 - 科目映射树

改动：

- 新增 `AccountMappingTreeTab.tsx`
- 展示 L1-L3
- L1 下拉配置报表项目
- L2/L3 下拉创建例外
- 清除例外后继承父级

验收：

- L1 全部继承显示绿色“全部”
- 有 L2/L3 例外显示“部分例外”
- 每行显示编码、名称、余额、归属

### Batch M9：UI Tab 3 - 报表项目视图

改动：

- 新增 `StatementLineMappingTab.tsx`
- 按 section 分组报表项目
- 展示每个项目实际命中的 L1/L2/L3
- 展示 exceptions in/out
- 展示本行金额

验收：

- 用户能从“其他应收款”看到实际包含哪些余额表科目
- 能看到某个 L3 是从其他 L1 调入还是调出

### Batch M10：报表计算切换

前置条件：

- M1-M9 稳定
- 默认 mapping 与旧 prefix 口径对齐
- diagnostics 可用

改动：

- `computeBalanceSheet()` 普通行改为 mapping 聚合
- Header/Total/GrandTotal 保持 line config
- 保留旧 prefix 只用于 seed，不再作为报表直接计算主路径

验收：

- 同一公司/年度，默认 mapping 与旧报表结果差异可解释
- 未映射科目出现在 diagnostics
- 重分类 source/target 仍能匹配到 line

## 数据校验和诊断规则

### 余额校验

正确口径：

```text
leaf closingDebit sum == leaf closingCredit sum
```

不要用：

```text
all rows closingDebit sum == all rows closingCredit sum
```

因为 all rows 会把父级和子级重复加总。

### 父子汇总校验

对每个非叶子科目：

```text
parent closingDebit / closingCredit
vs
children leaf closingDebit / closingCredit sum
```

这用于识别导入源文件是否父级值和明细值不一致。

### 映射覆盖校验

按叶子科目检查：

- 有余额但无 mapping：未映射
- mapping 到不存在的 lineCode：无效映射
- lineCode 已禁用：无效映射
- 报表项目没有任何命中科目：空项目

## 权限要求

页面：

```text
/finance/statement-config -> requireResourceAccess("finance.statement")
```

API：

| API | 权限 |
|---|---|
| GET `/api/modules/finance/statement-config` | `finance.statement.access` |
| PUT `/api/modules/finance/statement-config` | `finance.statement.write` 或现有报表写 wrapper |

如果当前没有 `withFinanceReportWrite`，建议新增 wrapper，不要复用 ledger write。

## 文件大小要求

计划中的新文件应控制在：

| 文件 | 上限 |
|---|---:|
| API route | 120 行 |
| React component | 220 行 |
| Hook | 220 行 |
| Service | 260 行 |

如果 UI 超过上限，拆：

```text
StatementConfigClient.tsx
components/L1BalanceCheckTab.tsx
components/AccountMappingTreeTab.tsx
components/StatementLineMappingTab.tsx
components/MappingStatusBadge.tsx
hooks/useStatementConfig.ts
```

## 验收场景

### 场景 1：L1 默认映射

配置：

```text
1002 银行存款 -> cash
```

期望：

```text
100201、100202 自动归到 cash
L1 状态显示“全部”
```

### 场景 2：L3 例外

配置：

```text
2221 -> taxes
22210203 -> otherCurrentAssets
```

期望：

```text
222101 -> taxes
2221020301 -> otherCurrentAssets
2221020302 -> otherCurrentAssets
2221 显示“部分例外”
```

### 场景 3：清除例外

操作：

```text
删除 22210203 的 explicit mapping
```

期望：

```text
22210203 重新继承 2221 -> taxes
```

### 场景 4：未映射诊断

给某个有余额的 L1/L2 没有任何祖先 mapping。

期望：

```text
诊断显示未映射科目
报表项目视图不静默吞掉
```

### 场景 5：02/2024 baseline 校验

期望：

```text
leaf 借贷平衡为 OK
父子汇总差异如果存在，单独列出
不再用 all rows sum 判断 baseline 不平
```

## 风险和注意事项

### 1. 科目编码层级不能只按长度判断

当前科目编码可能存在：

```text
1221
122101
2221020303
```

树关系应优先用 `FinanceAccount.parentId` 或已有 parent 关系；只有在 parent 缺失时才用 prefix fallback。

### 2. L1/L2/L3 展示不等于计算只到 L3

UI 一期最多展示 L3，但计算必须最终落到叶子科目，不能因为 UI 不展开 L4/L5 就漏算。

### 3. subtractPrefixes 迁移不要一次做复杂

坏账准备、累计折旧等减项可以先继续使用现有字段。等基础 mapping 稳定后，再升级成 `mappingRole=include|subtract`。

### 4. 报表计算切换必须最后做

先做到“可看、可诊断、可编辑”，再切计算主路径。否则不好判断金额差异来自 mapping 还是计算改动。

### 5. 不要把新 mapping 做成 FinanceAccount 字段

原因：

- 同一科目在不同公司、年度可能归属不同
- 三张报表需要不同映射
- 报表项目本身也可能年度变更

独立 mapping 表更稳。

## Agent 执行提示

建议一次只做一个 Batch，每个 Batch 独立 commit。

每个 Batch 交付时必须说明：

- 改了哪些文件
- 是否改 schema
- 是否改 API
- 是否改 UI
- 是否改报表计算口径
- 跑了哪些检查
- 是否更新 `app/finance/ARCHITECTURE.md`

不要在 M1-M9 期间顺手修 Phase C residual，除非用户明确要求。Phase C residual 是另一条线，应单独提交。

## 参考文档

- `README.md`
- `docs/architecture-governance.md`
- `docs/existing-module-feature-checklist.md`
- `app/finance/ARCHITECTURE.md`
