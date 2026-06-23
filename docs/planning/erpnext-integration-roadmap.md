# ERPNext 集成规划

相关管理层分析框架：`docs/planning/erp-selection-management-framework.md`。

## 系统定位

```
ERPNext = 标准 ERP 事实系统
Workspace = 轻量门户 + 权限 + 分析 + 审批/协同 + AI + 本地特殊流程
```

**ERPNext 负责**：账和业务单据是真的。
**Workspace 负责**：管理者看得懂、能校对、能分析、能协同、能问 AI。

## 总体架构

```
ERPNext
  ├─ 财务会计
  ├─ 总账 / 科目 / 凭证 / 发票 / 付款
  ├─ 采购 / 销售 / 库存
  ├─ 项目 / 成本中心
  ├─ 供应商 / 客户
  ├─ 固定资产
  └─ 标准主数据

Workspace
  ├─ 统一入口 / 权限 / 员工账号
  ├─ 管理层报表和分析
  ├─ 报表校对 / 底稿 / 签核
  ├─ 特殊 Excel 导入和清洗
  ├─ AI 查询和工作助手
  ├─ 工作汇报 / 工作计划
  ├─ 人事行政轻流程
  ├─ 文档中心 / 资料库
  └─ ERPNext 外围增强
```

## 核心原则

### 1. ERPNext 存标准业务事实
财务账、科目、凭证、发票、付款、库存、采购、销售、客户/供应商、项目/成本中心全部由 ERPNext 管理。

### 2. Workspace 不再复制 ERP 表
- 不再长期维护自己的完整总账引擎
- 不再自己做完整库存台账
- 不再自己做完整采购/销售/应收应付
- 本地表只做缓存、分析结果、配置、审批状态、补充字段

### 3. Workspace 只做增强层
更好看的页面、符合内部习惯的报表、AI 问答、管理层分析、Excel 兼容导入、审批/签核/校对、跨模块看板、权限聚合入口。

## 模块分工

| 模块 | ERPNext 做 | Workspace 做 |
|---|---|---|
| 财务会计 | 科目、凭证、GL Entry、财年、账簿、发票、付款 | 报表分析、重分类、底稿校对、管理报表、AI 查询 |
| 财务报表 | 标准 trial balance、GL、P&L、BS | 中国式报表展示、校对签核、特殊调整、Excel 底稿 |
| 预算 | ERPNext Budget / Cost Center | 管理层预算分析、差异解释、图表 |
| 现金流 | 标准会计数据 | 现金流底稿、人工校对、预测 |
| 库存 | Item、Warehouse、Stock Ledger、Stock Entry | 库存看板、异常分析、中文业务视图 |
| 采购 | Supplier、Purchase Order、Purchase Invoice | 供应商关系、采购分析、审批入口 |
| 销售/客户 | Customer、Sales Order、Sales Invoice | 客户管理、跟进记录、销售分析 |
| 供应商 | Supplier | 供应商关系、评级、资料归档 |
| 项目 | Project、Cost Center | 项目汇报、项目看板、项目财务分析 |
| 固定资产 | Asset、Depreciation | 报表解释、资产分析 |
| HR | ERPNext HR（可选，不一定上） | 现有 Workspace HR 继续保留 |
| 工作汇报 | ERPNext 不适合 | Workspace 自己做 |
| 文档/资料库 | ERPNext 不适合 | Workspace 自己做 |
| AI 助手 | ERPNext 没有 | Workspace 自己做 |

## 功能生命周期标记

Workspace 模块先标记、再隐藏、最后删除，不一步硬删历史功能。

| 状态 | 含义 | 典型模块 |
|---|---|---|
| `workspace-owned` | Workspace 长期自有 | HR、工作汇报、文档、资料库、AI |
| `erpnext-owned` | ERPNext 有标准功能，Workspace 不新建同类能力 | 采购、销售、应收应付、固定资产、MRP、BOM |
| `hybrid-analysis` | ERPNext 存事实，Workspace 做分析/展示/校对 | 财务报表、管理分析、预算、成本分析 |
| `legacy-fallback` | 本地历史数据保留，不继续扩成 ERP 核心 | 总账引擎、本地库存轻台账、历史导入 |
| `deprecated` | 准备隐藏或删除 | 后续观察后单独标记 |

当前标记：`finance.ledger` 为 `legacy-fallback`；`finance.statements`、`finance.analysis`、`finance.budget`、`finance.cost` 为 `hybrid-analysis`；`finance.tax`、`finance.treasury` 为 `erpnext-owned`；旧库存入口已从生产管理模块移除。

## 数据策略

三类表，不混：

### 1. ERPNext 事实（只读缓存）
来源：ERPNext API。本地只缓存，不手工改。

```sql
-- 命名规范
FinanceErpAccountSnapshot
FinanceErpGLEntrySnapshot
FinanceErpCustomerSnapshot
FinanceErpSupplierSnapshot
InventoryErpStockSnapshot
PurchaseErpOrderSnapshot
SalesErpInvoiceSnapshot
```

### 2. Workspace 配置
报表映射、重分类规则、展示偏好、权限配置。

### 3. Workspace 结果
校对记录、确认报表、AI 分析结果、管理层批注。

## 系统边界

```
ERPNext API
  ↓ read-only sync
Workspace Snapshot
  ↓ service compute
Workspace Analysis / Review / AI
```

写回 ERPNext 必须单独做：

```
Workspace Draft
  → 审批
  → ERPNext API write
  → ERPNext 返回正式单据号
  → Workspace 记录 externalId
```

禁止在页面按钮里直接写回 ERPNext。

## 权限方向

- Workspace 权限管入口和展示
- ERPNext 权限管 ERP 内部操作
- Workspace 调用 ERPNext API：service account + Workspace 二次鉴权

## 当前财务模块收口

不推翻已做的 P3。：

1. 现有本地导入继续作为历史数据 fallback
2. 新增 `sourceSystem = local | erpnext`
3. 报表 service 支持两套 source：
   - `local`：现有 FinanceAccount / Voucher / Balance
   - `erpnext`：ERPNext Account / GL Entry snapshot
4. 新公司优先走 ERPNext
5. 旧 Excel 数据慢慢迁移或保留为历史归档

## 四阶段路线

### 第一阶段：战略收口（当前）
- 停止新增完整采购/库存/销售/应收应付引擎
- 已有财务继续做分析和报表层
- 完成本文档

### 第二阶段：只读对接
- ERPNext connector
- Account sync
- GL Entry sync
- Customer/Supplier sync
- Item/Warehouse/Stock sync
- Company/Cost Center/Project sync

### 第三阶段：Workspace 页面切换数据源
- 财务报表 source 切换
- 库存看板 source 切换
- 外部关系客户/供应商 source 切换
- 采购/销售分析 source 切换

### 第四阶段：谨慎写回
- 只从审批后的 Workspace draft 写回 ERPNext
- 先做低风险对象：项目备注、附件、分析标签
- 后做高风险对象：凭证、采购单、付款单

## 禁止事项

1. 禁止在 Workspace 新建完整业务单据引擎（总账、库存、采购、销售、应收应付）
2. 禁止绕过审批直接写 ERPNext
3. 禁止在页面按钮里直接调 ERPNext write API
4. 禁止把 ERPNext 直连表当做本地事实表直接修改
5. snapshot 表必须带 `Erp` 前缀，一眼可识别为镜像数据
