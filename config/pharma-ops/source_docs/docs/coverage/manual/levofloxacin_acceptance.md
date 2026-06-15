# Levofloxacin（盐酸左氧氟沙星胶囊）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `levofloxacin` |
| 产品名称 | 盐酸左氧氟沙星胶囊 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 11 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/levofloxacin` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/levofloxacin` |
| 中间体 | `/record/levofloxacin/intermediate` |
| 待包装品 | `/record/levofloxacin/packaging` |
| 成品 | `/record/levofloxacin/finished` |
| 结构 JSON | `/api/record-structure/levofloxacin` |

建议测试批号：`P6-LEV-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.2 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 待包装品 | 2.2 溶出度 | 溶出度-左氧氟沙星UV | 2 | 27 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 鉴别 | 鉴别 | 4 | 13 | `identification`, `conclusion` |
| 成品 | 2.2 有关物质 | 有关物质-左氧氟沙星 | 2 | 11 | `relatedSubstances`, `conclusion` |
| 成品 | 2.3 溶出度 | 溶出度-左氧氟沙星UV | 2 | 27 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.4 装量差异 | 装量差异 | 2 | 86 | `fillVariation`, `conclusion` |
| 成品 | 2.5 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.6 微生物限度检查 | 微生物限度-控制菌 | 2 | 4 | `microbialControl`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.2 含量 | 操作方法混入称重、测定计算、标准规定、异常处理、清场和结论 | 操作方法截回制备/测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.2 溶出度 | 294nm UV 溶出度数据表压入操作方法 | 新增 `溶出度-左氧氟沙星UV`，字段承接对照、空白 OD、6 个样品 OD/溶出度、平均溶出度 |
| 待包装品 2.3 含量 | 操作方法混入 HPLC 称样/计算表 | 操作方法截回系统适用性、制备和测定说明 |
| 成品 2.2 有关物质 | 238/294nm 有关物质数据表残留，标准规定混入小节号 | 新增 `有关物质-左氧氟沙星`，字段承接系统适用性、杂质 A、其他单杂、总杂 |
| 成品 2.3 溶出度 | 操作方法残留 6 样结果表并引用待包装品计算过程 | 改为 `溶出度-左氧氟沙星UV`，操作方法明确引用待包装品 2.2 |
| 成品 2.5 含量 | 操作方法残留数据记录表和样品含量小表 | 保留制备/测定说明及待包装品 2.3 引用 |
| 成品 2.6 微生物限度 | 清场混入结论和签名 | 清场截回退出洁净区说明 |

## 5. 前端双重验收标准

- 新建批次选择 `盐酸左氧氟沙星胶囊` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/盐酸左氧氟沙星胶囊.md` 一致。
- 中间体 2.2、待包装品 2.3、成品 2.5 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.3 溶出度页面出现 294nm、空白 OD、对照 OD、`样1-OD` 到 `样6-OD`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 溶出度自动结论规则为 `平均溶出度 >= 85.0`。
- 成品 2.2 有关物质页面出现系统适用性分离度、杂质 A 峰面积、杂质 A 对照品峰面积、对照溶液主峰面积、其他单个最大杂质峰面积、其他各杂质峰面积和、杂质 A、其他单杂、总杂。
- 成品 2.2 有关物质自动结论规则为 `杂质A <= 0.3 && 其他单杂 <= 0.3 && 总杂 <= 0.7`。
- 有关物质的 `杂质A`、`其他单杂`、`总杂` 当前为人工录入百分比，不自动根据峰面积推导；业务抽查时需确认是否接受，或后续补充稀释倍数公式。
- 成品 2.3 溶出度和成品 2.5 含量当前保留“见待包装品对应项”的业务引用；前端抽查时确认是否要重复录入或跨检测项读取。
- 本次清理涉及检测项的操作方法/标准规定/清场不出现 `**数据记录表：**`、`2.x.5.1`、`结论批号`、`{min}` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, levofloxacin=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API + 2 key pages
formula smoke                                    OK, 平均溶出度=85 -> 符合；总杂=0.6 -> 符合；总杂=0.8 -> 不符合
```

## 7. 当前判定

自动 blocker/warning 已清零，盐酸左氧氟沙星胶囊可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
