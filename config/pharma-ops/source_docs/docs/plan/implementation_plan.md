# Pharma Ops 电子记录 — 当前执行计划

> 更新时间：2026-06-12。历史 Phase 施工细节已收敛；本文只保留下一步会指导 agent 执行的计划。

## 1. 当前基线

| 维度 | 当前状态 | 证据 |
|------|----------|------|
| MD 清洗 | 16/16 `catalog_ok=true`、`template_ok=true` | `docs/coverage/audit/md_quality_issues.yaml` |
| 产品覆盖 | 16 个产品，`gaps: []` | `docs/coverage/audit/gaps.yaml` |
| 正式模板 | 16 个 `record_templates/*.yaml`，224 个检测项 | `docs/coverage/audit/template_generation_report.md` |
| YAML review | `needs_review: 0` | `docs/coverage/audit/template_generation_report.md` |
| DOCX 对齐 | 异常项 0 | `docs/coverage/audit/audit_report.md` |
| 组件实现 | 334/334 已实现，0 stub | `docs/coverage/component_checklist.md` |
| 模板契约 | 0 blocker / field_key duplicate 0 / MD mapping gaps 0 / formula/rule warnings 0 | `docs/coverage/audit/template_contract_report.md` |
| Layout 模板契约 | 正式模板 0 个 / 0 blockers / 0 warnings，include resolver 已可用 | `docs/coverage/audit/layout_template_contract_report.md` |
| 业务准入 | 16 ready / 0 manual check / 0 needs fix / 0 blockers / 0 warnings | `docs/coverage/audit/business_readiness_report.md` |
| 运行时准入 | 16 产品 / 293 routes / 224 tests / 5307 fields / 224 layouts / 16 save-load checks / 0 blockers | `docs/coverage/audit/runtime_acceptance_report.md` |
| Layout 模板化候选 | 旧 224 product layout JSON → 29 个候选组 | `docs/coverage/manual/layout_template_consolidation.md` |
| Layout 候选蓝图 | 29 个外置候选草稿 / 0 个正式模板写入 | `docs/coverage/manual/layout_template_blueprints.md` |
| Layout 蓝图边界审计 | 29 external drafts / 0 formal templates written / 0 blockers | `docs/coverage/audit/layout_template_blueprint_audit_report.md` |
| 源码架构 | 运行逻辑在 `src/pharma_ops/`，脚本为薄 wrapper | `docs/architecture.md` |

## 2. 资产边界

| 类型 | 路径 | 规则 |
|------|------|------|
| 源码 | `/Users/koito/Project/pharma-ops` | 可提交 |
| 运行数据 | `/Users/koito/Desktop/workspace/.pharma-ops/data/` | 不提交 |
| 临时反馈 | `/Users/koito/Desktop/workspace/.pharma-ops/feedback/` | 不提交 |
| 自动草稿 | `/Users/koito/Desktop/workspace/.pharma-ops/drafts/` | 不提交，人工确认后再进 `config/` |
| 历史归档 | `/Users/koito/Desktop/workspace/.pharma-ops/archive/` | 不提交 |

## 3. 下一阶段目标：模板化迁移底座

当前不再需要重跑旧 Phase -1/0/4 作为主线任务。`scripts/audit_business_readiness.py` 已证明：16 个产品结构覆盖通过，business blocker 和自动 warning 均已清零。标准品缺失已由 `scripts/sync_missing_standards.py` 从 canonical MD 同步 80 处。

新方向已经进入“需要人工看图确认版式”的阶段。旧 `config/table_layouts/products/**/*.json` 不再作为长期维护目标；不要继续做逐个旧 JSON 的 review UI，不要手改 226 个 product JSON。当前 Agent 只做不依赖审美判断的底层工作：

1. YAML 字段、公式、规则、field_key 唯一性审计。
2. MD canonical 与 `config/products.yaml` / `config/record_templates/*.yaml` 的一致性检查。
3. 工具边界审计，确保旧 review queue、旧 product JSON 逐项维护入口和旧 schema/rules 输入没有回流。
4. 为模板合并输出候选归类报告。
5. 为候选组生成外置蓝图草稿，放到 `workspace/drafts/table_layout_templates/`，不写正式模板目录。
6. 在 `config/table_layouts/templates/{common,operation,weighing,measurement,calculation,microbiology,parents}/` 生成经人工确认的模板；运行时已支持父模板 include 展开，正式模板写入前需通过 `scripts/audit_layout_templates.py`。

给并行 Agent 的即时口径：

> 我们这边模板化方向已经进入“需要人工看图确认版式”的阶段，旧 `products/**.json` 不再作为长期维护目标；你先别继续做逐个旧 JSON 的 review UI，改去做不依赖我审美判断的底层工作：YAML 字段/公式/field_key 唯一性审计、MD canonical 与产品映射一致性检查、以及为模板合并输出候选归类报告即可，不要再手改 226 个 product JSON。

后续进入人工看图确认后，每个正式模板仍需覆盖：

1. 从批次列表或产品入口进入正确产品，不跳回别嘌醇。
2. 三个阶段页面均可访问。
3. 检测项编号、名称、顺序与 `schema/md_canonical/<品种>.md` 一致。
4. 操作方法、标准规定、清场、异常处理、附件/图谱提示与 MD 一致。
5. 可填写字段能输入，只读计算字段不可编辑。
6. 日期字段保存后刷新不被“今天”覆盖。
7. 批号、检验者/日期、复核者/日期等共享字段能复用。
8. 输入样例后，自动计算和自动结论按业务预期更新。
9. 保存后刷新或切换页面，已填数据仍在，计算项可回填或重算。
10. 由父模板 include 渲染出的日期、空线、勾选项可填写、可保存、刷新后可回填。

## 4. 推荐执行顺序

| 批次 | 产品 | 理由 |
|------|------|------|
| 回归确认 | 别嘌醇片 `allopurinol` | 0 blocker / 0 warning，保留为回归样板 |
| 前端/业务验收 | 复方芦丁片 `compound_rutin` | 0 blocker / 0 warning，重点验证芦丁 UV、维 C 滴定和人工录入含量口径 |
| 前端/业务验收 | 鞣酸小檗碱片 `berberine_tannate` | 0 blocker / 0 warning，重点验证 UV 对照法 10.69 系数和微生物清场 |
| 前端/业务验收 | 甲巯咪唑片 `methimazole` | 0 blocker / 0 warning，重点验证滴定、含量均匀度和成品鉴别清场 |
| 前端/业务验收 | 硝酸异山梨酯片 `isosorbide_dinitrate` | 0 blocker / 0 warning，重点验证 HPLC、溶出度、含量均匀度和微生物退出段 |
| 前端/业务验收 | 甘草酸二铵胶囊 `diammonium_glycyrrhizinate` | 0 blocker / 0 warning，重点验证 252/261nm、1.898 公式和保存回填 |
| 前端/业务验收 | 克拉霉素胶囊 `clarithromycin` | 0 blocker / 0 warning，重点验证 HPLC 溶出峰面积法、18 倍稀释系数和 85.0% 阈值 |
| 前端/业务验收 | 阿替洛尔片 `atenolol` | 0 blocker / 0 warning，重点验证 224nm UV 溶出、有关物质总杂和 HPLC 含量 |
| 前端/业务验收 | 阿奇霉素胶囊 `azithromycin` | 0 blocker / 0 warning，重点验证 HPLC 溶出峰面积法、阿奇霉素有关物质限度和 80.0% 阈值 |
| 前端/业务验收 | 盐酸维拉帕米片 `verapamil` | 0 blocker / 0 warning，重点验证双波长溶出△A、有关物质总杂和 HPLC 含量 |
| 前端/业务验收 | 盐酸左氧氟沙星胶囊 `levofloxacin` | 0 blocker / 0 warning，重点验证 294nm UV 溶出、238/294nm 有关物质和 HPLC 引用关系 |
| 前端/业务验收 | 螺内酯片 `spironolactone` | 0 blocker / 0 warning，重点验证 83.0% 溶出阈值、254/283nm 有关物质和 A＋2.2S |
| 前端/业务验收 | 辛伐他汀片 `simvastatin` | 0 blocker / 0 warning，重点验证 HPLC 溶出公式、有关物质单杂/总杂和 A＋2.2S |
| 前端/业务验收 | 盐酸特拉唑嗪胶囊 `terazosin` | 0 blocker / 0 warning，重点验证 500ml/100rpm/30min UV 溶出、0.914 换算、有关物质 0.5% 折算和 A＋2.2S |
| 前端/业务验收 | 泮托拉唑钠肠溶片 `pantoprazole` | 0 blocker / 0 warning，重点验证酸中释放度、释放度、耐酸力、0.9458 换算和 8.0%/78.0%/92.0% 阈值 |
| 前端/业务验收 | 氢氯噻嗪片 `hydrochlorothiazide` | 0 blocker / 0 warning，重点验证 HPLC、溶出度、有关物质和含量均匀度表格 |
| 已完成 | 标准品补齐 | 从 MD 同步 80 处标准品，业务 blocker 147 -> 67 |
| 当前基线 | Business readiness | 16 产品当前 0 blocker / 0 warning；后续修改必须保持该基线 |

顺序可按用户业务优先级调整，但每次只推进少量产品，避免把业务问题淹没在批量改动里。

## 5. 单产品交付模板

每个产品完成后，Agent 必须提供：

```text
产品：
访问 URL：
测试批号：
本次改动文件：
已验证检测项：
未确认/需业务抽查：
验证命令与结果：
建议用户抽查：
对应 MD 位置：
建议输入样例：
预期计算/结论：
```

验收记录写入：

```text
docs/coverage/manual/<product_key>_acceptance.md
```

全量前端/业务双验收入口仍由以下脚本生成：

```text
scripts/generate_manual_acceptance_pack.py
docs/coverage/manual/p6_frontend_acceptance_pack.md
docs/coverage/manual/p6_frontend_acceptance_pack.yaml
```

模板合并候选归类由以下脚本生成：

```text
scripts/generate_layout_template_consolidation.py
docs/coverage/manual/layout_template_consolidation.md
docs/coverage/manual/layout_template_consolidation.yaml
```

旧 `scripts/generate_layout_review_queue.py` 和 `layout_review_queue.*` 兼容别名已删除；主线语义只保留模板合并候选，不再提供逐旧 JSON 复核打标表入口。

外置模板候选蓝图由以下脚本生成：

```text
scripts/generate_layout_template_blueprints.py
docs/coverage/manual/layout_template_blueprints.md
docs/coverage/manual/layout_template_blueprints.yaml
~/Desktop/workspace/.pharma-ops/drafts/table_layout_templates/
```

该脚本只生成候选蓝图，不写 `config/table_layouts/templates/`，也不修改旧 `products/**/*.json`。
边界审计由 `scripts/audit_layout_template_blueprints.py` 生成，确认草稿仍在外置目录、manifest 可复现、正式模板写入为 0。

人工看图确认矩阵由以下脚本生成：

```text
scripts/generate_layout_template_review_matrix.py
docs/coverage/manual/layout_template_review_matrix.md
docs/coverage/manual/layout_template_review_matrix.yaml
```

该矩阵把 29 个候选组聚合为 19 个父模板候选，列出抽样记录入口、优先级、人工确认点和 Agent 可做/不可做动作。
矩阵覆盖审计由 `scripts/audit_layout_template_review_matrix.py` 生成，确认 29 个候选组、父模板候选和代表样本入口没有遗漏。

## 6. 修改规则

- 修改 `config/record_templates/*.yaml` 前，先对照对应 `schema/md_canonical/*.md`。
- 修复前后必须重跑 `scripts/audit_business_readiness.py`，证明 0 blocker 基线不回退。
- 修改字段、公式或方法 YAML 后必须重跑 `scripts/audit_template_contracts.py`，证明 field_key 和 MD mapping 不回退。
- 自动生成草稿先写外置 `workspace/drafts/record_templates/`，不得直接混入正式 `config/`。
- 会修改 canonical MD 或正式 YAML 的修复脚本必须默认 dry-run、外置 drafts，或要求显式 `--apply` / `--overwrite`。
- 不能凭推断补业务内容；无法确认的内容写入验收记录或 `needs_review`，等待用户确认。
- 不手改 `config/table_layouts/products/**/*.json`；旧 product JSON 只作为归类/取样参考。
- 不再以批量重写旧 product JSON 作为主线；layout 迁移优先走 consolidation/blueprints，人工确认后再写正式 `templates/**`。
- 通用组件修改必须评估跨产品影响，并至少回归别嘌醇和当前目标产品。
- 不新增品种专属 HTML 表格；表格差异应通过 YAML 配置或 JS 组件参数表达。

## 7. 提交前验证

```bash
git status --short
python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py
python3 scripts/audit_md_quality.py
python3 scripts/audit_coverage.py
python3 scripts/audit_template_coverage.py
python3 scripts/audit_template_contracts.py
python3 scripts/audit_tooling_boundaries.py
python3 scripts/audit_layout_templates.py
python3 scripts/audit_component_mapping.py
python3 scripts/audit_business_readiness.py
python3 scripts/audit_runtime_acceptance.py
python3 scripts/generate_manual_acceptance_pack.py
python3 scripts/generate_layout_template_consolidation.py
python3 scripts/generate_layout_template_blueprints.py
python3 scripts/generate_layout_template_review_matrix.py
python3 scripts/audit_layout_template_review_matrix.py
python3 scripts/audit_layout_template_blueprints.py
(cd test && npm test)
```

涉及页面时，还要用 Flask test client 或浏览器验证核心入口：

```text
/
/batches
/record/<product_key>/<stage>
/api/record-structure/<product_key>
/coverage
/formulas
```

## 8. 完成定义

项目不是在“16 个 YAML 存在”时完成，而是在以下条件同时成立时完成：

- 16 个产品都有用户可抽查的验收记录。
- 16 个产品在 `business_readiness_report.md` 中均为 0 blocker。
- 224 个运行时 layout 均已由用户完成前端复核，或有明确挂起记录。
- 每个产品至少覆盖 3 个阶段的代表检测项。
- 所有发现的业务差异都有修复、确认或明确挂起记录。
- 自动审计保持：MD 质量通过、`gaps: []`、模板 `needs_review: 0`、组件 0 stub。
- 工作树 clean，运行数据、反馈、草稿、归档均不进入 Git。
