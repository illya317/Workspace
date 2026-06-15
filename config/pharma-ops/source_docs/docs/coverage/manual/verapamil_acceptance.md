# Verapamil（盐酸维拉帕米片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `verapamil` |
| 产品名称 | 盐酸维拉帕米片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/verapamil` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/verapamil` |
| 中间体 | `/record/verapamil/intermediate` |
| 待包装品 | `/record/verapamil/packaging` |
| 成品 | `/record/verapamil/finished` |
| 结构 JSON | `/api/record-structure/verapamil` |

建议测试批号：`P6-VER-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 待包装品 | 2.3 溶出度 | 溶出度-双波长UV | 2 | 29 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.3 有关物质 | 有关物质-维拉帕米 | 2 | 6 | `relatedSubstances`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度-双波长UV | 2 | 29 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.3 含量 | 操作方法残留称重、测定计算、标准规定、异常处理、清场和结论 | 操作方法截回制备/测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.3 溶出度 | 双波长 UV 溶出度数据表压入操作方法 | 新增 `溶出度-双波长UV` 方法，字段承接 278/300nm OD、对照△A、6 个样品△A/溶出度、平均溶出度 |
| 待包装品 2.4 含量 | 操作方法残留 HPLC 称样/计算表 | 操作方法截回制备/测定说明，HPLC 通用字段承接数据 |
| 成品 2.2 鉴别 | 标准规定混入异常处理、清场、结论 | 标准规定截回三条鉴别标准 |
| 成品 2.3 有关物质 | 操作方法残留数据记录表 | 新增 `有关物质-维拉帕米` 方法，字段承接系统适用性、供试品称样、对照峰面积、供试品总杂峰面积、总杂 |
| 成品 2.4 溶出度 | 操作方法残留 6 样结果表 | 改为 `溶出度-双波长UV` 并引用待包装品 2.3 |
| 成品 2.6 含量 | 操作方法残留数据记录表和样品含量小表 | 保留制备/测定说明及待包装品 2.4 引用 |

## 5. 前端双重验收标准

- 新建批次选择 `盐酸维拉帕米片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/盐酸维拉帕米片.md` 一致。
- 中间体 2.3、待包装品 2.4、成品 2.6 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.3 和成品 2.4 溶出度页面出现 278nm/300nm 空白与对照 OD、对照△A、`样1-OD` 到 `样6-OD`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 当前 `样n-OD` 字段承接双波长差值△A；业务抽查时请确认前端标签是否需要改成 `样n-△A`。
- 待包装品 2.3 和成品 2.4 溶出度结论阈值为 `平均溶出度 >= 80.0`。
- 成品 2.3 有关物质页面出现系统适用性理论板数、供试品称样、对照溶液峰面积、供试品总杂峰面积、总杂。
- 成品 2.3 有关物质自动结论规则为 `总杂 <= 1.0`。
- 本次清理涉及检测项的操作方法/标准规定不出现 `**数据记录表：**`、`2.x.5.1`、`结论批号` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, verapamil=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API
formula smoke                                    OK, 总杂=0.5 -> 符合；平均溶出度=80 -> 符合
```

## 7. 当前判定

自动 blocker/warning 已清零，盐酸维拉帕米片可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
