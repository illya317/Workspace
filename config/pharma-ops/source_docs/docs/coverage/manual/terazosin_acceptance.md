# Terazosin（盐酸特拉唑嗪胶囊）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `terazosin` |
| 产品名称 | 盐酸特拉唑嗪 胶囊 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/terazosin` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/terazosin` |
| 中间体 | `/record/terazosin/intermediate` |
| 待包装品 | `/record/terazosin/packaging` |
| 成品 | `/record/terazosin/finished` |
| 结构 JSON | `/api/record-structure/terazosin` |

建议测试批号：`P6-TER-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 待包装品 | 2.3 溶出度 | 溶出度-特拉唑嗪UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 有关物质 | 有关物质-特拉唑嗪 | 2 | 7 | `relatedSubstances`, `conclusion` |
| 成品 | 2.4 含量均匀度 | 含量均匀度 | 4 | 51 | `contentUniformity`, `conclusion` |
| 成品 | 2.5 溶出度 | 溶出度-特拉唑嗪UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.6 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.7 微生物限度检查 | 微生物限度-控制菌 | 2 | 4 | `microbialControl`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.3 含量 | 操作方法缺头且混入 HPLC 称重/测定数据区 | 操作方法截回色谱条件、制备和测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.2 含量均匀度 | 操作方法混入数据记录表，结论规则含 `{max}` 占位符 | 操作方法截回 HPLC 含量均匀度说明，结论规则改为 `A_2.2S <= 13.0` |
| 待包装品 2.3 溶出度 | 6 粒 OD/溶出结果、标准规定、清场和结论压入操作方法 | 新增 `溶出度-特拉唑嗪UV`，字段承接 500ml、100rpm、30min、246nm±2nm、空白胶囊 OD、6 粒溶出度和平均溶出度 |
| 待包装品 2.4 含量 | 操作方法残留 HPLC 数据记录表 | 操作方法截回 HPLC 条件、制备和测定说明 |
| 成品 2.2 鉴别 | 操作方法缺少氯化物鉴别反应 | 补回保留时间、UV 最大吸收和氯化物鉴别三条操作 |
| 成品 2.3 有关物质 | 杂质计算、标准规定、异常处理、清场和结论压入操作方法 | 新增 `有关物质-特拉唑嗪`，按对照溶液主峰面积代表 0.5% 折算单杂/总杂 |
| 成品 2.4 含量均匀度 | 操作方法混入 10 粒结果、标准规定、清场和结论 | 操作方法改为引用待包装品 2.2 的测定和计算过程 |
| 成品 2.5 溶出度 | 操作方法混入 6 粒结果、标准规定、清场和结论 | 改为 `溶出度-特拉唑嗪UV`，操作方法明确引用待包装品 2.3 |
| 成品 2.6 含量 | 操作方法混入数据表和样品结果 | 操作方法改为引用待包装品 2.4 的制备、测定和计算过程 |

## 5. 前端双重验收标准

- 新建批次选择 `盐酸特拉唑嗪 胶囊` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/盐酸特拉唑嗪 胶囊.md` 一致。
- 中间体 2.3、待包装品 2.4、成品 2.6 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.4 含量均匀度页面出现 10 粒含量、平均值、标准差、A＋2.2S 字段。
- 含量均匀度自动结论规则为 `A_2.2S <= 13.0`。
- 待包装品 2.3 和成品 2.5 溶出度页面出现溶出介质、500ml、100rpm、30min、246nm±2nm、对照称重、空白胶囊 OD、对照 OD、`样1-OD` 到 `样6-OD`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 溶出度自动公式为 `(样n-OD - 空白胶囊OD) * 0.914 * 对照净重 * 对照含量 / (对照OD * 5 * 2)`，自动结论规则为 `平均溶出度 >= 88.0`。
- 成品 2.3 有关物质页面出现供试品称样、对照溶液峰面积、供试品单杂峰面积、供试品总杂峰面积、单杂、总杂。
- 有关物质自动公式为 `单杂 = 单杂峰面积 / 对照峰面积 * 0.5`、`总杂 = 总杂峰面积 / 对照峰面积 * 0.5`，自动结论规则为 `单杂 <= 0.5 && 总杂 <= 1.0`。
- 成品 2.2 鉴别页面应能看到三条业务操作：HPLC 保留时间、246nm 最大吸收、氯化物鉴别反应。
- 成品 2.4 含量均匀度、成品 2.5 溶出度、成品 2.6 含量当前保留“见待包装品对应项”的业务引用；前端抽查时确认是否要重复录入或跨检测项读取。
- 本次清理涉及检测项的操作方法不出现 `**数据记录表：**`、`2.x.5.1`、`结论批号`、`{max}`、`平均溶出量` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, terazosin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API + 3 key pages
formula smoke                                     OK, 溶出度=91.4 -> 符合 / 82.26 -> 不符合；单杂=0.5/总杂=0.95 -> 符合，1.05 -> 不符合；A_2.2S=13 -> 符合，13.1 -> 不符合
```

## 7. 当前判定

自动 blocker/warning 已清零，盐酸特拉唑嗪胶囊可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
