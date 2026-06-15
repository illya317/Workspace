# Isosorbide Dinitrate（硝酸异山梨酯片）P6 人工确认报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `isosorbide_dinitrate` |
| 产品名称 | 硝酸异山梨酯片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 12 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/isosorbide_dinitrate` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/isosorbide_dinitrate` |
| 中间体 | `/record/isosorbide_dinitrate/intermediate` |
| 待包装品 | `/record/isosorbide_dinitrate/packaging` |
| 成品 | `/record/isosorbide_dinitrate/finished` |
| 结构 JSON | `/api/record-structure/isosorbide_dinitrate` |

建议测试批号：`P6-ISDN-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 待包装品 | 2.3 溶出度 | 溶出度 | 2 | 26 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.3 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度 | 2 | 26 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 脆碎度 | 脆碎度 | 2 | 17 | `friability`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.2 水分 | `操作方法` 残留水分记录表 | 操作方法只保留称样测定说明，水分表格由 `moistureAssay` 组件生成 |
| 中间体 2.3 含量 | `操作方法` 残留称重、系统适用性、对照品计算和供试品计算表 | 操作方法只保留 HPLC 制备/测定说明，称重与峰面积录入由 `referenceWeighing`、`hplcAssay` 承接 |
| 中间体 2.3 含量 | `清场` 混入结论、签名和图谱提示 | 清场只保留 5 条清场动作，图谱提示移到 `附加说明` |
| 待包装品 2.2 含量均匀度 | `操作方法` 残留样 1-10 数据记录表 | 操作方法只保留制备/测定说明，样 1-10 表格由含量均匀度组件承接 |
| 待包装品 2.3 溶出度 | `操作方法` 残留 AR/CX 数据记录表 | 操作方法只保留溶出、制备、测定和外标法计算说明，6 片结果由溶出度组件承接 |
| 成品 2.3 含量均匀度 | `操作方法` 残留数据记录表和样 1-10 表格 | 操作方法只保留制备/测定说明与待包装品引用，数据表由含量均匀度结构字段承接 |
| 成品 2.3 含量均匀度 | 结论规则含 `{max}` 占位 | 按标准规定改为 `A_2.2S <= 13.0` |
| 成品 2.4 溶出度 | `操作方法` 混入样品结果、标准规定、异常处理、清场和结论 | 截回操作说明与待包装品引用，删除压平后续小节 |
| 成品 2.4 溶出度 | 结论字段名为 `平均溶出量`，与通用溶出组件字段不一致 | 改为 `平均溶出度 >= 75.0` |
| 成品 2.6 含量 | `操作方法` 残留数据记录表和样品含量表 | 操作方法只保留 HPLC 制备/测定说明与待包装品引用 |
| 成品 2.7 微生物限度检查 | `清场` 混入截断的退出段落 | 清场只保留清场动作，退出说明拆到独立 `退出` 字段 |

## 5. 剩余自动 warning

无。当前自动审计结果为 `isosorbide_dinitrate=0 blocker / 0 warning`。

## 6. 前端双重验收标准

- 新建批次选择 `硝酸异山梨酯片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/硝酸异山梨酯片.md` 一致。
- 中间体 2.3 操作方法不出现“2.3.5.1 称重”“测定与计算”等压平记录区。
- 待包装品 2.2 操作方法不出现样 1-10 原始表格残留。
- 待包装品 2.3 操作方法不出现 AR1/CX1 等压平结果区。
- 成品 2.3 操作方法不出现“数据记录表”或样 1-10 原始表格残留。
- 成品 2.4 操作方法不出现“2.4.6 标准规定”“2.4.8 清场”“2.4.9 结论”等压平小节。
- 成品 2.6 操作方法不出现“数据记录表”或样品含量压平文本。
- 成品 2.7 清场不出现截断的“2.7.14 退出 人员、物品退出洁净区按《实验室洁”。
- 成品 2.4 溶出度输入 6 个样品后，平均溶出度和结论字段联动；结论阈值为 75.0%。
- 成品 2.3 含量均匀度输入样 1-10 后，A+2.2S 结论阈值为 13.0。
- 批号、检验者、复核者、日期等全局字段填一次后，切换阶段/检测项不要求重复录入。
- 日期默认初始化只填空字段；保存过的日期刷新后不被覆盖。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 7. 已执行验证

```text
scripts/audit_md_quality.py                       OK, 16/16 no critical issue
scripts/audit_coverage.py                         OK, gaps=[]
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
scripts/audit_component_mapping.py                OK, current checklist=334, stub=0, missing=0
scripts/audit_docx_vs_mapping.py                  OK, 异常项=0
scripts/audit_business_readiness.py               OK, isosorbide=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
python -m py_compile app.py scripts/*.py src/...  OK
route/API smoke                                   OK, stage route 3/3 + structure API
```

## 8. 当前判定

自动 blocker/warning 已清零，硝酸异山梨酯片进入用户前端/业务验收候选。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
