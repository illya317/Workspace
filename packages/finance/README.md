# @workspace/finance

财务业务包边界。当前承载模块注册、财务通用页面模板、筛选模板、重分类 UI，以及第一批财务 server/types/import 实现。后续财务模块继续按目录逐步迁入。

```txt
ui/        # 财务页面组件和 hooks
server/    # 财务查询、报表、预算、成本和 DTO 组装
types/     # 财务 DTO 和领域类型
constants/ # 财务选项、字段常量和非业务事实常量
server/import/ # 总账核对与受控数据导入脚本复用的解析、清洗流程
```

已迁入：

- `ui/components/ReclassConfigView.tsx`：财务重分类配置 section/footer builder。
- `ui/components/AccountCodeInput.tsx`、`Pagination.tsx`、`ReclassConfigRow.tsx`、`ui/ledger/reclassColumns.tsx`：重分类配置视图的局部依赖。
- `ui/components/FinanceShell.tsx`：财务模块页面壳和二级导航。
- `ui/components/FinanceFilters.tsx`：生成财务全域筛选 toolbar spec 的 `useFinanceFilterToolbarItems`。
- `ui/components/ReclassReviewView.tsx`、`ui/components/ReclassReviewModal.tsx`：重分类审核 section/modal builder，基于 Core 表格与字段规格。
- `ui/budget/*`：预算管理页面、预算版本选择、部门/研发预算筛选和预算表格；旧 `app/finance/budget/{components,hooks}` 已迁入包内。
- `ui/cost/*`：成本管理页面、筛选、汇总、追溯弹窗和成本明细表格；旧 `app/finance/cost/{components,hooks}` 已迁入包内，并统一基于 Core 表格/分页/按钮 primitive。
- `ui/navigation/nav-utils.ts`：财务子模块导航和权限过滤 helper。
- `types/reclass.ts`：重分类配置 UI 使用的候选 DTO 类型。
- `server/import/`、`server/budget/`、`server/analysis/`：总账核对和受控脚本复用的导入解析、预算版本/预算数据和预算分析服务；旧 `server/services/finance/{import,budget,analysis}` 已收口到财务业务包。
- `server/ledger/`、`server/schedules/`：财务科目、凭证、余额滚动、重分类、重分类规则和调度计算服务；旧 `server/services/finance/{ledger,schedules}` 已收口到财务业务包。
- `server/cost/`：成本汇总、发货、工资、成本构成、成本分析和导入记录服务；旧 `server/services/finance-cost` 已收口到财务业务包。
- `server/statements/`：财务报表配置、映射、系统账报表生成和差异计算服务；旧 `server/services/finance/statements` 已收口到财务业务包。
- `server/statements/amount-explanation/`：金额来源解释引擎（只读、确定性）：fail-closed 十进制归一化、有界证据 provider（凭证明细行/合并抵销匹配事实/重分类血缘/合并输出折算血缘，workbook 单元格为预留端口）、证据归一去重、Finance 排序与编排。公共合同在 `types/statement-explanation.ts`；服务入口 `explainAmountOrigin` 只经 `@workspace/finance/server` curated 导出，恒为 `accountingTreatment: "not_evaluated"`。
- `server/statements/comparison/`：报表对比证据导入生命周期（.xlsx 上传 envelope/preflight/隔离解析、映射检测与确认、不可变 run/lines、归档）。`run-execution.ts` 负责 run 执行接线：解析系统目标行（单体=确定性报表输入重算指纹；合并=绑定的输出快照），目标指纹漂移先 CAS 失效映射再拒绝建 run，逐行调 `explainAmountOrigin`，落 immutable run + lines。`queries.ts` 是只读列表/详情 DTO；`route-commands.ts` 是 route 接缝（命令归一 + 领域错误到 ServiceResult 的映射）。固定边界：只写 comparison 四表，不创建/更新任何会计事实。

## 对比证据与金额解释 API

路由全部挂在 `/api/modules/finance/statements/**`（`finance.statements` 资源），route 只做 auth/RBAC/Zod/一次 service 调用：

| Method/path | 动作 | 持久化 |
|---|---|---|
| `POST /comparisons` | 显式 `import` + `create`（网关同时强制） | 证据包 |
| `GET /comparisons`、`GET /comparisons/:id`、`GET /comparisons/runs/:runId` | `read` | 无 |
| `PUT /comparisons/:id/mapping` | `update`（mapping revision CAS，冲突 409） | 映射 |
| `POST /comparisons/:id/runs`（:id=mappingId） | `create` | 不可变 run+lines |
| `POST /comparisons/:id/archive` | `update`（归档而非删除） | 证据包状态 |
| `POST /amount-explanations/query` | `read`（注册的显式 read-only POST exception，无持久化） | 无 |

`finance.statements.import` 是显式动作：不经 `finance` 容器继承，宽 POST=create 默认不会放行上传。功能开关 `finance.statements.comparison.enabled`（SystemConfig，缺省 false）关闭时上传/映射/run/query 一律 403。Agent 只能经 API discovery 中注册的 `amount-explanations/query` 使用该能力；结果 DTO 恒含 residual/ambiguity/truncation 与 `accountingTreatment: "not_evaluated"`，Agent 叙述必须携带这些字段，不得声称对账完成或会计处理已评估。


旧 `app/finance/components/*`、`app/finance/budget/{components,hooks}` 和 `app/finance/cost/{components,hooks}` 兼容出口已删除。财务页面模板、筛选、分页、表格、预算、成本和重分类共享 UI 必须从 `@workspace/finance/ui` 消费；新增真实实现不得回到 `app/finance/components` 或 route 子目录。
