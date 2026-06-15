# Simvastatin（辛伐他汀片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `simvastatin` |
| 产品名称 | 辛伐他汀片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/simvastatin` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/simvastatin` |
| 中间体 | `/record/simvastatin/intermediate` |
| 待包装品 | `/record/simvastatin/packaging` |
| 成品 | `/record/simvastatin/finished` |
| 结构 JSON | `/api/record-structure/simvastatin` |

建议测试批号：`P6-SIM-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 待包装品 | 2.3 溶出度 | 溶出度-辛伐他汀HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 成品 | 2.4 有关物质 | 有关物质-辛伐他汀 | 2 | 8 | `relatedSubstances`, `conclusion` |
| 成品 | 2.5 溶出度 | 溶出度-辛伐他汀HPLC | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.3 含量 | 操作方法混入 HPLC 称重和测定计算表 | 操作方法截回色谱条件、制备和测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.2 含量均匀度 | 操作方法混入均匀度计算表，结论规则含 `{max}` 占位符 | 操作方法截回检查法说明，结论规则改为 `A_2.2S <= 13.0` |
| 待包装品 2.3 溶出度 | HPLC 溶出度数据表压入操作方法 | 新增 `溶出度-辛伐他汀HPLC`，字段承接对照峰面积、6 个样品峰面积、6 个溶出度和平均溶出度 |
| 待包装品 2.4 含量 | 操作方法残留 HPLC 数据记录表 | 操作方法截回 HPLC 条件、制备和测定说明 |
| 成品 2.2 鉴别 | 标准规定混入异常处理、清场、结论和图谱提示 | 标准规定截回两条内控标准，操作方法整理为 HPLC 保留时间 + UV 三波长鉴别 |
| 成品 2.3 含量均匀度 | 操作方法混入 10 片结果、标准规定、异常处理、清场和结论 | 操作方法改为引用待包装品 2.2 的测定与计算过程 |
| 成品 2.4 有关物质 | 梯度 HPLC 数据表、系统适用性和结论段落压入操作方法 | 新增 `有关物质-辛伐他汀`，字段承接对照溶液峰面积、单个最大杂质峰面积、总杂质峰面积、单杂、总杂 |
| 成品 2.5 溶出度 | 操作方法混入 6 样结果和结论段落 | 改为 `溶出度-辛伐他汀HPLC`，操作方法明确引用待包装品 2.3 |
| 成品 2.6 含量 | 操作方法混入待包装品 2.4.5.2 和结论段落 | 操作方法改为引用待包装品 2.4 的制备、测定和计算过程 |

## 5. 前端双重验收标准

- 新建批次选择 `辛伐他汀片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/辛伐他汀片.md` 一致。
- 中间体 2.3、待包装品 2.4、成品 2.6 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.3 含量均匀度页面出现 10 片含量、平均值、标准差、A＋2.2S 字段。
- 含量均匀度自动结论规则为 `A_2.2S <= 13.0`。
- 待包装品 2.3 和成品 2.5 溶出度页面出现溶出介质、900ml、50rpm、30min、对照称重、对照峰面积、`样1-峰面积` 到 `样6-峰面积`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 溶出度自动公式为 `样n-峰面积 * 对照净重 * 9 * 对照含量 / (对照平均峰面积 * 10 * 10)`，自动结论规则为 `平均溶出度 >= 83.0`。
- 成品 2.4 有关物质页面出现系统适用性分离度、对照溶液峰面积、供试品单个最大杂质峰面积、供试品总杂质峰面积、单杂、总杂。
- 成品 2.4 有关物质自动结论规则为 `单杂 <= 1.0 && 总杂 <= 3.0`。
- 有关物质当前按“对照溶液主峰面积代表 1.0%”进行比例计算；业务抽查时请确认该公式口径与实际记录表一致。
- 成品 2.3 含量均匀度、成品 2.5 溶出度、成品 2.6 含量当前保留“见待包装品对应项”的业务引用；前端抽查时确认是否要重复录入或跨检测项读取。
- 本次清理涉及检测项的操作方法/标准规定/清场不出现 `**数据记录表：**`、`2.x.5.1`、`结论批号`、`{min}`、`{max}`、`平均溶出量` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, simvastatin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API + 2 key pages
formula smoke                                    OK, 平均溶出度=86.4 -> 符合；单杂=0.8/总杂=2.5 -> 符合；总杂=3.5 -> 不符合；A_2.2S=13 -> 符合
```

## 7. 当前判定

自动 blocker/warning 已清零，辛伐他汀片可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
