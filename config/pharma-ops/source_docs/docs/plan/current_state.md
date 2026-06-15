# Pharma Ops 电子记录 — 当前状态

> 更新时间：2026-06-12。本文只记录当前事实，不保留旧 Phase 待办。

## 1. 项目边界

- 源码目录：`/Users/koito/Project/pharma-ops`
- 本地运行数据和外置产物：`/Users/koito/Desktop/workspace/.pharma-ops`
- 运行时主线：`config/` + `src/pharma_ops/` + `templates/` + `static/js/` + 外置 SQLite 数据。
- 旧 JSON 四步管线、旧 rules、旧脚本已归档；当前主线不再读取 `schema/s1_raw`、`schema/s2_agent`、`schema/s3_tbc`、`schema/s4_confirmed`、`config/rules`。

## 2. 数据与模板基线

- `schema/md_canonical/`：16 个产品 MD 真源稿。
- `scripts/audit_md_quality.py`：16/16 `catalog_ok=true` 且 `template_ok=true`。
- `config/record_templates/`：16 个正式产品模板，合计 224 个检测项。
- `docs/coverage/audit/gaps.yaml`：当前 `gaps: []`。
- `docs/coverage/audit/template_generation_report.md`：`needs_review: 0`，`rule判定: 224`。
- `docs/coverage/audit/template_contract_report.md`：YAML 字段/公式/field_key/MD 映射契约审计；当前 0 blocker，field_key 重复问题 0，MD mapping gaps 0，公式/规则 warning 0。
- `docs/coverage/audit/tooling_boundary_report.md`：当前工具边界审计；检查旧 review queue/旧 product JSON 逐项维护入口没有回流，旧 product JSON 生成仍需显式 opt-in。
- `docs/coverage/audit/audit_report.md`：DOCX × YAML × component mapping 异常项为 0。
- `docs/coverage/audit/business_readiness_report.md`：更严格的业务验收准入审计当前为 16 ready、0 manual check、0 needs fix、0 blockers、0 warnings。
- `docs/coverage/audit/runtime_acceptance_report.md`：运行时页面/结构契约审计当前为 16 产品、293 routes、224 tests、5307 fields、224 layouts、16 save/load checks、0 blockers、0 warnings。
- `docs/coverage/audit/layout_template_contract_report.md`：`templates/**` 子模板/父模板 include 契约审计；当前正式模板 0 个、0 blockers、0 warnings。
- `docs/coverage/audit/layout_template_blueprint_audit_report.md`：外置候选蓝图边界审计；当前 29 groups、29 external drafts、0 formal templates written、0 blockers、0 warnings。
- `docs/coverage/audit/layout_template_review_matrix_audit_report.md`：人工确认矩阵覆盖审计；当前 19 parent candidates、29 groups、93 samples、0 blockers、0 warnings。
- `docs/coverage/manual/p6_frontend_acceptance_pack.md`：16 产品验收入口已生成；旧 product layout JSON 仅用于样本抽查，不作为长期逐条维护目标。
- `docs/coverage/manual/layout_template_consolidation.md`：旧 224 个 product layout JSON 的模板合并候选归类报告；当前汇总为 29 个候选组、10 个 template seed、13 个 merge candidate、3 个 manual judgment、3 个 parent template design。
- `docs/coverage/manual/layout_template_blueprints.md`：29 个模板迁移候选蓝图，29 个外置草稿，0 个正式模板写入；草稿位于外置 `workspace/drafts/table_layout_templates/`，等待人工看图确认后再转正。
- `docs/coverage/manual/layout_template_review_matrix.md`：把 29 个候选组聚合为 19 个父模板候选，列出人工看图确认优先级、样本记录入口和下一步动作。
- `config/table_layouts/templates/`：新模板体系落点，按 `common/operation/weighing/measurement/calculation/microbiology/parents/` 组织；当前已有后端 include 展开能力与模板契约审计，尚未生成正式模板。
- 页面 table-layout 保存已改为外置草稿，默认写入 `workspace/drafts/table_layout_editor/`；不会从浏览器 POST 直接写 `config/table_layouts/` 正式布局。
- `scripts/sync_missing_standards.py`：已从 `schema/md_canonical/` 同步 80 处缺失标准品到正式 record templates，详见历史写入报告 `docs/coverage/audit/standard_sync_report.md`；当前默认 dry-run 写入 `docs/coverage/audit/standard_sync_dry_run_report.md`。
- 自动生成但未人工确认的模板草稿不进入 `config/record_templates/`，默认写入外置 `workspace/drafts/record_templates/`。

## 3. 前端与运行时基线

- 后端入口已收敛为 `src/pharma_ops/web/app.py:create_app()`，根目录 `app.py` 仅作兼容启动入口。
- 记录结构引擎在 `src/pharma_ops/records/engine/`，运行时 API 输出 `product_key/product_name/stages` 结构。
- 前端核心在 `static/js/core/`，表格组件在 `static/js/components/`。
- `docs/coverage/component_checklist.md`：334 个组件实例全部已实现，0 stub，0 missing。
- `/coverage` 默认只读；刷新审计报告必须显式 POST 或 CLI。
- 页面 smoke 当前通过：`/`、`/batches`、`/record/allopurinol/finished`、`/coverage`、`/formulas`、`/methods/editor/test`。
- 全产品运行时 smoke 当前通过：`scripts/audit_runtime_acceptance.py` 覆盖 16 产品主页、三阶段页、224 个检测项页和结构 API。

## 4. 已清理的历史误导项

- `allopurinol_auto.yaml` 已从正式配置删除。
- 旧 `product_engine.py` 已归档，主线不再 import。
- `config/rules/` 已删除；归档副本在外置 `workspace/archive/config_rules_legacy/20260612/`。
- 旧 product layout 批量生成/逐项打标入口、`layout_review_queue.*` 兼容别名均已删除；旧 `config/table_layouts/products/**/*.json` 仅保留为运行时兼容和模板合并取样。
- 重复的 `config/products.json` 已删除；`/api/products` 现在从 `config/products.yaml` 派生。
- 产品反馈 POST 写入外置 `workspace/feedback/products/`，不污染源码。
- 会修改 canonical MD 或正式 YAML 的修复脚本已收紧为默认 dry-run、外置 drafts 或显式 `--apply` / `--overwrite`；脚本分组见 `scripts/README.md`。

## 5. 当前真正未完成项

目前不再是“缺 15 个模板”或“组件 stub 阻塞”。标准品缺失的大头已通过脚本同步闭环，业务 blocker 和自动 warning 均已清零。新方向是：旧 `products/**/*.json` 不再作为长期维护目标，先用底层审计和模板合并候选归类报告支撑后续“人工看图确认版式”的模板迁移。不要再做逐个旧 JSON review UI，也不要手改 226 个 product JSON。

1. 每次修改先跑 `scripts/audit_business_readiness.py`，确认 0 blocker 基线不回退。
2. 跑 `scripts/audit_template_contracts.py`，先看 field_key 重复、MD mapping gaps、公式/规则 warning。
3. 跑 `scripts/audit_tooling_boundaries.py`，确认旧 review queue/逐项维护入口没有回流。
4. 跑 `scripts/audit_layout_templates.py`，确保已确认模板的 include 引用能展开且没有循环/缺失。
5. 跑 `scripts/generate_layout_template_consolidation.py`，用 29 个候选组指导 common/operation/weighing/measurement/calculation/microbiology/parents 模板拆分。
6. 跑 `scripts/generate_layout_template_blueprints.py`，刷新外置候选蓝图草稿；确认它仍为 0 个正式模板写入。
7. 跑 `scripts/generate_layout_template_review_matrix.py`，刷新 19 个父模板候选和人工抽样入口。
8. 跑 `scripts/audit_layout_template_review_matrix.py`，确认 29 个候选组、父模板候选和样本入口都被矩阵覆盖。
9. 跑 `scripts/audit_layout_template_blueprints.py`，确认蓝图草稿留在外置目录、manifest 可复现、正式模板写入仍为 0。
10. 不手改旧 product JSON；旧 JSON 只读取、归类、取样。
11. 真正版式迁移进入人工看图确认后，再把确认过的蓝图转成正式父模板 include。

已发现并处理的产品级问题：

- 复方芦丁片 `compound_rutin`：含量项是“芦丁 UV + 维生素 C 滴定”复合方法，已新增 `复方芦丁含量` 方法并清理含量/水分操作方法数据区残留；当前 business readiness 为 0 blocker / 0 warning，进入前端/业务验收候选。

产品级验收候选：

- `business_readiness_report.md` 当前 16 产品全部 0 blocker / 0 warning；后续以 16 个产品为前端/业务验收队列。
- 别嘌醇片 `allopurinol`：作为基线样板，溶出度和成品含量操作方法中的数据区 warning 已清零，当前 0 blocker / 0 warning；记录见 `docs/coverage/manual/allopurinol_acceptance.md`。
- 鞣酸小檗碱片 `berberine_tannate`：成品脆碎度、UV 对照法操作方法和微生物清场 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；UV 对照法 10.69 系数仍需业务确认，记录见 `docs/coverage/manual/berberine_tannate_acceptance.md`。
- 甲巯咪唑片 `methimazole`：滴定、含量均匀度数据表和成品鉴别清场 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/methimazole_acceptance.md`。
- 甘草酸二铵胶囊 `diammonium_glycyrrhizinate`：UV 含量/溶出度 blocker 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/diammonium_glycyrrhizinate_acceptance.md`。
- 克拉霉素胶囊 `clarithromycin`：HPLC 含量、HPLC 溶出度、有关物质数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/clarithromycin_acceptance.md`。
- 阿替洛尔片 `atenolol`：HPLC 含量、224nm UV 溶出度、成品有关物质和脆碎度标准规定 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/atenolol_acceptance.md`。
- 阿奇霉素胶囊 `azithromycin`：HPLC 含量、HPLC 溶出度、阿奇霉素有关物质数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/azithromycin_acceptance.md`。
- 盐酸维拉帕米片 `verapamil`：HPLC 含量、双波长 UV 溶出度、成品有关物质数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/verapamil_acceptance.md`。
- 盐酸左氧氟沙星胶囊 `levofloxacin`：HPLC 含量、294nm UV 溶出度、238/294nm 有关物质数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/levofloxacin_acceptance.md`。
- 螺内酯片 `spironolactone`：HPLC 含量、83.0% UV 溶出度、双波长有关物质和含量均匀度数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/spironolactone_acceptance.md`。
- 辛伐他汀片 `simvastatin`：HPLC 含量、HPLC 溶出度、梯度 HPLC 有关物质、鉴别和含量均匀度数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/simvastatin_acceptance.md`。
- 盐酸特拉唑嗪胶囊 `terazosin`：HPLC 含量、500ml/100rpm/30min UV 溶出度、特拉唑嗪有关物质、鉴别和含量均匀度数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/terazosin_acceptance.md`。
- 泮托拉唑钠肠溶片 `pantoprazole`：酸中释放度、释放度、耐酸力和鉴别清场 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/pantoprazole_acceptance.md`。
- 氢氯噻嗪片 `hydrochlorothiazide`：中间体/待包装品/成品 HPLC、溶出度、有关物质和含量均匀度数据表 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/hydrochlorothiazide_acceptance.md`。
- 硝酸异山梨酯片 `isosorbide_dinitrate`：中间体/待包装品/成品 HPLC、溶出度、含量均匀度和微生物清场 blocker/warning 已清零，当前 0 blocker / 0 warning，进入前端/业务验收候选；记录见 `docs/coverage/manual/isosorbide_dinitrate_acceptance.md`。

## 6. 当前验证命令

```bash
python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py
python3 scripts/audit_md_quality.py
python3 scripts/audit_coverage.py
python3 scripts/audit_template_coverage.py
python3 scripts/audit_template_contracts.py
python3 scripts/audit_tooling_boundaries.py
python3 scripts/audit_layout_templates.py
python3 scripts/generate_layout_template_consolidation.py
python3 scripts/generate_layout_template_blueprints.py
python3 scripts/generate_layout_template_review_matrix.py
python3 scripts/audit_layout_template_review_matrix.py
python3 scripts/audit_layout_template_blueprints.py
python3 scripts/audit_component_mapping.py
python3 scripts/audit_business_readiness.py
python3 scripts/audit_runtime_acceptance.py
(cd test && npm test)
```
