# Hydrochlorothiazide（氢氯噻嗪片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `hydrochlorothiazide` |
| 产品名称 | 氢氯噻嗪片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/hydrochlorothiazide` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/hydrochlorothiazide` |
| 中间体 | `/record/hydrochlorothiazide/intermediate` |
| 待包装品 | `/record/hydrochlorothiazide/packaging` |
| 成品 | `/record/hydrochlorothiazide/finished` |
| 结构 JSON | `/api/record-structure/hydrochlorothiazide` |

建议测试批号：`P6-HCTZ-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 溶出度 | 溶出度 | 2 | 26 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.3 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 有关物质 | 有关物质 | 4 | 33 | `relatedSubstances`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度 | 2 | 26 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 成品 | 2.6 脆碎度 | 脆碎度 | 2 | 17 | `friability`, `conclusion` |
| 成品 | 2.7 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.8 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 通用 HPLC 方法 | 字段过少，只能表达对照含量和色谱柱 | 补对照/样品称重、净重、峰面积、平均含量、RD 等通用字段 |
| 中间体 2.3 含量 | `操作方法` 残留称重、测定计算和数据记录表 | 操作方法截回制备/测定说明，数据由 HPLC 字段承接 |
| 待包装品 2.2 溶出度 | `操作方法` 残留 UV 溶出数据记录表 | 操作方法截回制备/测定说明，结论字段对齐 `平均溶出度 >= 70.0` |
| 待包装品 2.3 含量均匀度 | `操作方法` 残留对照称样、测定计算和样 1-10 数据区 | 操作方法截回制备/测定说明，数据由含量均匀度字段承接 |
| 待包装品 2.4 含量 | `操作方法` 残留称重、测定计算和数据记录表 | 操作方法截回制备/测定说明，数据由 HPLC 字段承接 |
| 成品 2.3 有关物质 | `操作方法` 残留称样、系统适用性和杂质计算数据区 | 保留梯度洗脱、溶液制备和测定法说明，数据由有关物质字段承接 |
| 成品 2.4 溶出度 | 结论字段仍使用 `平均溶出量/{min}` | 改为 `平均溶出度 >= 70.0` |
| 成品 2.5 含量均匀度 | `操作方法` 残留数据记录表和样 1-10 表 | 保留制备/测定说明及待包装品 2.3.5.2 引用 |
| 成品 2.7 含量 | `操作方法` 末尾残留样品含量小表 | 保留制备/测定说明及待包装品 2.4.5.2 引用 |

## 5. 剩余自动 warning

无。当前自动审计结果为 `hydrochlorothiazide=0 blocker / 0 warning`。

## 6. 前端双重验收标准

- 新建批次选择 `氢氯噻嗪片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/氢氯噻嗪片.md` 一致。
- 中间体 2.3、待包装品 2.4、成品 2.7 的 HPLC 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.4 溶出度输入 6 个样品 OD 后，平均溶出度和结论字段联动；阈值为 70.0%。
- 待包装品 2.3 含量均匀度操作方法不出现“对照称样”“测定与计算”或样 1-10 原始表格残留。
- 成品 2.3 有关物质操作方法不出现 `2.3.5.1称样`、称样表或杂质计算小表残留。
- 成品 2.5 含量均匀度操作方法不出现“数据记录表”或样 1-10 原始表格残留。
- 中间体 2.3、待包装品 2.2、待包装品 2.4 操作方法不出现 `**数据记录表：**`。
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
scripts/audit_business_readiness.py               OK, hydrochlorothiazide=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
python -m py_compile app.py scripts/*.py src/...  OK
route/API smoke                                   OK, stage route 3/3 + structure API
field_key uniqueness smoke                        OK, 16 products
```

## 8. 当前判定

自动 blocker/warning 已清零，氢氯噻嗪片进入用户前端/业务验收候选。用户确认前，不标记为 `accepted`。
