# Atenolol（阿替洛尔片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `atenolol` |
| 产品名称 | 阿替洛尔片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 14 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/atenolol` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/atenolol` |
| 中间体 | `/record/atenolol/intermediate` |
| 待包装品 | `/record/atenolol/packaging` |
| 成品 | `/record/atenolol/finished` |
| 结构 JSON | `/api/record-structure/atenolol` |

建议测试批号：`P6-ATE-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 溶出度 | 溶出度-阿替洛尔UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.3 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 待包装品 | 2.4 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 有关物质 | 有关物质 | 4 | 33 | `relatedSubstances`, `conclusion` |
| 成品 | 2.4 溶出度 | 溶出度-阿替洛尔UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.5 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 成品 | 2.6 脆碎度 | 脆碎度 | 2 | 17 | `friability`, `conclusion` |
| 成品 | 2.7 含量 | HPLC | 3 | 28 | `referenceWeighing`, `hplcAssay`, `conclusion` |
| 成品 | 2.8 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.3 含量 | 操作方法残留 HPLC 称重、系统适用性和测定计算表 | 操作方法截回制备/测定说明，HPLC 通用字段承接称重、峰面积、平均含量、RD |
| 待包装品 2.2 溶出度 | 224nm UV 溶出度数据表压入操作方法 | 新增 `溶出度-阿替洛尔UV`，字段承接对照、空白 OD、6 个样品 OD/溶出度、平均溶出度 |
| 待包装品 2.4 含量 | 操作方法残留数据记录表和结论段落 | 操作方法截回 HPLC 条件、制备和测定说明 |
| 成品 2.2 鉴别 | 清场混入结论、签名和 Markdown 表格残留 | 清场截回 5 条标准清场动作 |
| 成品 2.3 有关物质 | 操作方法残留称样和总杂计算表 | 复用通用 `有关物质` 字段，结论规则改为 `总杂 <= 1.0` |
| 成品 2.4 溶出度 | 操作方法残留 6 样结果和结论段落 | 改为 `溶出度-阿替洛尔UV`，操作方法明确引用待包装品 2.2 |
| 成品 2.6 脆碎度 | 标准规定混入异常处理、清场和结论 | 标准规定截回内控标准 |
| 成品 2.7 含量 | 操作方法残留数据记录表 | 保留制备/测定说明及待包装品 2.4 引用 |

## 5. 前端双重验收标准

- 新建批次选择 `阿替洛尔片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/阿替洛尔片.md` 一致。
- 中间体 2.3、待包装品 2.4、成品 2.7 含量页面出现对照/样品称重、峰面积、平均含量、RD 字段。
- 待包装品 2.2 和成品 2.4 溶出度页面出现 224nm、空白 OD、空白溶剂 OD、对照 OD、`样1-OD` 到 `样6-OD`、`样1-溶出度` 到 `样6-溶出度`、`平均溶出度`。
- 溶出度自动结论规则为 `平均溶出度 >= 75.0`。
- 溶出度的 `样n-溶出度` 当前为人工录入百分比，平均和结论自动计算；业务抽查时请确认是否要把 MD 中 OD 公式完全自动化。
- 成品 2.3 有关物质页面出现对照溶液峰面积、供试品单杂峰面积、供试品总杂峰面积、单杂、总杂。
- 成品 2.3 有关物质自动结论规则为 `总杂 <= 1.0`。
- 成品 2.4 溶出度和成品 2.7 含量当前保留“见待包装品对应项”的业务引用；前端抽查时确认是否要重复录入或跨检测项读取。
- 本次清理涉及检测项的操作方法/标准规定/清场不出现 `**数据记录表：**`、`2.x.5.1`、`结论批号`、`{min}` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 已执行验证

```text
scripts/audit_business_readiness.py               OK, atenolol=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=335, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
route/API smoke                                   OK, stage route 3/3 + structure API + 2 key pages
formula smoke                                    OK, 平均溶出度=75 -> 符合；总杂=0.8 -> 符合；总杂=1.2 -> 不符合
```

## 7. 当前判定

自动 blocker/warning 已清零，阿替洛尔片可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
