# P6 产品验收矩阵

> 更新时间：2026-06-12
> 数据源：`docs/coverage/component_checklist.md` + `docs/coverage/audit/gaps.yaml` + `docs/coverage/audit/audit_report.md` + `docs/coverage/audit/template_generation_report.md` + `docs/coverage/audit/business_readiness_report.md`
> 用途：指导 16 产品逐品种前端/业务验收。

## 当前总览

| 维度 | 当前结果 |
|------|----------|
| 产品数 | 16 |
| 正式 record templates | 16 |
| YAML `needs_review` | 0 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| 组件实例 | 334 |
| 组件 stub/missing | 0 |
| Business readiness | 16 ready / 0 manual check / 0 needs fix |
| Business blockers | 0 |
| Business warnings | 0 |

## 状态定义

| 状态 | 含义 |
|------|------|
| `ready_for_acceptance` | 自动审计通过，可进入用户前端/业务抽查 |
| `ready_for_acceptance_candidate` | 自动审计通过，待用户前端/业务抽查，不等同于 accepted |
| `accepted` | 已完成该产品验收记录，且用户业务问题关闭 |
| `needs_manual_check` | 无业务 blocker，但仍有 warning，需用户/前端抽查确认 |
| `needs_business_fix` | 自动审计通过，但用户抽查发现业务或页面问题 |

## 产品矩阵

| # | 产品 | key | UI 组件 | DATA | route | 当前状态 |
|---|------|-----|:---:|:---:|:---:|----------|
| 1 | 别嘌醇片 | `allopurinol` | 0 stub | 0 gaps / 0 review | ✅ | `accepted`（BR 0 blocker / 0 warning） |
| 2 | 复方芦丁片 | `compound_rutin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 3 | 甘草酸二铵胶囊 | `diammonium_glycyrrhizinate` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 4 | 克拉霉素 胶囊 | `clarithromycin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 5 | 阿替洛尔片 | `atenolol` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 6 | 阿奇霉素胶囊 | `azithromycin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 7 | 鞣酸小檗碱片 | `berberine_tannate` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 8 | 甲巯咪唑片 | `methimazole` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 9 | 盐酸左氧氟沙星胶囊 | `levofloxacin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 10 | 盐酸维拉帕米片 | `verapamil` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 11 | 螺内酯片 | `spironolactone` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 12 | 氢氯噻嗪片 | `hydrochlorothiazide` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 13 | 盐酸特拉唑嗪 胶囊 | `terazosin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 14 | 硝酸异山梨酯片 | `isosorbide_dinitrate` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 15 | 辛伐他汀片 | `simvastatin` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |
| 16 | 泮托拉唑钠肠溶片 | `pantoprazole` | 0 stub | 0 gaps / 0 review | ✅ | `ready_for_acceptance_candidate`（BR 0 blocker / 0 warning） |

## 推荐验收顺序

1. 别嘌醇片：保留为回归样板；当前 0 blocker / 0 warning，可继续用于保存、回填、日期和结论回归。
2. 复方芦丁片：0 blocker / 0 warning，进入前端/业务抽查；重点确认芦丁 UV、维 C 滴定和人工录入含量口径。
3. 甘草酸二铵胶囊：0 blocker / 0 warning，进入前端/业务抽查；重点确认 252/261nm、1.898 公式、保存回填。
4. 克拉霉素胶囊：0 blocker / 0 warning，进入前端/业务抽查；重点确认 HPLC 溶出峰面积法和 85.0% 结论阈值。
5. 阿替洛尔片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 224nm UV 溶出、有关物质总杂和 HPLC 含量。
6. 阿奇霉素胶囊：0 blocker / 0 warning，进入前端/业务抽查；重点确认 HPLC 溶出峰面积法、阿奇霉素有关物质限度和 80.0% 阈值。
7. 盐酸维拉帕米片：0 blocker / 0 warning，进入前端/业务抽查；重点确认双波长溶出△A、有关物质总杂和 HPLC 含量。
8. 盐酸左氧氟沙星胶囊：0 blocker / 0 warning，进入前端/业务抽查；重点确认 294nm UV 溶出、238/294nm 有关物质和 HPLC 引用关系。
9. 螺内酯片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 83.0% 溶出阈值、双波长有关物质和 A＋2.2S。
10. 辛伐他汀片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 HPLC 溶出公式、有关物质单杂/总杂和 A＋2.2S。
11. 盐酸特拉唑嗪胶囊：0 blocker / 0 warning，进入前端/业务抽查；重点确认 500ml/100rpm/30min UV 溶出、0.914 换算、有关物质 0.5% 折算和 A＋2.2S。
12. 泮托拉唑钠肠溶片：0 blocker / 0 warning，进入前端/业务抽查；重点确认酸中释放度、释放度、耐酸力和 0.9458 换算，见 `docs/coverage/manual/pantoprazole_acceptance.md`。
13. 氢氯噻嗪片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 HPLC、溶出度、有关物质和含量均匀度表格。
14. 甲巯咪唑片：0 blocker / 0 warning，进入前端/业务抽查；重点确认滴定、含量均匀度和成品鉴别清场。
15. 鞣酸小檗碱片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 UV 对照法 10.69 系数和微生物清场。
16. 硝酸异山梨酯片：0 blocker / 0 warning，进入前端/业务抽查；重点确认 HPLC、溶出度、含量均匀度和微生物退出段。
17. 标准品补齐：已通过 `scripts/sync_missing_standards.py` 从 MD 同步 80 处，后续用 dry-run 防回归。

## 验收说明

自动审计通过不等于业务验收完成。产品进入前端/业务双验收前，必须先满足 `business_readiness_report.md` 中该产品 0 blocker。每个待验收产品仍需用户对照 MD 抽查：

- 产品/阶段/检测项顺序。
- 表格行列和字段位置。
- 操作文案、标准规定、清场和异常处理。
- 日期、批号、签名复用。
- 输入样例后的计算和结论。
- 保存、刷新、切换页面后的回填。

详见 `docs/plan/implementation_plan.md` 的单产品交付模板。

全量入口、三阶段代表检测项、建议测试批号和自动 save/load 结果见 `docs/coverage/manual/p6_frontend_acceptance_pack.md`。该文件由 `scripts/generate_manual_acceptance_pack.py` 生成。
