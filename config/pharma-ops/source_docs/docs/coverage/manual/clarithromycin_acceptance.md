# Clarithromycin（克拉霉素胶囊）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `clarithromycin` |
| 产品名称 | 克拉霉素 胶囊 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/clarithromycin` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/clarithromycin` |
| 中间体 | `/record/clarithromycin/intermediate` |
| 待包装品 | `/record/clarithromycin/packaging` |
| 成品 | `/record/clarithromycin/finished` |
| 结构 JSON | `/api/record-structure/clarithromycin` |

建议测试批号：`P6-CLA-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 溶出度 | 溶出度-HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.3 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.3 有关物质 | 有关物质 | 4 | 33 | `relatedSubstances`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度-HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 通用溶出方法 | 克拉霉素溶出为 HPLC 峰面积法，原通用溶出表偏 UV/OD | 新增 `溶出度-HPLC` 方法，包含对照称重、对照峰面积、6 个样品峰面积、6 个溶出度和平均溶出度 |
| 前端溶出组件 | `dissolutionAssay` 只识别 `样n-OD` | 支持 `样n-峰面积`，HPLC 溶出显示“供试品峰面积” |
| 待包装品 2.2 溶出度 | 操作方法残留压平数据记录表、标准规定、清场、结论 | 操作方法截回制备/测定说明，数据由 `溶出度-HPLC` 字段承接 |
| 成品 2.3 有关物质 | 操作方法残留称样/计算数据记录表 | 操作方法截回色谱、供试品、对照溶液和测定说明，数据由有关物质字段承接 |
| 成品 2.4 溶出度 | 操作方法残留 6 样溶出量结果 | 改为引用待包装品 2.2，数据由 `溶出度-HPLC` 字段承接 |
| 成品 2.6 含量 | 操作方法残留数据记录表和样品含量小表 | 保留制备/测定说明及待包装品 2.4 引用 |
| 中间体 2.3、待包装品 2.4 含量 | 操作方法仍有 HPLC 称重/测定数据表 warning | 操作方法截回制备/测定说明，HPLC 通用字段承接数据 |

## 5. 前端双重验收标准

- 新建批次选择 `克拉霉素 胶囊` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/克拉霉素 胶囊.md` 一致。
- 待包装品 2.2 和成品 2.4 溶出度页面显示“供试品峰面积”，并有 `样1-峰面积` 到 `样6-峰面积`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 待包装品 2.2 和成品 2.4 溶出度结论阈值为 `平均溶出度 >= 85.0`。
- 中间体 2.3、待包装品 2.4、成品 2.6 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 成品 2.3 有关物质页面出现对照溶液峰面积、供试品单杂峰面积、供试品总杂峰面积、单杂、总杂字段。
- 本次清理涉及检测项的操作方法不出现 `**数据记录表：**` 或压平的样品结果表。
- 批号、检验者、复核者、日期等全局字段填一次后，切换阶段/检测项不要求重复录入。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_md_quality.py                       OK, 16/16 no critical issue
scripts/audit_coverage.py                         OK, gaps=[]
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_docx_vs_mapping.py                  OK, 异常项=0
scripts/audit_business_readiness.py               OK, clarithromycin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
python -m py_compile app.py scripts/*.py src/...  OK
route/API smoke                                   OK, stage route 3/3 + structure API
component smoke                                   OK, `dissolutionAssay` renders HPLC peak-area fields
field_key uniqueness smoke                        OK, 16 products
```

## 7. 当前判定

自动 blocker/warning 已清零，克拉霉素胶囊可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
