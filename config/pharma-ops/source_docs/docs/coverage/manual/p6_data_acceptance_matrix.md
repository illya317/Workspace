# P6 Data Acceptance Matrix

> 更新时间：2026-06-12
> 范围：data/business readiness — YAML、MD、DOCX、路由、保存回填、公式/结论。

## 维度说明

| 维度 | 含义 |
|------|------|
| `template_ok` | `config/record_templates/<key>.yaml` 存在且可解析 |
| `needs_review` | YAML 中 `needs_review: true` 标记数 |
| `md_gaps` | MD 真源 vs 模板缺口数 |
| `route_ok` | 三阶段 route `/record/<key>/<stage>` 可访问 |
| `formula_status` | methods YAML 中公式/结论字段是否具备自动化基础 |
| `save_load_ok` | 创建批次 -> 填值 -> 保存 -> 回填链路是否完成过产品级验收 |
| `data_status` | `accepted` / `needs_manual_check` / `ready_for_acceptance` / `needs_business_fix` |

## 16 产品 Data Readiness 矩阵

| # | 产品 | key | template | needs_review | md_gaps | route | formula | save_load | data_status |
|---|------|-----|----------|--------------|---------|-------|---------|-----------|-------------|
| 1 | 别嘌醇片 | `allopurinol` | ✅ | 0 | 0 | ✅ | ok | ✅ | `accepted` |
| 2 | 复方芦丁片 | `compound_rutin` | ✅ | 0 | 0 | ✅ | sample_required | ✅ | `ready_for_acceptance_candidate` |
| 3 | 克拉霉素 胶囊 | `clarithromycin` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 4 | 阿替洛尔片 | `atenolol` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 5 | 阿奇霉素胶囊 | `azithromycin` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 6 | 鞣酸小檗碱片 | `berberine_tannate` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 7 | 甘草酸二铵胶囊 | `diammonium_glycyrrhizinate` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 8 | 氢氯噻嗪片 | `hydrochlorothiazide` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 9 | 硝酸异山梨酯片 | `isosorbide_dinitrate` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 10 | 盐酸左氧氟沙星胶囊 | `levofloxacin` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 11 | 甲巯咪唑片 | `methimazole` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 12 | 泮托拉唑钠肠溶片 | `pantoprazole` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 13 | 辛伐他汀片 | `simvastatin` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 14 | 螺内酯片 | `spironolactone` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 15 | 盐酸特拉唑嗪 胶囊 | `terazosin` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |
| 16 | 盐酸维拉帕米片 | `verapamil` | ✅ | 0 | 0 | ✅ | sample_required | 自动 smoke ✅ | `ready_for_acceptance_candidate` |

说明：

- `sample_required` 表示自动审计不阻塞，但 HPLC/含量均匀度等复杂公式仍需要按产品录入样例做业务验证。
- `business_readiness_report.md` 是更严格的业务准入审计；当前 16 产品为 16 ready / 0 manual check / 0 needs fix / 0 blockers / 0 warnings。
- 自动生成草稿不计入 16 产品主验收矩阵；`scripts/md_to_record_template.py` 默认把已存在正式模板的草稿写入外置 `workspace/drafts/record_templates/`。

## DOCX Detail-Section 修复队列

| 队列 | 总数 | DOCX 找到证据 | complete | partial | none / not_inferred |
|------|-----:|--------------:|---------:|--------:|--------------------:|
| YAML `needs_review`（正式 16 产品模板） | 0 | 0 | 0 | 0 | 0 |
| MD `missing_detail_section` gaps | 0 | 0 | — | — | 0 |

当前结论：

- 正式 16 产品模板的顶层 `needs_review` 与嵌套 `结论判定.needs_review` 已清零。
- `python3 scripts/audit_docx_vs_mapping.py` 当前 `异常项: 0`。
- `docs/coverage/audit/gaps.yaml` 当前 `gaps: []`。
- 可由 DOCX 结构文本定位的历史 MD gaps 已补入；当前不再存在 `missing_detail_section` 阻塞。

## Methods YAML 公式/结论关注点

| 方法 | 当前评价 | 验收策略 |
|------|----------|----------|
| 水分、重量差异、UV 含量、溶出度、脆碎度、滴定、微生物限度 | ok | 按产品抽样录入即可 |
| 复方芦丁含量 | sample_required | 复合方法已建且自动 warning 已清零；样品含量先人工录入，平均/RD/双成分结论自动判定，公式需业务确认后再自动化 |
| 阿奇霉素 HPLC/有关物质/溶出度 | sample_required | 已新增 `有关物质-阿奇霉素` 并复用 `溶出度-HPLC`；需用样例确认杂质限度、峰面积法和 80.0% 阈值，见 `docs/coverage/manual/azithromycin_acceptance.md` |
| 阿替洛尔 HPLC/有关物质/溶出度 | sample_required | 已新增 `溶出度-阿替洛尔UV` 并复用通用 `HPLC`、`有关物质`，需确认 224nm UV 溶出、总杂公式和成品引用待包装品计算过程，见 `docs/coverage/manual/atenolol_acceptance.md` |
| 盐酸维拉帕米 HPLC/双波长溶出/有关物质 | sample_required | 已新增 `溶出度-双波长UV` 和 `有关物质-维拉帕米`，需用样例确认△A标签、总杂公式和保存回填，见 `docs/coverage/manual/verapamil_acceptance.md` |
| 盐酸左氧氟沙星 HPLC/有关物质/溶出度 | sample_required | 已新增 `溶出度-左氧氟沙星UV` 和 `有关物质-左氧氟沙星`，需确认 294nm UV 溶出、238/294nm 有关物质百分比录入和成品引用待包装品计算过程，见 `docs/coverage/manual/levofloxacin_acceptance.md` |
| 螺内酯 HPLC/有关物质/溶出度/含量均匀度 | sample_required | 已新增 `溶出度-螺内酯UV` 和 `有关物质-螺内酯`；有关物质 254nm/283nm/总杂百分比当前人工录入，需确认 83.0% 溶出阈值、双波长限度和 A＋2.2S，见 `docs/coverage/manual/spironolactone_acceptance.md` |
| 辛伐他汀 HPLC/有关物质/溶出度/含量均匀度 | sample_required | 已新增 `溶出度-辛伐他汀HPLC` 和 `有关物质-辛伐他汀`；需确认 HPLC 溶出公式、单杂/总杂比例口径和 A＋2.2S，见 `docs/coverage/manual/simvastatin_acceptance.md` |
| 盐酸特拉唑嗪 HPLC/有关物质/溶出度/含量均匀度 | sample_required | 已新增 `溶出度-特拉唑嗪UV` 和 `有关物质-特拉唑嗪`；需确认 500ml/100rpm/30min、0.914 换算、有关物质 0.5% 折算和成品引用待包装品计算过程，见 `docs/coverage/manual/terazosin_acceptance.md` |
| 鞣酸小檗碱 UV 对照法 | sample_required | 自动 blocker/warning 已清零，仍需用户抽查 10.69 系数和 UV 对照法通用公式是否可接受，见 `docs/coverage/manual/berberine_tannate_acceptance.md` |
| 甘草酸二铵 UV 含量/溶出度 | sample_required | 专用方法已结构化，需用样例确认 252/261nm、1.898 公式和回填，见 `docs/coverage/manual/diammonium_glycyrrhizinate_acceptance.md` |
| 克拉霉素 HPLC 溶出度 | sample_required | 已新增 `溶出度-HPLC`，需用样例确认峰面积法、18 倍稀释系数和 85.0% 阈值，见 `docs/coverage/manual/clarithromycin_acceptance.md` |
| 泮托拉唑酸中释放度/释放度/耐酸力 | sample_required | 专用方法已建，自动 blocker 已清零；需用样例确认 288/292nm、0.9458 换算、8.0%/78.0%/92.0% 阈值，见 `docs/coverage/manual/pantoprazole_acceptance.md` |
| Business readiness audit | ok | 16 产品当前 0 blocker / 0 warning；后续进入前端/业务抽查 |
| HPLC | sample_required | 每个涉及产品至少做 1 个含量或有关物质样例 |
| 含量均匀度 | sample_required | 对硝酸异山梨酯片等涉及产品做专项样例 |
| 目测、鉴别、崩解时限 | ok | 重点验收定性结论和文案 |

## 验收优先级

| 批次 | 产品 | 理由 |
|------|------|------|
| 回归确认 | 别嘌醇片 | 0 blocker / 0 warning，作为基线样板继续回归保存、回填、日期和结论 |
| 前端/业务验收 | 复方芦丁片、甘草酸二铵胶囊、克拉霉素胶囊、阿替洛尔片、阿奇霉素胶囊、盐酸维拉帕米片、盐酸左氧氟沙星胶囊、螺内酯片、辛伐他汀片、盐酸特拉唑嗪胶囊、泮托拉唑钠肠溶片、氢氯噻嗪片、甲巯咪唑片、鞣酸小檗碱片、硝酸异山梨酯片 | 0 blocker / 0 warning，重点验证产品专属公式和保存回填 |
| 方法能力修复 | UV 对照法、HPLC、溶出度、含量均匀度、有关物质 | 按方法补齐，不逐产品硬写页面 |
| 特殊结构回归 | 泮托拉唑释放度/耐酸力 | blocker 已清零，按 `pantoprazole_acceptance.md` 做前端/业务样例验收 |

## 验证命令

```bash
python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py
python3 scripts/audit_md_quality.py
python3 scripts/audit_coverage.py
python3 scripts/audit_template_coverage.py
python3 scripts/audit_docx_vs_mapping.py
python3 scripts/audit_business_readiness.py
```
