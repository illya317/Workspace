# Compound Rutin（复方芦丁片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `compound_rutin` |
| 产品名称 | 复方芦丁片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| route | 8/8 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| save/load | 通过 smoke test |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/compound_rutin` |
| 中间体 | `/record/compound_rutin/intermediate` |
| 待包装品 | `/record/compound_rutin/packaging` |
| 成品 | `/record/compound_rutin/finished` |
| 中间体含量 | `/record/compound_rutin/intermediate/content` |
| 待包装品含量 | `/record/compound_rutin/packaging/content` |
| 成品含量 | `/record/compound_rutin/finished/content` |
| 结构 JSON | `/api/record-structure/compound_rutin` |

建议测试批号：`P6-RUTIN-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | 复方芦丁含量 | 4 | 28 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 待包装品 | 2.3 崩解时限 | 崩解时限 | 2 | 16 | `disintegration`, `conclusion` |
| 待包装品 | 2.4 含量 | 复方芦丁含量 | 4 | 28 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.3 脆碎度 | 脆碎度 | 2 | 17 | `friability`, `conclusion` |
| 成品 | 2.4 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 成品 | 2.5 崩解时限 | 崩解时限 | 2 | 16 | `disintegration`, `conclusion` |
| 成品 | 2.6 含量 | 复方芦丁含量 | 4 | 28 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-控制菌 | 2 | 4 | `microbialControl`, `conclusion` |

## 4. 本次修复

| 位置 | 原问题 | 处理 |
|------|--------|------|
| 方法解析 | 一个 method 内不能显式指定不同 section 组件 | `method_resolver` 保留 section `render_as`，`product_builder` 显式配置优先 |
| 中间体 2.3 含量 | 被映射为 `HPLC` | 改为 `复方芦丁含量` |
| 待包装品 2.4 含量 | 被映射为 `滴定` | 改为 `复方芦丁含量` |
| 成品 2.6 含量 | 被映射为 `HPLC` | 改为 `复方芦丁含量` |
| 三个含量项 | 漏 `芦丁对照品` | 已补标准品 |
| 结论判定 | 只判断单一 `平均含量/RD` | 改为同时判断芦丁平均/RD 与维 C 平均/RD |
| 中间体 2.2 水分 | `操作方法` 残留称样、平均和 RD 数据尾巴 | 只保留称取约 1.0g 并测定的操作说明 |
| 中间体 2.3、待包装品 2.4、成品 2.6 含量 | `操作方法` 残留称重、OD、滴定和计算数据表 | 恢复芦丁制备/测定法与维 C 制备/滴定法说明，数据由 `复方芦丁含量` 字段承接 |

## 5. 业务确认点

- 芦丁样品含量和维 C 样品含量目前为人工录入，系统自动计算各自平均值和 RD。
- 样品含量公式涉及品种专属系数、片重和稀释倍数，需业务确认公式后再进一步自动化。
- 当前结论自动判定依赖人工录入的两组样品含量：芦丁 93.0%～107.0%、维 C 93.0%～107.0%，并要求对应 RD 达标。

## 6. 前端双重验收标准

- 三个含量页都显示 `芦丁对照品`。
- 三个含量页都至少有三块数据区：芦丁称重、芦丁测定与计算、维生素 C 称重与滴定。
- 同一页中不出现只剩 HPLC 或只剩滴定的单一结构。
- 三个含量页的操作方法不出现“称重:”“测定与计算:”或供试品样 1/样 2 数据表残留。
- 输入芦丁样 1/样 2 含量后，芦丁平均含量和芦丁 RD 自动更新。
- 输入维 C 样 1/样 2 含量后，维 C 平均含量和维 C RD 自动更新。
- 四个关键值齐全前，结论保持空；齐全后再显示符合/不符合。
- 保存后刷新页面，芦丁和维 C 字段不串值、不丢值。

## 7. 已执行验证

```text
scripts/audit_coverage.py                          OK
scripts/audit_template_coverage.py                 OK, products=16, tests=224, needs_review=0
scripts/audit_component_mapping.py                 OK, current checklist=334, stub=0, missing=0
scripts/audit_docx_vs_mapping.py                   OK, 异常项=0
scripts/audit_business_readiness.py                OK, compound_rutin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
rg --files -g '*.py' | xargs python -m py_compile  OK
route smoke                                        OK, allopurinol/methimazole/compound_rutin
compound content pages                             OK, 3/3
save/load smoke                                    OK, product_name/batch_number/芦丁/维C字段回读正确
```

## 8. 当前判定

复方芦丁片自动 blocker/warning 已清零，可进入用户前端/业务抽查。用户确认公式前，样品含量保持人工录入；不要把它理解成“样品含量公式已完全自动化”。
