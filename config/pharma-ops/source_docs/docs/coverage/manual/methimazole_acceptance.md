# Methimazole（甲巯咪唑片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `methimazole` |
| 产品名称 | 甲巯咪唑片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| route | 6/6 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| save/load | 通过 smoke test |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/methimazole` |
| 中间体 | `/record/methimazole/intermediate` |
| 待包装品 | `/record/methimazole/packaging` |
| 成品 | `/record/methimazole/finished` |
| 结构 JSON | `/api/record-structure/methimazole` |

建议测试批号：`P6-MMI-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | 滴定 | 2 | 11 | `titrationAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 崩解时限 | 崩解时限 | 2 | 16 | `disintegration`, `conclusion` |
| 待包装品 | 2.3 含量均匀度 | 含量均匀度 | 4 | 26 | `contentUniformity`, `conclusion` |
| 待包装品 | 2.4 含量 | 滴定 | 2 | 11 | `titrationAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 脆碎度 | 脆碎度 | 2 | 17 | `friability`, `conclusion` |
| 成品 | 2.4 含量均匀度 | 含量均匀度 | 4 | 26 | `contentUniformity`, `conclusion` |
| 成品 | 2.5 崩解时限 | 崩解时限 | 2 | 16 | `disintegration`, `conclusion` |
| 成品 | 2.6 含量 | 滴定 | 2 | 11 | `titrationAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 待包装品 2.3 含量均匀度 | `清场` 混入数据记录表、结论和原始数据文本 | 清场恢复为 MD 原文 4 项；原始数据说明移入 `附加说明` |
| 待包装品 2.3 含量均匀度 | 漏标准品 | 补 `甲巯咪唑对照品` |
| 成品 2.4 含量均匀度 | 漏标准品 | 补 `甲巯咪唑对照品` |
| 中间体/待包装品/成品含量 | 滴定表字段不足 | `滴定` 方法补理论片重、样 1/2 称重字段；滴定组件显示称重列 |
| 待包装品 2.3 / 成品 2.4 含量均匀度 | 10 片样品表未进入结构字段 | `含量均匀度` 方法补样 1-10 OD/含量、平均含量、S、A_2.2S；组件显示汇总字段 |
| 中间体 2.3 / 成品 2.4 操作方法 | `操作方法` 残留数据记录表 | 保留制备/测定说明，数据表转由方法字段承接 |
| 方法解析 | `extends.extra` 字段未进入结构契约 | `method_resolver` 将 extra 解析为 `附加` section 并展开 repeat |
| 待包装品 2.3 含量均匀度 | `操作方法` 残留称重、测定计算和样 1-10 数据区 | 操作方法截回溶液制备、测定法和通则要求，数据由含量均匀度字段承接 |
| 成品 2.2 鉴别 | `清场` 混入结论和签名文本 | 清场恢复为 5 条动作项，结论由独立结论区承接 |

## 5. 建议业务抽查点

| 优先级 | 抽查内容 | MD 对照 |
|--------|----------|---------|
| 高 | 待包装品 2.3 含量均匀度：标准品、称重、供试品 1-10、A+2.2S、清场、原始数据说明 | `schema/md_canonical/甲巯咪唑片.md` 2.3 |
| 高 | 成品 2.4 含量均匀度：是否正确引用待包装品 2.3.4.2.2、样 1-10、A+2.2S | `schema/md_canonical/甲巯咪唑片.md` 2.4 |
| 中 | 中间体/待包装品/成品含量：滴定公式、平均含量、RD、结论单位 | `schema/md_canonical/甲巯咪唑片.md` 2.3 / 2.4 / 2.6 |
| 中 | 成品 2.7 微生物限度：需氧菌、霉菌酵母菌、大肠埃希菌三个结果区 | `schema/md_canonical/甲巯咪唑片.md` 2.7 |

## 6. 前端双重验收标准

- 新建批次选择 `甲巯咪唑片` 后，产品首页显示三个阶段，检测项顺序与本报告一致。
- 批号、检验者、复核者、日期等全局字段填一次后，阶段/检测项切换时不要求重复录入。
- 日期默认初始化只填空字段；保存过的日期刷新后不被覆盖。
- 待包装品 2.3 和成品 2.4 的标准品区显示 `甲巯咪唑对照品`。
- 中间体 2.3 和成品 2.4 的操作方法不出现“数据记录表”等串行污染文本。
- 待包装品 2.3 的操作方法不出现“称重:”“测定与计算:”或样 1-10 原始表格残留。
- 成品 2.2 的清场区不出现“结论”“检验者/日期”或签名文本残留。
- 含量均匀度表显示样 1-10 的 OD/含量，以及平均含量、S、A_2.2S。
- 滴定表显示理论片重、样 1/2 称重、消耗体积、含量、平均含量、RD。
- 含量均匀度、崩解、脆碎度、水分、含量输入关键字段后，结论区在数据齐全前保持空，数据齐全后显示符合/不符合。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 7. 已执行验证

```text
scripts/audit_coverage.py                          OK
scripts/audit_template_coverage.py                 OK, products=16, tests=224, needs_review=0
scripts/audit_component_mapping.py                 OK, current checklist=334, stub=0, missing=0
scripts/audit_business_readiness.py                OK, methimazole=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_docx_vs_mapping.py                   OK, 异常项=0
rg --files -g '*.py' | xargs python -m py_compile  OK
route smoke                                        OK, 6/6
save/load smoke                                    OK, product_name/batch_number/field 回读正确
```

## 8. 当前判定

自动 blocker/warning 已清零，甲巯咪唑片进入用户前端/业务验收候选。用户确认前，不标记为 `accepted`。
