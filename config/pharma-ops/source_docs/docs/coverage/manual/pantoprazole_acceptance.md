# Pantoprazole（泮托拉唑钠肠溶片）P6 前端/业务验收报告

> 验收日期：2026-06-12 | 状态：ready_for_acceptance_candidate

## 1. 自动审计结果

| 维度 | 结果 |
|------|------|
| 产品 key | `pantoprazole` |
| 产品名称 | 泮托拉唑钠肠溶片 |
| 阶段 | 中间体 / 待包装品 / 成品 |
| 检测项 | 17 |
| 阶段 route | 3/3 通过 |
| 结构 API | `/api/record-structure/pantoprazole` 通过 |
| MD gaps | 0 |
| DOCX × YAML 异常项 | 0 |
| template `needs_review` | 0 |
| component stub/missing | 0 |
| business readiness | 0 blocker / 0 warning |
| field_key | 16 产品全量无重复 |

## 2. 前端验收入口

| 页面 | URL |
|------|-----|
| 产品首页 | `/record/pantoprazole` |
| 中间体 | `/record/pantoprazole/intermediate` |
| 待包装品 | `/record/pantoprazole/packaging` |
| 成品 | `/record/pantoprazole/finished` |
| 结构 JSON | `/api/record-structure/pantoprazole` |

建议测试批号：`P6-PAN-001`

## 3. 结构摘要

| 阶段 | 检测项 | 方法 | sections | fields | 组件 |
|------|--------|------|:---:|:---:|------|
| 中间体 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 中间体 | 2.2 水分 | 水分 | 2 | 3 | `moistureAssay`, `conclusion` |
| 中间体 | 2.3 含量 | UV-对照法 | 3 | 28 | `referenceWeighing`, `uvReference`, `conclusion` |
| 待包装品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 待包装品 | 2.2 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 待包装品 | 2.3 酸中释放度 | 酸中释放度-泮托拉唑UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.4 释放度 | 释放度-泮托拉唑UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 待包装品 | 2.5 含量 | UV-对照法 | 3 | 28 | `referenceWeighing`, `uvReference`, `conclusion` |
| 成品 | 2.1 性状 | 目测 | 2 | 2 | `genericFieldsTable`, `conclusion` |
| 成品 | 2.2 鉴别 | 鉴别-BPC | 2 | 8 | `identification`, `conclusion` |
| 成品 | 2.3 重量差异 | 重量差异 | 2 | 66 | `weightVariation`, `conclusion` |
| 成品 | 2.4 有关物质 | 有关物质 | 4 | 33 | `relatedSubstances`, `conclusion` |
| 成品 | 2.5 酸中释放度 | 酸中释放度-泮托拉唑UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.6 释放度 | 释放度-泮托拉唑UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.7 耐酸力 | 耐酸力-泮托拉唑UV | 2 | 28 | `dissolutionAssay`, `conclusion` |
| 成品 | 2.8 含量 | UV-对照法 | 3 | 28 | `referenceWeighing`, `uvReference`, `conclusion` |
| 成品 | 2.9 微生物限度检查 | 微生物限度-计数法 | 3 | 18 | `microbialCount`, `conclusion` |

## 4. 本次定点修复

| 位置 | 问题 | 处理 |
|------|------|------|
| 中间体 2.3 含量 | 操作方法混入称重和测定计算数据区 | 操作方法截回制备和测定说明，UV 对照法字段承接称重、吸光度、平均含量、RD |
| 待包装品 2.3 酸中释放度 | 数据记录表、标准规定、异常处理、清场和结论压入操作方法 | 新增 `酸中释放度-泮托拉唑UV`，承接 0.1mol/L 盐酸 900ml、100rpm、120min、288nm±2nm、6 片释放度和平均释放度 |
| 待包装品 2.4 释放度 | 释放度数据表和结论段落压入操作方法 | 新增 `释放度-泮托拉唑UV`，承接 pH6.8 缓冲液 900ml、100rpm、30min、288nm±2nm、6 片释放度和平均释放度 |
| 待包装品 2.5 含量 | 操作方法混入称重和测定计算数据区 | 操作方法截回制备和测定说明，UV 对照法字段承接计算区 |
| 成品 2.2 鉴别 | 清场混入结论，操作方法缺少沉淀反应 | 清场截回 5 项，操作方法补回稀盐酸 + 硅钨酸白色絮状沉淀及 292/250nm 吸收检查 |
| 成品 2.5 酸中释放度 | 释放结果、标准规定、清场和结论压入操作方法 | 改为 `酸中释放度-泮托拉唑UV`，操作方法引用待包装品酸中释放度并保留关键参数 |
| 成品 2.6 释放度 | 释放结果、标准规定、清场和结论压入操作方法 | 改为 `释放度-泮托拉唑UV`，操作方法引用待包装品释放度并保留关键参数 |
| 成品 2.7 耐酸力 | 数据表、标准规定、清场和结论压入操作方法，结论无法自动判定 | 新增 `耐酸力-泮托拉唑UV`，承接酸处理、外观确认、6 片耐酸力和平均耐酸力；结论规则为 `平均耐酸力 >= 92.0` |
| 成品 2.8 含量 | 操作方法尾部残留样品含量、平均含量和 RD 数据区 | 操作方法截回制备和测定说明 |

## 5. 前端双重验收标准

- 新建批次选择 `泮托拉唑钠肠溶片` 后，产品首页显示中间体、待包装品、成品三个阶段。
- 三阶段检测项编号、名称、顺序与 `schema/md_canonical/泮托拉唑钠肠溶片.md` 一致。
- 待包装品 2.3、成品 2.5 酸中释放度页面出现释放介质、900ml、100rpm、120min、288nm±2nm、对照称重、空白 OD、对照 OD、`样1-OD` 到 `样6-OD`、`样1-释放度` 到 `样6-释放度`、`平均释放度`。
- 酸中释放度自动公式为 `(样n-OD - 空白OD) * 对照净重 * 对照含量 * 0.9458 * 9 / ((对照OD - 空白OD) * 4 * 40)`，自动结论规则为 `平均释放度 <= 8.0`。
- 待包装品 2.4、成品 2.6 释放度页面出现 pH6.8 缓冲液、900ml、100rpm、30min、288nm±2nm、6 片释放度和平均释放度。
- 释放度自动公式同酸中释放度，自动结论规则为 `平均释放度 >= 78.0`。
- 成品 2.7 耐酸力页面出现酸处理介质、900ml、100rpm、120min、292nm±2nm、外观确认、6 片耐酸力和平均耐酸力。
- 耐酸力自动公式为 `(样n-OD - 空白OD) * 对照净重 * 对照含量 * 0.9458 * 4 / ((对照OD - 空白OD) * 40)`，自动结论规则为 `平均耐酸力 >= 92.0`。
- 成品 2.2 鉴别页面应能看到两类操作：稀盐酸 + 硅钨酸白色絮状沉淀，以及 292nm±2nm 最大吸收 / 250nm±2nm 最小吸收。
- 本次清理涉及检测项的操作方法不出现 `**数据记录表：**`、`2.x.x 标准规定`、`实验结果异常处理`、`清场`、`结论批号`、`检验者/日期` 等压平污染。
- 点击保存后刷新页面，已填字段、批号和产品名称能回填。

## 6. 建议输入样例

| 检测项 | 输入 | 预期 |
|--------|------|------|
| 待包装品 2.3 酸中释放度 | 对照含量 100、对照毛重 15、对照皮重 0、空白 OD 0、对照 OD 0.5、6 个样品 OD 均为 0.04 | 平均释放度 6.3842%，结论 `符合` |
| 待包装品 2.3 酸中释放度 | 同上，6 个样品 OD 均为 0.06 | 平均释放度 9.5762%，结论 `不符合` |
| 待包装品 2.4 释放度 | 对照含量 100、对照毛重 15、对照皮重 0、空白 OD 0、对照 OD 0.5、6 个样品 OD 均为 0.5 | 平均释放度 79.8019%，结论 `符合` |
| 待包装品 2.4 释放度 | 同上，6 个样品 OD 均为 0.45 | 平均释放度 71.8217%，结论 `不符合` |
| 成品 2.7 耐酸力 | 对照含量 100、对照毛重 10、对照皮重 0、空白 OD 0、对照 OD 0.5、外观确认 `符合`、6 个样品 OD 均为 0.5 | 平均耐酸力 94.58%，结论 `符合` |
| 成品 2.7 耐酸力 | 同上，6 个样品 OD 均为 0.45 | 平均耐酸力 85.122%，结论 `不符合` |

## 7. 已执行验证

```text
scripts/audit_business_readiness.py               OK, pantoprazole=0 blocker / 0 warning; current total=16 ready / 0 manual / 0 fix / 0 blockers / 0 warnings
scripts/audit_component_mapping.py                OK, current checklist=334, stub=0, missing=0
scripts/audit_template_coverage.py                OK, products=16, tests=224, needs_review=0
scripts/audit_docx_vs_mapping.py                  OK, 异常项=0
scripts/audit_md_quality.py                       OK, 16/16 no_critical_md_cleanup_issue
route/API smoke                                   OK, stage route 3/3 + structure API + /coverage + /methods/editor/test
formula smoke                                     OK, 酸中释放度、释放度、耐酸力 6 个通过/不通过样例均符合预期
field_key uniqueness                              OK, 16 products
```

## 8. 当前判定

自动 blocker/warning 已清零，泮托拉唑钠肠溶片可以进入用户前端/业务抽查。用户确认前，状态保持 `ready_for_acceptance_candidate`，不标记为 `accepted`。
