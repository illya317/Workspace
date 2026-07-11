# ERP 选型与 Workspace 转型管理层分析框架

## 0. 使用方式

本文档用于把 ERP 选型材料拆给多个 agent 分头补证据，最后汇总成管理层汇报。

默认工作假设：

- ERPNext 是首选 POC 对象，原因是完整开源、财务/库存/采购/销售/生产一体化程度高，能降低继续自研 ERP 核心的风险。
- Odoo Community 是备选，不付费前提下需要额外评估 OCA/第三方模块组合的维护成本。
- Workspace 不再扩展成完整 ERP，定位收缩为分析、AI、报表校对、特殊流程和统一入口。
- ERPNext 是否能替代用友做账，必须通过真实数据 POC、财务确认和并行跑账验证后才能下结论。

明确禁止的汇报口径：

- 不要写“ERPNext 已确认可以完全替代用友”。
- 不要写“ERPNext 对中国财务原生适配更好”作为已确认结论。
- 不要写“用友软件费一定可以省掉”。

允许的汇报口径：

- “ERPNext 是当前最值得优先验证的开源 ERP 底座。”
- “中国财务、本地税务、发票、审计导出和财务人员接受度是 POC 核心验证项。”
- “POC 通过后，再决定是否逐步替代用友。”

相关内部文档：

- [ERPNext 集成规划](./erpnext-integration-roadmap.md)
- [Finance 财务总账模块架构](../../app/finance/ARCHITECTURE.md)

## 1. 管理层汇报主线

### 1.1 当前问题

其他 agent 需要补证据说明：

- Workspace 已经开始重复建设 ERP 核心能力，例如财务总账、财务报表、库存、采购/销售潜在扩展。
- 继续自研完整 ERP 会带来专业性风险、维护成本、数据一致性风险、权限审计风险和人员依赖。
- 用友、Excel、Workspace 多系统并存会导致重复录入、信息滞后、跨部门数据不通。

建议管理层表达：

> 继续把 Workspace 做成完整 ERP，会把公司推向长期维护一个自研 ERP 的路线。更稳妥的方向是引入成熟 ERP 作为事实系统，Workspace 专注于管理分析、AI、协同和特殊流程。

### 1.2 方案比较矩阵

| 方案 | 结论口径 | 需要补证据 |
|---|---|---|
| 继续自研 Workspace ERP | 不推荐，只保留分析/协同/AI/特殊流程 | 当前财务、库存、报表已自研到什么程度；继续扩展的维护成本 |
| ERPNext | 首选 POC 对象，完整开源 ERP 底座 | 财务、库存、生产、采购、API、中国本地化验证 |
| Odoo Community | 备选，库存/生产强，但 open-core + OCA 组合维护复杂 | Community 能力边界、OCA 可替代范围、缺口清单 |
| Odoo Enterprise | 功能强，但付费，不符合当前约束 | 企业版费用、付费功能清单 |
| 继续用友 | 稳定合规基线，但信息流通、API、管理分析弱 | 当前费用、API 能力、人工导出流程、痛点 |

评分维度：

- 财务合规与做账能力
- 中国本地化可落地性
- 库存/生产/采购/销售覆盖度
- API 与二次开发能力
- 总拥有成本
- 升级维护风险
- 用户体验和培训成本

### 1.3 推荐方案

推荐写法：

> 先用 ERPNext 做本地 POC，不立即替换用友；Workspace 不再继续扩展 ERP 核心，转为 ERPNext 的上层分析、AI、报表校对和统一入口。POC 通过后，再决定是否逐步替代用友。

决策原则：

- 用友在 POC 和并行期继续作为财务基准系统。
- ERPNext 先验证事实能力，不先做大规模二开。
- Workspace 不再新增完整采购、库存、销售、应收应付和总账引擎。

## 2. ERPNext 与 Workspace 分工

### 2.1 ERPNext 负责

- 会计事实：科目、凭证、GL Entry、财年、发票、付款。
- 业务事实：客户、供应商、物料、仓库、库存流水、采购、销售、生产、固定资产。
- 标准能力：权限、表单、审批、标准报表、审计日志、附件。

### 2.2 Workspace 负责

- 管理层驾驶舱和分析。
- 中国式财务报表展示、底稿、校对、特殊调整。
- AI 查询、自然语言问数、异常解释。
- 工作汇报、工作计划、人事行政轻流程、文档中心、资料库。
- ERPNext 数据缓存、跨系统统一入口和角色友好的轻量页面。

### 2.3 前端策略

默认策略：

- 短期直接使用 ERPNext/Frappe 前端处理标准 ERP 操作，例如录凭证、库存出入库、采购单、销售单。
- Workspace 只做上层体验，不一开始重写 ERPNext 前端。
- 如果某些角色不适合 Frappe UI，再为这些角色做 Workspace 专用页面，通过 ERPNext API 对接。

管理层表述：

> ERPNext 解决标准业务系统问题，Workspace 解决“管理者看得懂、部门用得顺、AI 能解释”的问题。

## 3. 降本增效框架

### 3.1 降本项分类

可确认方向：

- 减少 Workspace 自研 ERP 模块维护。
- 减少 Excel 人工汇总和重复录入。
- 降低多系统数据对账成本。

待验证方向：

- 是否减少网站/服务器维护费：自部署 ERPNext 仍需要服务器、备份、升级、运维；只能说系统整合后可能减少重复服务器和外包维护。
- 是否减少用友费用：只有 ERPNext 做账 POC 通过、财务认可、审计/税务要求满足后才能成立。

不能直接承诺：

- 用友软件费一定不需要了。
- ERPNext 可以直接满足中国税务、发票、税控全部要求。
- ERPNext 上线后不需要运维。

### 3.2 增效项场景

| 场景 | 增效说明 |
|---|---|
| 财务 | 凭证、余额、报表、底稿、校对自动贯通 |
| 人事 | 员工、部门、权限、审批信息统一 |
| 销售 | 客户、订单、发票、回款可追踪 |
| 采购/供应商 | 供应商、采购、入库、应付联动 |
| 库存/生产 | 物料、批号、有效期、生产领料、成品入库联动 |
| 法务 | 合同、客户/供应商、付款节点、风险提醒联动 |
| 管理层 | 实时看利润、库存、现金流、应收应付、项目进度 |

## 4. POC 验证清单

### 4.1 财务替代用友验证

必须用真实数据验证：

- 导入 1 家公司完整科目表。
- 导入期初余额和 1 年凭证。
- 输出总账、明细账、科目余额表、资产负债表、利润表、现金流量表。
- 与用友同期间结果逐项比对。
- 验证凭证字号、附件、审核、反审核、结账、期间锁定。
- 验证多公司、多币种、成本中心、项目、往来单位。
- 验证报表导出、审计追溯、备份恢复。
- 财务负责人书面确认“是否可替代用友做账”。

验收输出：

- 用友 vs ERPNext 差异表。
- 差异解释和修复方案。
- 财务确认结论。
- 不可替代项清单。

### 4.2 中国本地化验证

必须明确：

- 中国企业会计准则科目表能否顺利落地。
- 增值税三级科目、进项/销项/转出等处理是否可配置。
- 发票/金税系统是否只能做外部衔接。
- 税务申报是否仍需外部系统。
- 是否需要第三方本地化 app 或自研 app。

外部事实参考：

- ERPNext 科目表可自定义和导入：[ERPNext Chart of Accounts](https://frappe.io/erpnext/accounting/chart-of-accounts)
- 中国 ERP 本地化通常涉及金税/发票/税务申报外部流程：[China Briefing - ERP localization to China](https://www.china-briefing.com/news/how-to-localize-your-global-erp-to-china/)

### 4.3 库存与生产验证

必须验证：

- 物料、批号、有效期、仓库、库存流水。
- 采购入库、销售出库、盘点、调拨。
- BOM、生产工单、领料、成品入库。
- GMP 所需批次追溯、质检状态、过期预警。

验收输出：

- 一套采购入库到生产领料再到成品入库的样例。
- 库存台账和批次追溯截图。
- 无法满足的 GMP 要求清单。

### 4.4 API 与 Workspace 集成验证

必须验证：

- ERPNext API 拉取 Account、GL Entry、Item、Warehouse、Customer、Supplier。
- Workspace 建 snapshot，不直接改 ERPNext 事实表。
- Workspace 报表支持 `local` 与 `erpnext` 数据源切换。
- 写回必须走 Workspace draft -> 审批 -> ERPNext API -> 回写 `externalId`。

验收输出：

- ERPNext connector demo。
- snapshot 表设计草案。
- Workspace 财务报表切换数据源 demo。
- 写回审批边界说明。

## 5. 落地路线

### Phase 0：管理层决策材料

交付：

- ERPNext / Odoo / 继续用友 / 继续自研对比。
- 成本收益表。
- 风险清单。
- POC 计划和验收标准。

### Phase 1：ERPNext 本地部署 POC

交付：

- 本地 ERPNext 环境。
- 1 家公司财务数据导入。
- 1 套库存/采购/生产样例。
- 与用友报表比对结果。

### Phase 2：Workspace 只读对接

交付：

- ERPNext connector。
- Account / GL Entry / Customer / Supplier / Item / Warehouse snapshot。
- Workspace 财务报表和分析切换 ERPNext 数据源。

### Phase 3：业务试运行

交付：

- 财务和库存并行跑 1 到 2 个期间。
- 用友作为基准系统保留。
- 每周记录差异、缺口、培训问题。

### Phase 4：是否替代用友

决策条件：

- 财务报表与用友一致或差异可解释。
- 财务负责人确认可用。
- 审计、税务、发票流程有明确方案。
- 备份、权限、日志、恢复演练通过。
- 管理层确认切换窗口。

## 6. Agent 分工模板

### Agent A：管理层汇报稿

输出：

- 10 页以内汇报结构。
- 一页结论。
- 一页成本收益。
- 一页风险和 POC 里程碑。

### Agent B：ERPNext 财务 POC 可行性

输出：

- ERPNext 财务模块能力表。
- 用友替代验证清单。
- 中国会计、税务、发票差距。
- 真实数据 POC 步骤。

### Agent C：Odoo Community 对照

输出：

- Odoo Community + OCA 能力边界。
- 哪些功能需要 Enterprise 或第三方。
- 与 ERPNext 的不付费前提对比。

### Agent D：Workspace 改造影响

输出：

- 哪些 Workspace 模块停止扩展。
- 哪些模块保留。
- 哪些表变成 ERPNext snapshot。
- 哪些 API/service 需要新增 `sourceSystem`。

### Agent E：成本收益和运维

输出：

- 当前用友、服务器、外包/维护、人力成本清单。
- ERPNext 自部署成本。
- 迁移成本、培训成本、升级维护成本。
- 3 年 TCO 对比。

### Agent F：风险与合规

输出：

- 财务合规风险。
- 数据迁移风险。
- 权限、审计、备份风险。
- 并行运行和回滚方案。

## 7. 最终审核标准

每个 agent 输出必须满足：

- 每个结论都有证据来源，不能证明的必须标记为假设。
- “能替代用友”必须有 POC 结果，不能凭主观判断。
- 成本节省必须区分一次性成本、年度成本、人力成本和机会成本。
- Workspace 与 ERPNext 边界不能混乱：ERPNext 存事实，Workspace 做增强。
- 所有高风险项必须有验收标准和回滚方案。

## 8. 汇总材料建议目录

```text
docs/planning/erp-selection-management-framework.md
docs/planning/erpnext-integration-roadmap.md
docs/planning/erpnext-poc-finance-checklist.md        # Agent B 可新增
docs/planning/odoo-community-comparison.md            # Agent C 可新增
docs/planning/workspace-erpnext-impact-analysis.md     # Agent D 可新增
docs/planning/erp-tco-analysis.md                      # Agent E 可新增
docs/planning/erp-risk-and-compliance.md               # Agent F 可新增
```
