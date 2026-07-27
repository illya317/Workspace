# Prisma Schema 治理规则

## 1. 文件结构

- `prisma/schema.prisma` **只允许**放 `generator` 和 `datasource`。
- 所有 model 必须按领域放在 `prisma/models/*.prisma`。
- 禁止把新 model 直接写回 `prisma/schema.prisma`。

当前领域划分（57 个 model 文件、244 个 model；逐字段关系以 `docs/generated/tables.md` 为准）：

| 文件 | 领域 | 模型 |
|------|------|------|
| `administration-erp-diligence.prisma` | ERP 流程尽调 | ErpDueDiligenceSubmission, ErpDueDiligenceEvidenceAttachment |
| `agent.prisma` | Agent 配置、会话与执行 | AgentProfile, AgentRuntimeBinding, AgentSession, AgentProposal, AgentRun |
| `approvals.prisma` | 审批请求、事件与工作流策略 | ApprovalRequest, ApprovalEvent, WorkflowPolicy |
| `auth-rbac.prisma` | 认证、权限、授权账本与通知 | User, Resource, PermissionActionNormalization, UserResourceActionGrant, PositionResourceActionGrant, DepartmentResourceActionGrant, PermissionGrantLedgerEvent, Notification |
| `capital-securities.prisma` | 资本证券、工商变更与股权投影 | OwnershipInterest, CompanyRegistryChange, CompanyRegistryOwnershipParticipant, ShareCapitalEvent, ShareCapitalTransaction, ShareCapitalSnapshotPosition, ShareholderGroup, ShareholderGroupMembership |
| `contracts.prisma` | 行政合同 | Contract |
| `document-templates.prisma` | 文档模板空间与版本化模板 | DocumentTemplateSpace, DocumentTemplate |
| `external.prisma` | 共享主体与外部角色 | Party, PartyNameHistory, ExternalPartyProfile, ExternalPartyRole, ExternalPartySourceMapping |
| `finance-assets.prisma` | 财务资产卡片、期间记录与调整 | FinanceAssetCard, FinanceAssetCostLine, FinanceAssetExpenseAllocation, FinanceAssetImportBatch, FinanceAssetPeriodEntry, FinanceAssetAdjustment |
| `finance-budget.prisma` | 预算管理 | FinanceBudgetVersion, FinanceBudgetDept, FinanceBudgetRd |
| `finance-cashflow.prisma` | 现金流项目、分配与调整 | FinanceCashFlowItem, FinanceCashFlowAllocation, FinanceCashFlowAllocationAdjustment |
| `finance-consolidation-entry-line.prisma` | 合并抵销分录行 | FinanceConsolidationEntryLine |
| `finance-consolidation-match.prisma` | 合并匹配组、来源与公司映射规则 | FinanceConsolidationMatchGroup, FinanceConsolidationMatchSource, FinanceVoucherCompanyMappingRule |
| `finance-consolidation-output.prisma` | 合并输出快照 | FinanceConsolidationOutputSnapshot |
| `finance-consolidation-scope.prisma` | 单次合并报表范围准备 | FinanceConsolidationScopeSelection |
| `finance-consolidation.prisma` | 合并批次、快照、汇率与抵销 | FinanceConsolidationBatch, FinanceCompanyCurrencyPolicy, FinanceConsolidationBatchEvent, FinanceConsolidationControlDecision, FinanceConsolidationEntitySnapshot, FinanceConsolidationSourceSnapshot, FinanceConsolidationRateSnapshot, FinanceConsolidationEntry, FinanceConsolidationTaxEffect |
| `finance-cost.prisma` | 成本管理 | FinanceDataImport, FinanceShipment, FinanceSalesSalary, FinanceCostStructureRow, FinanceCostAnalysisRow, FinanceWorkshopReport |
| `finance-dimensions.prisma` | 辅助核算、往来分类与未清项 | FinanceAuxiliaryMember, FinanceCounterpartyClassification, FinanceVoucherItemAuxiliary, FinanceAuxiliaryBalance, FinanceAuxiliaryBalanceMember, FinanceOpenItem, FinanceOpenItemSettlement, FinanceOpenItemAuxiliary |
| `finance-group-chart.prisma` | 集团科目与共享会计政策版本 | FinanceGroupAccount, FinanceAccountingPolicyVersion, FinanceGroupAccountRevision, FinanceGroupAccountMapping |
| `finance-import-evidence.prisma` | 财务导入证据、映射与血缘 | FinanceReadableSourcePackage, FinanceReadableImportRun, FinanceSourceLedgerMapping, FinanceAccountAuxiliaryRequirement, FinanceSourcePeriodStatus, FinanceSourceSubsystemStatus, FinanceAccountLineage |
| `finance-import.prisma` | 财务导入批次与来源余额 | FinanceLedgerImport, FinanceSourceAccountBalance |
| `finance-ledger.prisma` | 财务总账、凭证、余额与快照 | FinanceAccount, FinancePeriod, FinanceStatementVoucherExclusion, FinanceVoucher, FinanceVoucherItem, FinanceAccountBalance, FinanceBalanceSnapshot, FinanceBalanceSnapshotRow |
| `finance-reclass.prisma` | 重分类规则、调整与结果 | FinanceReclassRule, FinanceReclassItemRule, FinanceBalanceReclassAdjustment, FinanceBalanceReclassAdjustmentHistory, ReclassResult |
| `finance-statement-source.prisma` | 报表来源包、工作表与行 | FinanceStatementSourcePackage, FinanceStatementSourceSheet, FinanceStatementSourceLine |
| `finance-statement.prisma` | 财务报表底稿与汇率 | FinanceStatementWorkpaper, FinanceStatementWorkpaperLine, FinanceStatementExchangeRate |
| `finance-treasury.prisma` | 币种与银行账户 | FinanceCurrency, FinanceBankAccount |
| `hr-documents.prisma` | 部门与岗位说明书 | DepartmentDescription, PositionDescription |
| `hr-performance.prisma` | HR 绩效评审 | HrPerformanceReview |
| `hr.prisma` | 人事、组织与公司治理共享角色 | Employee, Employment, Company, Department, Position, EDP, PositionReportOverride, EditHistory |
| `hr-lifecycle.prisma` | 人员生效日与生命周期事件台账 | EmployeeLifecycleEvent |
| `inventory-operations.prisma` | 库存主档、单据、流水、盘点与导入 | InventoryItem, InventoryUnitConversion, InventoryWarehouse, InventoryBatch, InventoryDocument, InventoryDocumentLine, InventoryLedgerEntry, InventoryStocktake, InventoryStocktakeLine, InventoryPeriodClose, InventoryImportBatch |
| `inventory-receipts.prisma` | 成品入库报单 | InventoryReceiptReport, InventoryReceiptProductWorkPoint, InventoryReceiptReportEvent, InventoryReceiptBatch, InventoryReceiptOutput |
| `inventory.prisma` | 库存历史模型（迁移源） | StockRawMaterial, StockPackaging, StockFinishedGoods, StockBatch, StockOperation, StockReturn |
| `library-governance.prisma` | 资料增强治理与评测 | LibraryTagCandidate, LibraryEntityMention, LibraryMetadataCandidate, LibraryEvaluationCase, LibraryEvaluationEvidence |
| `library-processing.prisma` | 资料处理与交付 | LibraryProcessingJob, LibraryArtifact, LibraryContentChunk, LibrarySearchIndex, LibraryExportJob |
| `library.prisma` | 资料库、尽调、目录与标签 | LibraryDocument, LibraryDocumentVersion, LibraryCategory, LibraryDirectory, DueDiligenceParty, DueDiligenceRequest, DueDiligenceQuestion, DueDiligenceMaterialSelection, LibraryGeneratedSource, LibraryTag, LibraryDocumentTag |
| `mutation-impact.prisma` | Platform 变更影响治理 | MutationImpactBatch, MutationImpactEffect |
| `notification-subscriptions.prisma` | 个人通知订阅 | NotificationSubscription |
| `open-api.prisma` | Open API 接入 | OpenApiClient, OpenApiResource, OpenApiScope, OpenApiClientScopeGrant, OpenApiAccessLog |
| `product-master.prisma` | 跨生产、库存与财务的产品主档 | Product, ProductSourceMapping |
| `production-qc.prisma` | 生产质量执行 | ProductionQcBatch, ProductionQcFieldValue, ProductionQcSignature, ProductionQcAuditEvent |
| `system.prisma` | 系统配置与登录尝试 | SystemConfig, LoginAttempt |
| `work-collaborations.prisma` | 部门协作及参与部门、岗位 | DepartmentCollaboration, DepartmentCollaborationDepartment, DepartmentCollaborationPosition |
| `work-kpi.prisma` | Work KPI | WorkKpiDefinition, WorkKpiAssignment, WorkKpiResultSnapshot |
| `work-meetings.prisma` | 会议、纪要、表决、决议与行动候选 | MeetingType, MeetingSeries, Meeting, MeetingParticipant, MeetingAgendaItem, MeetingMinuteEntry, MeetingProposal, MeetingVote, MeetingDecision, MeetingActionCandidate |
| `work-okr-alignments.prisma` | OKR 计划承接关系 | WorkPlanAlignment |
| `work-okr.prisma` | OKR 周期与治理策略 | WorkOkrCycle, WorkOkrControlPolicy, WorkOkrControlRevision, WorkOkrControlPolicyRevision, WorkPlanGovernanceEvent |
| `work-projects.prisma` | 项目、赋能部门、成员与计划基线 | Project, ProjectEnablingDepartment, EmployeeProject, ProjectPlanPhase, ProjectPlanDependency, ProjectPlanBaseline, ProjectPlanBaselineItem |
| `work-reports.prisma` | 工作汇报与汇报项 | WorkReport, WorkReportItem |
| `work-responsibilities.prisma` | 职责节点与工作引用 | PositionResponsibilityNode, WorkResponsibilityReference |
| `works.prisma` | 工作计划、工作项、证据与执行人 | WorkPlan, WorkItem, WorkKrEvidence, WorkParticipant, DepartmentWorkAssignee, ProjectWorkAssignee |
| `workspace-analytics.prisma` | 工作空间经营分析配置 | WorkspaceAnalysisTemplate, WorkspaceAnalysisTemplateRevision |

## 2. Model 注释规范

每个 model 前必须有 `///` 注释，说明：
- 业务含义
- 数据来源（JSON/手工/导入）
- 是否为事实表

示例：

```prisma
/// 员工基础信息（事实表，来源于 employees.json 导入）
model Employee {
  ...
}
```

## 3. Model 文件行数红线

- 每个 `prisma/models/*.prisma` 文件最多 260 行非空内容。
- 超过 260 行会导致 `npm run schema:check` 失败，必须按更细领域继续拆分。
- `prisma/schema.prisma` 只保留 `generator` 和 `datasource`，不得通过把 model 写回主文件绕过行数红线。

## 4. 事实字段原则

- **DB 只存事实字段**：原始输入、状态、时间、金额、数量等不可再拆的基础数据。
- **Service 层计算结果**：合计、百分比、毛利、单位成本、未回款、排名等派生结果禁止存入 DB。
- **UI 展示结果**：前端展示的计算值应从 API/service 获取，不直接读取派生字段。

`OwnershipInterest` 是明确登记的跨模块物化投影例外：唯一事实仍是股权事件账本，投影只能由同一个账本投影器整体同步，任何页面、API 或人工导入都不得直接增删改。该读模型用于集团关系图和财务合并，必须保留来源事件引用并可从账本完全重建。

共享身份与角色必须保持一条主链：`Party` 是法定主体，`Company.partyId` 是一对一内部公司角色，`ExternalPartyRole.partyId` 是可多角色的客户/供应商资料。内部公司、外部角色和股权关系不得各建一份名称身份表；删除 External 最后一个角色也不得删除 Party。内部公司导入必须先解析或建立受治理 Party，再创建 Company，并在公司编码与 Party 角色发生冲突时停止。

产品粒度同样不得倒退：`Product` 表达制剂身份，`InventoryItem` 表达具体 SKU，成品入库报单属于 `inventory-receipts.prisma`，Production 只拥有产品主档维护与 QC。不得恢复 `production-accounting.prisma` 或在 Inventory 再复制一张产品表。

## 5. Finance Cost 特殊规则

- 所有成本模型必须包含 `sourceFile` / `sourceSheet` / `sourceRow` 追溯字段（或明确说明例外）。
- 禁止把 normalized JSON 原样映射成 DB schema。
- 禁止出现以下派生字段名：`total`, `subtotal`, `ratio`, `rate`, `percent`, `percentage`, `share`, `unitCost`, `grossProfit`, `margin`, `unreceivedAmount`, `remainingAmount`。

## 6. 修改流程

修改 schema 时：
1. 同步更新对应 `ARCHITECTURE.md`：
   - HR → `app/(modules)/hr/ARCHITECTURE.md`
   - Capital Securities → `app/(modules)/capital-securities/ARCHITECTURE.md`
   - Finance Cost → `app/(modules)/finance/cost/ARCHITECTURE.md`
2. 运行验证：
   ```bash
   npm run db:validate && npm run schema:check && npx prisma generate && npm run typecheck:scope -- prisma-client
   ```
3. 提交前确保 `npm run build` 通过。

## 7. 数据发布

开发库不是生产业务数据的发布载体。租户主数据、历史导入和一次性纠错的 manifest 与源文件只存放在私有 `WORKSPACE_CONFIG_DIR/data-release-*`，记录逐文件 SHA-256、受注册 handler、依赖 migration 和结果断言，并通过上传回执与生产数据库回执闭环。Git 中的 Prisma migration 只描述结构；seed 只允许系统级、租户无关且新环境必须可重复建立的初始化事实。具体运维契约见 [数据发布批次与生产回执](./ops/data-releases.md)。
