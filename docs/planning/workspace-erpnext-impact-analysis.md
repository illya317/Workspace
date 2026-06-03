# Workspace 与 ERPNext 改造影响分析

> 对应框架 Agent D：分析 Workspace 现有自研 ERP 核心到什么程度、哪些模块停止扩展、哪些保留、哪些表变 snapshot。

## 1. 现状盘点：Workspace 已自研的 ERP 核心能力

### 1.1 财务总账引擎（高度自研）

`prisma/models/finance-ledger.prisma` 中已存在一套接近完整的总账引擎：

| 领域 | 已有表 | 复杂度 |
|------|--------|--------|
| 科目体系 | `FinanceAccount`（层级科目、辅助核算字段） | 高 |
| 会计期间 | `FinancePeriod`（年月、结账状态） | 中 |
| 凭证引擎 | `FinanceVoucher` + `FinanceVoucherItem`（借贷分录、去重指纹） | 高 |
| 余额计算 | `FinanceAccountBalance`（期初/本期/期末，滚动计算） | 高 |
| 年度校准 | `FinanceBalanceSnapshot` + `Row`（外部软件余额表导入、基准/核对双模式） | 高 |
| 重分类系统 | `FinanceReclassRule` + `ItemRule` + `ReclassResult` + `BalanceReclassAdjustment` | 高 |
| 报表映射 | `FinanceStatementAccountMapping` + `FinanceStatementLineConfig`（mapping-based 资产负债表） | 高 |
| 底稿/校对 | `FinanceStatementWorkpaper` + `Review` + 行表（P3 Batch 2/3） | 中 |
| 导入追溯 | `FinanceLedgerImport`（批次、校验、审计） | 中 |

**结论**：Workspace 已经自建了总账引擎的完整链路：科目 → 凭证 → 余额 → 重分类 → 报表映射 → 底稿校对。这套系统投入了显著的工程成本，但继续扩展将面临专业性风险（税务、审计、多准则兼容）。

### 1.2 库存管理（基础自研）

`prisma/models/inventory.prisma`：

| 已有表 | 功能 |
|--------|------|
| `StockRawMaterial` | 原料库存主数据 |
| `StockPackaging` | 包材库存主数据 |
| `StockFinishedGoods` | 成品库存主数据 |
| `StockBatch` | 批次信息（targetType/targetId 多态关联） |
| `StockOperation` | 库存操作记录（采购/入库/出库/领用/调整/退货） |
| `StockReturn` | 成品退货 |

**结论**：库存模块仅到主数据 + 流水记录层面，缺乏完整的库存台账、成本核算、MRP、BOM、生产工单。如果业务需要完整的库存/生产管理，继续自研的投入会非常大。

### 1.3 成本管理（Excel 导入后的分析层）

`prisma/models/finance-cost.prisma`：

| 已有表 | 来源 | 用途 |
|--------|------|------|
| `FinanceShipment` | 发货统计 Excel | 销售明细、回款追踪 |
| `FinanceSalesSalary` | 业务员工资 Excel | 薪酬计算 |
| `FinanceCostStructureRow` | 成本结构 Excel | 产品成本归集 |
| `FinanceCostAnalysisRow` | 成本分析 Excel | 多维度指标 |
| `FinanceWorkshopReport` | 车间日报 Excel | 工分、人工成本 |
| `FinanceDataImport` | 导入批次头 | 追溯 |

**结论**：成本模块本质上是 Excel 导入后的结构化存储和分析层，没有独立的成本核算引擎。核心数据仍来自外部 Excel，系统做的是归集、展示和简单分析。

### 1.4 预算管理（Excel 导入）

`prisma/models/finance-budget.prisma`：

| 已有表 | 功能 |
|--------|------|
| `FinanceBudgetVersion` | 版本头（draft/active/archived） |
| `FinanceBudgetDept` | 部门费用预算（12 个月） |
| `FinanceBudgetRd` | 研发费用预算（12 个月） |

**结论**：预算模块同样是 Excel 导入驱动，与科目表有 FK 关联，但没有预算执行控制、预算占用、预算调整工作流。

---

## 2. 停止扩展清单

根据 `erpnext-integration-roadmap.md` 的边界原则，以下 Workspace 模块**不再继续扩展为完整 ERP 核心**：

### 2.1 财务总账引擎

- **停止新增**：完整的应收应付引擎、固定资产折旧计算引擎、现金流自动编制引擎、税务申报引擎。
- **已有功能保留为历史数据 fallback**：现有 `FinanceVoucher`、`FinanceAccountBalance`、`FinanceBalanceSnapshot` 等表继续保留，支持 `sourceSystem = local` 的数据源切换。
- **不再新增**：新的会计期间类型、新的凭证模板引擎、新的财务报表自动生成引擎（利润表/现金流量表计算）。

### 2.2 库存管理

- **停止新增**：完整的库存成本核算（FIFO/LIFO/移动加权）、MRP 物料需求计划、BOM 管理、生产工单、WIP 追踪、质量检验流程。
- **已有库存主数据表保留**：`StockRawMaterial`、`StockPackaging`、`StockFinishedGoods` 可继续作为轻量台账使用，但不扩展为完整 ERP 库存模块。

### 2.3 采购/销售引擎

- **停止新增**：采购订单全生命周期管理、供应商评估体系、销售订单到回款的全流程、客户信用管理。
- **已有 `FinanceShipment` 保留**：继续作为发货/销售明细的分析数据源，但不扩展为完整销售管理模块。

### 2.4 HR 薪酬与考勤

- 框架文档建议 ERPNext HR 可选上，Workspace 现有 HR 继续保留。不在本次停止扩展范围内，但需评估是否与 ERPNext HR 重复。

---

## 3. 保留并增强的模块

### 3.1 管理层分析与驾驶舱

- **保留**：所有财务报表的分析展示层（资产负债表、利润表、现金流量表的图表、趋势、对比分析）。
- **增强**：接入 ERPNext snapshot 数据后，分析维度可扩展到实时库存、应收应付账龄、生产进度。

### 3.2 中国式报表展示与校对

- **保留**：`FinanceStatementWorkpaper` + `FinanceStatementReview` 底稿/校对体系。
- **理由**：ERPNext 的标准报表格式不符合中国管理层阅读习惯，Workspace 的报表展示、底稿输入、签核确认是差异化价值。

### 3.3 AI 查询与工作助手

- **保留并大力投入**：自然语言问数、异常解释、数据洞察。这是 Workspace 的核心竞争力。

### 3.4 工作汇报 / 工作清单 / 人事行政轻流程

- **保留**：ERPNext 不擅长的工作流和协同场景。

### 3.5 文档中心 / 资料库

- **保留**：与 ERPNext 互补。

### 3.6 特殊 Excel 导入和清洗

- **保留**：历史数据 fallback、特殊格式导入、数据清洗工具。

### 3.7 成本分析展示层

- **保留**：`FinanceCostAnalysisRow`、`FinanceWorkshopReport` 等表继续作为分析数据源。
- **增强**：接入 ERPNext 生产成本数据后，可做更完整的成本对比分析。

---

## 4. 表级别改造计划

### 4.1 新增 ERPNext Snapshot 表（只读缓存）

按 `erpnext-integration-roadmap.md` 的命名规范：

```
FinanceErpAccountSnapshot
FinanceErpGLEntrySnapshot
FinanceErpCustomerSnapshot
FinanceErpSupplierSnapshot
InventoryErpStockSnapshot
InventoryErpStockLedgerSnapshot
PurchaseErpOrderSnapshot
PurchaseErpInvoiceSnapshot
SalesErpOrderSnapshot
SalesErpInvoiceSnapshot
SalesErpCustomerSnapshot
```

这些表只存 ERPNext API 拉取的数据，本地不手工修改，定期同步。

### 4.2 现有表增加 `sourceSystem` 字段

已在 `erpnext-integration-roadmap.md` 中明确：

| 表/模块 | 改造 |
|---------|------|
| 财务报表 service | 支持 `sourceSystem = local \| erpnext` 切换 |
| 库存看板 | 支持 `local`（现有库存表）和 `erpnext`（snapshot）切换 |
| 成本分析 | 优先保留本地导入数据，后续可扩展拉取 ERPNext 生产成本 |

### 4.3 历史数据归档策略

| 数据类型 | 策略 |
|----------|------|
| 现有凭证/余额/重分类结果 | 保留为 `sourceSystem = local`，不再新增完整引擎功能 |
| 现有库存主数据 | 保留，新公司/新物料优先走 ERPNext |
| 成本 Excel 导入数据 | 保留，后续 ERPNext 生产成本数据可作为对比基准 |
| 预算数据 | 保留，与 ERPNext Budget / Cost Center 并行或切换 |

---

## 5. 需要新增的 API/Service

### 5.1 ERPNext Connector

- `server/services/erpnext/connector.ts` — 统一封装 ERPNext REST API 调用
- 支持 Account、GL Entry、Item、Warehouse、Stock Ledger、Customer、Supplier、Purchase Order、Sales Order、Invoice 等实体的拉取
- 支持 OAuth2 / API Key 认证
- 支持分页、增量同步、失败重试

### 5.2 Snapshot Sync Service

- `server/services/erpnext/sync/*.ts` — 按实体类型的同步逻辑
- 支持全量同步（首次）和增量同步（定时任务）
- 记录同步状态、最后同步时间、差异日志

### 5.3 数据源切换 Service

- 财务报表 service 增加 `sourceSystem` 参数
- `local`：查询现有 FinanceAccount / Voucher / Balance
- `erpnext`：查询 FinanceErpAccountSnapshot / FinanceErpGLEntrySnapshot

---

## 6. 工作量估算

| 阶段 | 工作内容 | 预估工期 |
|------|----------|----------|
| Schema 改造 | 新增 snapshot 表、给现有表加 sourceSystem | 1-2 周 |
| ERPNext Connector | API 封装、认证、基础实体拉取 | 2-3 周 |
| Snapshot Sync | 定时同步、增量同步、失败处理 | 2 周 |
| 财务报表切换 | 报表 service 支持双数据源 | 2-3 周 |
| 库存看板切换 | 库存查询支持双数据源 | 1-2 周 |
| 成本分析增强 | 接入 ERPNext 生产成本（可选） | 2 周 |
| 测试与校准 | 数据一致性校验、diff 工具 | 2 周 |

**总计**：约 3-4 个月完成 Phase 2（只读对接）。

---

## 7. 风险与建议

| 风险 | 影响 | 建议 |
|------|------|------|
| 现有财务数据与 ERPNext 口径不一致 | 报表切换后出现差异 | 先做数据映射和 diff 工具，确认差异可解释后再切换 |
| 重分类规则在 ERPNext 中不存在 | 资产负债表结果不同 | 重分类逻辑保留在 Workspace，基于 ERPNext snapshot 计算 |
| 库存 snapshot 与本地库存数据冲突 | 看板数据混乱 | 新公司优先走 ERPNext，旧数据保留为历史归档 |
| 开发团队同时维护两套系统 | 资源分散 | 明确冻结清单，停止扩展的模块不再接新需求 |
