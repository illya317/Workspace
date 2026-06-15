# Azithromycin（阿奇霉素胶囊）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `azithromycin` |
| 产品名称 | 阿奇霉素胶囊 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 12 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/azithromycin` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/azithromycin` |
| 中间体 | `/record/azithromycin/intermediate` |
| 待包装品 | `/record/azithromycin/packaging` |
| 成品 | `/record/azithromycin/finished` |
| 结构 JSON | `/api/record-structure/azithromycin` |

建议测试批号：`P6-AZI-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.2 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 待包装品 | 2.2 溶出度 | 溶出度-HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.2 有关物质 | 有关物质-阿奇霉素 | 2 | 15 | `relatedSubstances`, `conclusion` |
| 成品 | 2.3 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度-HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.2 含量 | 操作方法残留称重/测定表、清场、结论、图谱提示 | 操作方法截回制备/测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.2 溶出度 | 阿奇霉素溶出为 HPLC 峰面积法，原来混入数据记录表 | 改为 `溶出度-HPLC`，字段承接对照峰面积、6 个样品峰面积、6 个溶出度和平均溶出度 |
| 待包装品 2.3 含量 | 操作方法残留 HPLC 称样/计算表 | 操作方法截回制备/测定说明，HPLC 通用字段承接数据 |
| 成品 2.2 有关物质 | 操作方法残留梯度表、称样/计算表、标准规定、异常处理、清场、结论 | 新增 `有关物质-阿奇霉素` 方法，字段承接系统适用性、灵敏度、杂质 B/H/Q、其他单杂和总杂 |
| 成品 2.4 溶出度 | 操作方法残留 6 样溶出度结果表 | 改为 `溶出度-HPLC`，并引用待包装品 2.2 计算过程 |
| 成品 2.6 含量 | 操作方法残留样品含量小表 | 保留制备/测定说明及待包装品 2.3 引用 |
| 前端有关物质组件 | 有峰面积字段时，专用杂质计算字段可能重复显示 | `relatedSubstances` 支持峰面积字段与杂质限度表共存，汇总区不重复显示杂质 B/H/Q |

## 5. 前端双重验收标准

- 新建批次选择 `阿奇霉素胶囊` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/阿奇霉素胶囊.md` 一致。
- 中间体 2.2、待包装品 2.3、成品 2.6 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.4 溶出度页面显示“供试品峰面积”，并有 `样1-峰面积` 到 `样6-峰面积`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 待包装品 2.2 和成品 2.4 溶出度结论阈值为 `平均溶出度 >= 80.0`。
- 成品 2.2 有关物质页面出现系统适用性分离度、灵敏度信噪比、对照溶液主峰面积、杂质 B/H/Q 峰面积、其他单个最大杂质峰面积、各杂质校正峰面积和。
- 成品 2.2 有关物质自动计算 `杂质B`、`杂质H`、`杂质Q`、`其他单杂`、`总杂`，结论规则为 B≤2.0%、H≤1.0%、Q≤1.0%、其他单杂≤1.0%、总杂≤4.0%。
- 本次清理涉及检测项的操作方法不出现 `**数据记录表：**`、`2.x.5.1称样`、`结论批号` 等压平污染。
- 批号、检验者、复核者、日期等全局字段填一次后，切换阶段/检测项不要求重复录入。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, azithromycin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, checklist missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API
component syntax                                  OK, `relatedSubstances` JS parse
formula smoke                                    OK, 有关物质样例 B=1.0/H=0.05/Q=0.1/其他单杂=0.5/总杂=4.0 -> 符合
```

## 7. 当前判定

自动 blocker/warning 已清零，阿奇霉素胶囊可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
