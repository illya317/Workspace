# 甘草酸二铵胶囊验收准备记录

> 状态：`ready_for_acceptance_candidate`
> 日期：2026-06-12
> 结论：自动审计已清零 blocker/warning，可进入前端和业务抽查；1.898 换算公式仍需用业务样例确认。

## 本轮处理

甘草酸二铵胶囊原阻塞点集中在 UV 含量和溶出度：操作方法中混入数据记录表，且通用 `UV-对照法` / `溶出度` 不能明确表达烟酰胺对照品、252/261nm 双波长和 1.898 换算系数。

本轮已完成：

- 新增 `UV-甘草酸二铵含量` 方法，覆盖对照称样、对照 OD/mg、样品 OD、平均粒重、1.898 换算系数、平均含量和 RD。
- 新增 `溶出度-甘草酸二铵UV` 方法，覆盖溶出参数、252/261nm、烟酰胺对照、1.898 系数、6 个样品 OD/溶出度和平均溶出度。
- 中间体 2.3、待包装品 2.4、成品 2.5 含量切换到 `UV-甘草酸二铵含量`。
- 待包装品 2.3、成品 2.4 溶出度切换到 `溶出度-甘草酸二铵UV`。
- 上述 5 个检测项 `操作方法` 已去除 `数据记录表`、Markdown 表格、标准规定/清场/结论残留。
- 溶出度结论字段由不存在的 `平均溶出量` 修正为 `平均溶出度`，判定规则为 `平均溶出度 >= 80.0`。

## 结构快照

| 阶段 | 检测项 | 方法 | 结构 |
|------|--------|------|------|
| 中间体 | 2.3 含量 | `UV-甘草酸二铵含量` | 称重 `referenceWeighing` 14 字段；测定与计算 `uvReference` 17 字段 |
| 待包装品 | 2.3 溶出度 | `溶出度-甘草酸二铵UV` | `dissolutionAssay` 29 字段 |
| 待包装品 | 2.4 含量 | `UV-甘草酸二铵含量` | 称重 `referenceWeighing` 14 字段；测定与计算 `uvReference` 17 字段 |
| 成品 | 2.4 溶出度 | `溶出度-甘草酸二铵UV` | `dissolutionAssay` 29 字段；操作方法注明引用待包装品 2.3.4 |
| 成品 | 2.5 含量 | `UV-甘草酸二铵含量` | 称重 `referenceWeighing` 14 字段；测定与计算 `uvReference` 17 字段；操作方法注明引用待包装品 2.4.4 |

## 业务抽查重点

- 对照品是否均为烟酰胺对照品。
- 样品波长 252nm±2nm、对照波长 261nm±2nm 是否符合 MD。
- `UV-甘草酸二铵含量` 的 1.898、25、10、50、平均粒重、样品称重公式是否与纸面记录一致。
- `溶出度-甘草酸二铵UV` 的 1.898 溶出度公式是否与 MD 数据记录表一致。
- 成品含量/溶出度引用待包装品计算过程时，前端是否接受重复录入或后续需要跨阶段引用。
- 输入样例后自动计算、结论、保存、刷新回填是否符合业务预期。

## 验证结果

```bash
python3 scripts/audit_md_quality.py
python3 scripts/audit_coverage.py
python3 scripts/audit_template_coverage.py
python3 scripts/audit_component_mapping.py
python3 scripts/audit_business_readiness.py
```

当前结果：

- MD quality：16/16 no critical issue。
- Coverage：`gaps: []`。
- Template generation：224 tests，`needs_review: 0`。
- Component mapping：当前 checklist 335，0 stub，0 missing。
- Business readiness：甘草酸二铵胶囊 `0 blocker / 0 warning`，项目当前总计 `16 ready / 0 manual check / 0 needs fix / 0 blockers / 0 warnings`。
