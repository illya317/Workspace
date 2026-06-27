# QC 开发模式字段速记

这份文档只给 Production/QC 数据生成、模板解析和显示语义任务使用。其他角色不需要默认读取。

## 真源判断

PNG 截图只是线索，可能被 DOCX 到 PDF 转换、分页、裁剪边界或跨页表格截断、错位、遮挡。看到表格断裂、标题与表格不连续、页眉页脚混入、明显少行少列时，必须回看相邻截图、PDF 原页、MD 和 DOCX 上下文，人工判断真实 `layout_blocks`，不能只按单张 PNG 复刻。

## 字段标记

- `i`: 普通可填字段；没有公式元数据，也不是任何公式的依赖输入。
- `x`: 公式输入字段；它被同一作用域内某个 `method_groups[].fields[]` 的 `formula/rule` 引用，点击对应 `f(x)` 时应高亮。
- `f(x)`: 公式输出字段；通常是 `attr: calculated` 且有 `formula/rule`，或 layout part 明确带 `advancedFormulaText/advancedDependencyFieldKeys`。点击后提示公式和对应 `x`。
- `ref`: 完全引用别的字段值，不是新计算；包括跨阶段复制的 `reference_field_key/value_source`、公式表达式只是某个同作用域字段名、以及同一个 `fieldKey` 的重复只读展示。
- `date`: 日期输入字段。若日期是引用值，开发模式显示 `ref`。
- `data`: 原始数据、图谱、附件类 block，当前主要通过 `attachment_upload`/hidden `data-field-key` 承载，不走 `i/x/f(x)/ref` 的普通字段 badge。
- `check`: checkbox/radio 选择字段。若它同时是引用或公式依赖，按引用/公式优先显示。
- `param`: 静态参数文本或预置参数，不参与填写和计算。

同一个 part 理论上可能同时命中多种语义，显示优先级固定为 `ref > f(x) > x > i`；checkbox/radio/date 是输入类型的显示标签，仍服从引用和公式优先级。

## JSON / layout 规则

- 表格必须保留 `layout_blocks` 结构，不能把 MD 表格退化成段落文本。
- 计算结果格使用稳定 `fieldKey` + `readonlyDisplay: true`。
- 同一 test 的 `method_groups` 中要提供同名 `attr: calculated` 字段和公式。
- 普通输入使用同一组公式可引用的稳定 `fieldKey`。
- 只有“值完全相同”才复用同一 `fieldKey` 或写 `reference_field_key/value_source`。
