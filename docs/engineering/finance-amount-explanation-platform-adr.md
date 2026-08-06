# Finance 金额来源解释平台 — 架构决策记录（ADR）

> 状态：已接受（2026-08-05）
> Owner：Architecture / Coordinator
> 任务来源：实施计划 `.planning/2026-08-05-finance-amount-explanation-platform/`（`task_plan.md`、`findings.md`；`.planning/` 按规划治理不入库）

本文记录 Finance 金额来源解释平台（amount explanation platform）实施前的基线与架构决策。实施按计划的 Package 1–8 分包执行，每包独立提交、不推送。

## 基线

- 权威实现树：`workspace-dev:/home/ubuntu/workspace-dev/worktrees/main`
- Base SHA：`f461d82ec276e81ecf133b5fccfcb02c565d5272`（`fix(finance): tighten consolidation policy types`）
- 基线工作树状态：干净（2026-08-05 盘点时 `git status --short` 无输出）
- git 策略（用户 2026-08-05 拍板）：逐包提交、绝不推送；CNB 仍是唯一 source/release 权威

## 决策 1：架构分层与 Platform 边界

- 组合求解以纯 Platform 端口交付：`packages/platform/server/combination-solver/`（contract 类型、bounded reference adapter、factory）。端口只接受签名 minor-unit 整数、不透明候选 key 和确定性预算，不含公司/科目/凭证/报表语义；Finance 经 factory 注入，单测可换 fake、未来可换 dpss/WASM 适配器而不改 Finance 代码。
- 新增 Platform workbook 公式兄弟适配器：`packages/platform/formula/workbook-types.ts` 与 `workbook-hyperformula-adapter.ts`，复用既有 HyperFormula，输出重算值、前驱/后继、有界传递图与 trust 状态（`cached_only` / `recalculated_match` / `recalculated_mismatch` / `unsupported` / `error`）。
- 既有 `FormulaEngineAdapter`（字段表达式求值器）保持不变，禁止扩展为 workbook 语义。
- Finance 只拥有有界候选获取、证据归一化、编排与语义排序；金额全程使用签名 minor-unit（`bigint`），公共 API 金额为十进制字符串，换算只在 Finance 边界发生一次。
- 结果恒为 `accountingTreatment: "not_evaluated"`；平台不生成调整、过账、抵销或重分类。

## 决策 2：证据-only 上传边界

- 现行「禁止法定终版三表 Excel 上传/提交/导入/覆盖」边界保留，仅新增一个例外：对比证据导入（comparison evidence import）。上传的 workbook 仅作为不可变对比证据保存；禁止覆盖或替代系统报表、禁止过账、禁止生成调整、禁止替代会计来源。
- `app/(modules)/finance/ARCHITECTURE.md` 的边界表述按此例外做最小化修订，其余禁令原文保留。
- 上传安全包线（20 MiB 原始字节、OOXML ZIP magic 校验、entry/声明解压大小/sheet/cell/formula 上限、拒绝宏/加密/外部链接、隔离 worker 解析并证明 Next standalone 打包）按计划 §5.2 执行；隔离解析无法证明时，任意上传保持关闭而不是回退到请求线程解析。

## 决策 3：页面 IA — 共享顶层「差异诊断」tab

- `/finance/statements` 顶层 tabs 由「合并报表 / 单体报表」扩展为「合并报表 / 单体报表 / 差异诊断」。这是同页 `PageSurface.tabbar` 客户端状态：不是新路由、不是新 L2、不是第六个合并阶段。
- 单体与合并报表视图通过类型化 `StatementTargetRef` 启动同一个 tab，不复制两套实现。
- 对比绑定不可变系统目标：单体 = 公司/年月/periodKind/报表类型 + 输入指纹；合并 = batch/output snapshot + 输出指纹。重跑生成新的不可变 run，不回改旧 run。

## 决策 4：功能开关（fail-closed）

- 采用仓库既定的服务端运行时配置机制：`SystemConfig` 配置键。既有先例：`finance.ledger.defaultCompanyCode`（Finance 默认公司配置）与 `moduleRuntimeOverrides`（模块级运行时开关，`packages/platform/server/module-runtime-overrides.ts`，服务端启动预载、API shell 统一拦截）。
- 开关名：`finance.statements.comparison.enabled`（`SystemConfig` 键，布尔，缺省 false = fail-closed）。
- 评估点：Finance server 侧 statement comparison / amount explanation 服务与 route shell；开关关闭时上传、mapping、run、query 一律拒绝，错误形态复用 `moduleDisabledResponse` 先例。
- 明确不采用浏览器端 flag，也不新增 `.env` 业务开关（仓库无 `.env` 驱动业务能力开关的先例）。
- 与既有模块开关的分工：`moduleRuntimeOverrides` 管辖 `finance.statements` 整资源的启用/隐藏；本开关只管辖该资源内的新能力，二者互不替代。
- Rollout 顺序：SheetJS 升级与适配器、schema、API 均在开关关闭状态下发布；先在 dev 对授权 Finance 用户开启并跑通私有验收夹具；生产启用是单独授权的发布动作。

## 决策 5：许可与依赖处置

- HyperFormula 3.3.0（GPLv3）：仓库现状即批准依据——root `package.json` pin `hyperformula@3.3.0`，`packages/platform/formula/hyperformula-adapter.ts` 已按 `licenseKey: "gpl-v3"` 既定使用；用户 2026-08-05 确认该现状即批准的许可依据。workbook 公式重算适配器可在此基础上交付，但必须保持可替换（端口/factory 注入），且整体新能力默认由决策 4 的开关关闭。
- SheetJS CE 0.20.3 vendoring 已批准（Package 1 执行）：官方 tarball 落地 `vendor/sheetjs/xlsx-0.20.3.tgz`，`vendor/sheetjs/PROVENANCE.md` 记录 upstream URL、获取日期、SHA-256、包版本与许可依据；`package.json` 改指 `file:vendor/sheetjs/xlsx-0.20.3.tgz`，并附仓库检查执行的 checksum 校验；不使用 GitHub snapshot 同步流，CNB 保持唯一 source/release 权威。
- 升级动机：现有 `xlsx@^0.18.5` 受 prototype pollution（修复于 0.19.3）与 ReDoS（修复于 0.20.2）影响；升级到经验证的官方 0.20.3 tarball 是接受任意 workbook 上传的前置条件。`xlsx` 使用面横跨 Finance、Administration、Capital Securities、Inventory、HR、Library 与脚本，升级属于全仓兼容工作。

## 决策 6：legacy 表处置

dev 库只读盘点（2026-08-05；`workspace-dev-db` 容器、`workspace_dev` 库；`BEGIN READ ONLY` 事务内 `SELECT count(*)`）：

| 表 | 行数 |
|---|---|
| `FinanceStatementSourcePackage` | 5 |
| `FinanceStatementSourceSheet` | 15 |
| `FinanceStatementSourceLine` | 629 |
| `FinanceStatementWorkpaper` | 42 |
| `FinanceStatementWorkpaperLine` | 1399 |

- 五张表全部非空 → 保留为 legacy 证据：不静默复用、不重解释、不删除；任何移除须先有一份单独批准的转换/归档计划。
- 新对比持久化模型按计划 §6 以独立 Prisma model 文件新增，与 legacy 模型并存；对比 run 行是不可变审计快照，不是规范会计事实。
- 其他受管环境（含生产）的 preflight 在 Package 4 执行；各环境结论可能不同，不得以 dev 结果代替。

## 明确不做的事

- 不推断或批准会计处理；不生成凭证、抵销、重分类、调整或配平常数。
- 不把上传 workbook 当作法定/系统报表来源。
- 不用 HyperFormula 重算结果覆盖 workbook 缓存值（mismatch 是证据，不是自动更正）。
- 不让 LLM 充当算术证明、候选生成器或证据权威。
- 不支持 `.xls`、`.xlsm`、加密工作簿、宏、OLE/DDE、外部链接或网络公式（v1）。

## 实施状态（2026-08-06，Package 8 收口）

- Package 0–8 全部完成；证据包见 `docs/engineering/finance-amount-explanation-platform-release-handoff.md`（包台账 SHA、迁移/开关状态、私有验收指纹、检查结果、已知限制）。
- dev 已应用两个对比迁移并开启 `finance.statements.comparison.enabled`（rollout 第 3 步）；生产迁移/开启属单独授权发布。

### 相对本 ADR/计划的偏差清单（以交接记录与各包交接为准）

- `POST /comparisons/:id/runs` 的 `:id` 为 mappingId（非 packageId）：run 由已确认映射创建，rerun 新建不可变记录。
- 新增只读 `GET /comparisons/target-preview`：把目标选择解析为类型化 `StatementTargetRef` + 可见系统指纹（Package 7 seam，Package 6 交接中已说明）。
- 证据包 lifecycle 枚举实现为小写 camelCase：`parsed | mappingRequired | ready | failed | archived`（计划文档中的大写写法仅为语义约定）。
- solver `stopReason` 的 `candidate_limit` 同时覆盖候选硬顶（60）与项数硬顶（>6 钳制）两类 fail-closed 截断。
- Package 8 集成修正两条（均附测试）：voucher provider 取数顺序改为带符号精确命中优先（避免截断窗口挤出 direct 命中）；映射确认 schema `headerRow` 放宽为 `min(0)`（detection 为 0-based 行索引）。
- SystemConfig 无任意键的既定管理 API；dev 开关经应用自身 Prisma 运行时（runtime 角色）写入，已记录在交接记录 §3。
- comparison UI 未新增浏览器 E2E：成本/收益结论与组件测试替代覆盖见交接记录 §7。
