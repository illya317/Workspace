# Finance 金额来源解释平台 — 发布交接记录（Package 8 证据包）

> 日期：2026-08-06
> Owner：Coordinator（实施后由独立 Review 角色复核）
> 关联：ADR `docs/engineering/finance-amount-explanation-platform-adr.md`；实施计划 `.planning/2026-08-05-finance-amount-explanation-platform/`（不入库）
> 隐私边界：本文件只记录金额、符号、residual、状态与指纹级结果。租户公司名、凭证号、凭证描述、sheet 明细内容等私有事实不进仓库；私有验收清单（真实公司/凭证标识 ↔ 指纹映射）保存在仓库外的任务工作区。

## 1. 源码基线与包台账

- 权威实现树：`workspace-dev:/home/ubuntu/workspace-dev/worktrees/main`
- 计划 Base SHA：`f461d82ec276e81ecf133b5fccfcb02c565d5272`
- Package 8 验收时 HEAD：`446d1e7f4dcf597d01aeacb83938fbf447026344`（含另一会话的 comparison UI 权限对齐提交）
- 全部改动合计（base..HEAD）：211 files changed, 34,386 insertions(+), 5,509 deletions(-)

| 包 | 提交 | 标题 | 改动统计 |
|---|---|---|---|
| P0 | `3981d47a` | docs(finance): record amount explanation platform baseline and ADR | 3 files, +75/-1 |
| P1 | `c81cbc85` | chore(deps): vendor SheetJS CE 0.20.3 tarball to replace vulnerable xlsx line | 22 files, +221/-92 |
| P2 | `9768d07e` | feat(platform): add replaceable combination solver and workbook formula adapters | 12 files, +1,406/-1 |
| P3 | `b7f6c0d7` | feat(finance): add read-only amount origin explanation engine | 26 files, +3,123 |
| P4 | `8936da46` | feat(finance): add immutable statement comparison evidence persistence | 24 files, +18,295/-2,543 |
| P5 | `a13a0918` | feat(finance): add safe workbook ingestion and statement mapping for comparison evidence | 48 files, +5,193/-84 |
| P6 | `88e7b663` | feat(finance): add comparison evidence APIs, import permission, and run execution wiring | 29 files, +2,322/-6 |
| P7 | `1a5b2527` | feat(finance): add shared statement comparison diagnosis UI | 24 files, +3,225/-15 |

计划区间内的非本计划提交（另一会话）：`49b7f019` fix(hr)、`8c3c0575` refactor(core-ui)、`49494c0a` fix(finance) statement snapshot refresh、`446d1e7f` fix(finance) comparison mapping UI 权限对齐。

## 2. 依赖与许可证据

- SheetJS CE 0.20.3 vendored artifact：`vendor/sheetjs/xlsx-0.20.3.tgz`，SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`，上游 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`，获取日 2026-08-05，Apache-2.0（见 `vendor/sheetjs/PROVENANCE.md`；checksum 由仓库检查强制）。
- HyperFormula 3.3.0 许可依据：ADR 决策 5——root `package.json` pin `hyperformula@3.3.0`，既有 `packages/platform/formula/hyperformula-adapter.ts` 按 `licenseKey: "gpl-v3"` 使用，用户 2026-08-05 确认该现状即批准依据；workbook 适配器保持端口/factory 可替换，整体能力由开关 fail-closed。

## 3. 迁移与开关状态（dev）

- 迁移：`20260805153000_finance_statement_comparison` 与 `20260805153100_finance_statement_comparison_immutability`。
  - 一次性库验证：Package 4 已在 disposable/shadow 库验证（迁移 diff 重放见 §5 check:data）。
  - dev 应用：2026-08-06 04:51:49 UTC，经既定路径 `docker compose --project-name workspace-dev-secure --profile migration run --rm migrate`（`migrate-app.sh` → `npm run db:migrate:dev` + post-migrate grants）。应用后只读核对：`_prisma_migrations` 两行 finished_at `2026-08-06 04:51:49.165908+00` / `2026-08-06 04:51:49.178791+00`；四张表 `FinanceStatementComparisonPackage/Mapping/Run/Line` 存在。
  - 生产未迁移（需单独授权发布）。
- 功能开关：`SystemConfig` 键 `finance.statements.comparison.enabled=true`（dev only）。
  - 写入方式：现有管理 API（`PUT /api/settings/admin/system-config`）只支持三个固定键，无任意 SystemConfig 键的既定 API/脚本；本次经应用自身 Prisma 运行时（runtime 角色、应用容器内 `prisma.systemConfig.upsert`）写入，未用裸 SQL/超级用户。服务每次请求现读该键，无需重启。
  - 按 rollout 第 3 步，验收完成后 dev 保持开启。
- legacy 五表（ADR 决策 6）保持原样未触碰。

## 4. 私有验收结果（指纹级）

### Case A — 凭证直查（`POST /test/api/modules/finance/statements/amount-explanations/query`）

目标金额 `-12124.40`，公司/期间按私有验收清单（2022-12）。

- 查询 A1（无科目提示，全月窗口）：`status=ambiguous`，`method=direct`，`residualAmount=0.00`。best（rank 1）= 目标凭证行：voucher item `728035`，科目 `1511`，金额 `-12124.40`（来源符号原样），对方科目 `660303`，sourceFingerprint `79ae3c06fa5fb2088e79451280df45785077137c0c4bd1eec777cc03f9c7298d`；alternative（rank 2）= 另一张 2022-12-31 凭证的同额 `-12124.40` 行（科目 `660303`）。平局暴露为 ambiguous 是计划 §4.3 的既定语义（两条真实同额证据）。input fingerprint `75a855866423ff7db251e511f1a6f79b40d7f64d0dcb1721791e47ca8f073252`，output fingerprint `2b65830141a2b5cc027ba044032c28dddc75b40828052feecca3aa2c0931fff2`。
- 查询 A2（`accountHints=["1511"]`）：`status=exact`，`method=direct`，`stopReason=direct_hit`，`residualAmount=0.00`，alternatives=0，同一凭证行/科目/对方科目/符号。input fingerprint `ef3936fab35ac053419ba183544bf2828fb86637c42517961f57ccf0d832f5dd`，output fingerprint `29f28b97a14d25e27c71ee92bb680027cbb0311da198b6767cb973d12aa8d8bc`。
- 两次查询均 `accountingTreatment="not_evaluated"`；金额全程十进制字符串、符号精确。

### Case B — workbook 对比（`POST /test/api/modules/finance/statements/comparisons*`）

- 上传：私有 workbook SHA-256 `68d82acfd280b7f58e90890de0e27e762166ddf51b1c8ab42b2830f32b5ed127`（上传前本地 `shasum -a 256` 核对一致，176,296 bytes）→ packageId `1`，`lifecycle=mappingRequired`，入库 sha256 一致；sheet inventory = **14 张**。
- 映射歧义：11 张报表 sheet 命中数并列，`detection.best=null` → 必须人工确认（既定语义验证通过）。
- 目标：`target-preview` 解析合并目标 batchId `38` / outputSnapshotId `5` / balance → targetFingerprint `19799df989e86ff9b08183624583959dc4aa2694f7fd2e7a476ef53327c1b2e6`（72 行）。
- 映射确认（6 月合并底稿 sheet，金额列 = 调整前合计列）：mappingId `1` revision `1`，inputFingerprint `1fdb0b7ce02f79de41553a3b543fecdb331d97694bc8b802cfa2b6c667264516`。
- Run 1（revision 1，调整前合计列）：`completed`，runId `1`。汇总：totalLines 72 / differing 6 / exact 48 / ambiguous 0 / truncated 4 / notEvaluated 20 / totalAbsoluteResidual `97650967.66`。长期股权投资行：外部 `88054250.60` vs 系统 `-505060.00`，差异 `88559310.60` 在既定预算内无组合解 → `truncated` + `stopReason=no_solution`（fail-closed，未虚报 exact）。run inputFingerprint `5590158b5b5b86a4ff75191a8bdad12bed6c59305798e4617d61612b6285a4dd`。
- Remap（CAS `expectedRevision=1`，金额列改为调整后合并列）→ revision `2`，inputFingerprint `de0e9666780c93a25211acdf89daf85446dcf16a82c6ccf287236a008ac52c48`。
- Run 2（revision 2，不可变新建）：`completed`，runId `2`。汇总：totalLines 72 / differing 5 / exact 54 / ambiguous 1 / truncated 1 / notEvaluated 16 / totalAbsoluteResidual `6571434.98`。run inputFingerprint `9536907779876d00fe9a3c1003f77f3b4e365e222a9ceaca2e06c63b6cb91204`，outputFingerprint `fad8c2e39262d2954a717a314d391b039c37262648efd5602cdbaea04d935389`。
  - 长期股权投资行：外部 `0.00`（workbook 调整后合并列）vs 系统 `-505060.00`，差异 `505060.00` → `exact`/`direct`，residual `0.00`，证据 = 折算血缘（fxTrace，sourceRecordId `consolidatedOutput:5:balanceSheet:paidInCapital:198`，sourceFingerprint `79c72347e1f916207c2d165ef4a8f41c596650b1efb81218449db110c9d59575`）。
  - 未分配利润行：`0.01` 差异被 direct 精确解释但存在同额并列 → `ambiguous`（平局暴露语义）。
  - 其他综合收益行：差异 `-6571434.98` 预算内无解 → `truncated`（截断可见，未伪装 not_found）。
- 6 月长期股权投资桥（计划 §11 核心断言）：`88,054,250.60` 加调整项 `-82,000,000`、`-5,876,692.60`、`-103,929`、`-73,629` 解释至零 residual。workbook 内该桥为两个公式单元格：合计单元格 `88054250.60`（公式 = 五个公司 sheet 前驱求和）+ 调整单元格 `-88054250.60`（公式文本 `-82000000-5876692.6-103929-73629`）。两条 amount-explanations 查询均 `exact`/`direct`/residual `0.00`/`recalculated_match`（formula/cached/recalculated 三通道各自独立保留）：input fingerprints `921b2bc16127e70f5577e88198010d9e60f2b9f75ca33afbef7e7200785d30f7`、`3999005d51d73635a97b5cc01dfb8933f649a10a36c0e878f6daaf00dd302326`。
- 全部响应恒为 `accountingTreatment="not_evaluated"`；run 不可变（run 1 未被 remap 回改）。

## 5. 检查与测试（全部在权威远程 worktree 执行）

| 命令 | 结果 |
|---|---|
| `npm run check:changed` | 通过（25.92s；仅存量 route shell warning） |
| `CHECK_RESULT_CACHE=0 npm run check:arch` | 通过（157.99s，44 步；禁用结果缓存以规避 snapshot key 不覆盖未跟踪文件的已知陷阱） |
| `npm run check:data` | 通过（11.62s，在 secure migration 一次性容器内以 migrator 凭据执行，migration diff 经 shadow 库重放 87 个迁移；宿主机直接运行缺 DATABASE_URL/SHADOW_DATABASE_URL 属环境前提而非红灯） |
| `npm run docs:check` | 通过（重新生成 P6 遗漏的两份生成文档后；regen 内容后被 `446d1e7f` 纳入） |
| `npm run test:node`（全量） | 2,880 tests：2,877 pass / 2 fail / 1 skipped（480,998ms） |
| 失败 1：`consolidation-snapshots-scope.test.ts` | 归因复核成立：干净 HEAD 检出（临时 worktree + 既定 runner flags）2/2 通过；仅在另一会话未暂存 consolidation 改动存在时失败 |
| 失败 2：`scripts/ci/workflow-contract.test.mjs` | 归因复核成立：worktree 根 `apps/` 残留目录导致；干净检出 6/6 通过 |
| `npm run playwright:processes:check` | 通过（随 check:changed 执行；本包无 E2E 改动） |

Package 8 新增的针对性测试：`providers.test.ts`（voucher 取数顺序）与 `route-commands.test.ts`（headerRow 0-based）连同相关套件 26+7 全绿。

## 6. Package 8 集成修正（随本包提交）

1. `voucher-lines.ts` 取数顺序：带符号精确命中优先于确定性截断窗口。修正前窗口内较早日期的小额行会把 direct 精确命中挤出 200 行上限，Case A 全月查询曾返回 `truncated`；修正后 direct 短路正常（证据见 §4）。行为变化仅限 ORDER BY，有界性不变。
2. `route-commands.ts` `headerRow` schema：`positive()` → `min(0)`。detection 输出为 0-based 行索引，表头位于首行（索引 0）的 workbook（真实 fixture 即如此）此前无法通过映射确认 Zod 边界。
3. 各附一个针对测试。

## 7. E2E 结论

- 既有 e2e 目录无任何 statements tab 断言（全仓 grep 无命中）；担心的「两个旧 tab 断言随 UI 变更失败」场景不存在，无需修正。
- 不新增 comparison UI e2e，原因：governed Playwright 入口只接受一次性 `*_e2e` 库，而对比链路需要公司/期间/科目主数据、已发布合并批次 + 不可变 output snapshot、开关开启与 workbook 上传 worker；`seed-e2e.ts` 目前只 seed 身份与公司，构造合并 output snapshot 的成本远超本包范围。
- 替代覆盖：§11 UI 断言已由 Package 7 组件/模型测试覆盖（三 tab 命名、六列无 action 列、六段结构化 detail、无 import 权限隐藏上传、歧义映射禁建 run、stale 判定、七项汇总指标、过滤器、launch context 类型化映射）。私有真实链路验收以 §4 的 API 指纹证据承担。

## 8. 已知限制与风险（供独立 Review）

- ingest worker 的 Next standalone 打包证据为构建级：本地 `worker-packaging.test.ts` 通过，完整 standalone artifact 证据留待 CNB 构建。
- `test:node:affected` 依赖 CI 提供 `WORKSPACE_CHANGED_FILES_JSON`；本地全量（2,880）已跑。
- `check:arch` 结果缓存陷阱：snapshot key 不覆盖未跟踪文件；复核时必须 `CHECK_RESULT_CACHE=0`。
- 验收期间 dev server 因 HEAD 上与本计划无关的 HR 提交（`49b7f019`，`EmployeeProfileUtils.tsx` 漏 re-export `normalizeFieldValue`）整体 500；Package 8 在工作树临时补了一行 re-export 解锁验收，**该补丁不属于本计划、不提交**，验收后已还原（属另一会话待修事项，repo 级 check 均未覆盖该 Next 编译错误，建议 Review 关注）。
- dev server 为另一会话活跃进程，验收期间未重启、未取 lease（迁移与开关均无需重启）。
- Run 1 的 truncated 行为为既定 fail-closed 语义（预算内无解如实上报），非缺陷；其他综合收益行同理。
- 生产迁移/开启未执行，属单独授权发布（rollout 第 5 步）。

## 9. 回滚路径

- 功能开关置回 false（同 §3 写入路径），routes/UI 立即 fail-closed；已完成 run/证据行不可变保留。
- 代码回滚按包逆序 revert（单包独立提交）；迁移回滚遵循 P4 文档化流程（有行存在时不做破坏性降级）；SheetJS 回滚会同时关闭任意上传能力。
