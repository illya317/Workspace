# Record Structure Contract — 检验记录统一结构契约

> Version: 1.0
> Scope: record engine / API / frontend (form_engine.js)
> Authoritative source: `src/pharma_ops/records/engine/product_builder.py` → `get_product_structure(product_key)`

---

## 1. 顶层对象

```json
{
  "product_key": "allopurinol",
  "product_name": "别嘌醇片",
  "stages": [...],
  "global_fields": [...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `product_key` | string | URL-safe 标识，等于 `*.yaml` 文件名（不含扩展名） |
| `product_name` | string | 中文产品名称，来自 `record_templates/*.yaml` 的 `产品名称` |
| `stages` | array | 阶段列表，按 YAML 中定义顺序排列 |
| `global_fields` | array | 全局字段（批号、检验者/日期、复核者/日期等） |

---

## 2. Stage（阶段）

```json
{
  "stage_key": "intermediate",
  "display_name": "中间体",
  "pre_check": { ... },
  "tests": [...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `stage_key` | string | 机器标识：`intermediate` / `packaging` / `finished` |
| `display_name` | string | 展示名：中间体 / 待包装品 / 成品 |
| `pre_check` | object? | 检验前确认信息（文件清单、确认项、环境确认等），可为 `null` |
| `tests` | array | 该阶段下的检测项列表 |

**Naming rule:** 后端、API、前端统一使用 `stages` / `tests`。禁止再使用 `parts` / `items`。

---

## 3. Test（检测项）

```json
{
  "test_seq": "2.1",
  "test_name": "性状",
  "test_name_en": "appearance",
  "method": "目测",
  "operation": "取本品置于光线充足的地方，目测，本品为____。",
  "standard": "内控标准：本品应为白色颗粒。",
  "cleanup": ["将检验用具及废弃物分类。", "关闭电源。"],
  "conclusion": { ... },
  "render_as": null,
  "sections": [...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `test_seq` | string | 序号，如 `"2.1"`、`"2.2"` |
| `test_name` | string | 中文检测项名称 |
| `test_name_en` | string | 英文标识，URL-safe，来自 YAML 的 `英文名` |
| `method` | string? | 引用的方法名（如 `"目测"`、`"UV-BPC含量"`），可为 `null` |
| `operation` | string? | 操作方法文本，可为 `null` |
| `standard` | string? | 标准规定文本，可为 `null` |
| `cleanup` | array<string> | 清场 checklist，可为空数组 |
| `conclusion` | object | 结论配置，见下方 |
| `render_as` | string? | 特殊渲染标记，如 `"independent_template"`，可为 `null` |
| `sections` | array | 方法解析后的字段分组，见下方 |

**Naming rule:** 统一使用 `tests` 表示检测项。禁止再使用 `items` / `methods`（当指检测项时）。

---

## 4. Conclusion（结论判定）

```json
{
  "name": "性状",
  "has_value": false,
  "judgment": null
}
```

或含数值判定：

```json
{
  "name": "水分",
  "has_value": true,
  "judgment": {
    "value_field": "平均水分",
    "unit": "%",
    "rule": "平均水分 <= 5.0 && RD <= 2.0"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 结论名称 |
| `has_value` | boolean | 结论是否含数值 |
| `judgment` | object? | 判定规则，仅当 `has_value=true` 时存在 |
| `judgment.value_field` | string | 用于结论的数值字段名（中文） |
| `judgment.unit` | string? | 数值单位 |
| `judgment.rule` | string? | 判定公式/规则文本，供前端或后端解析 |

---

## 5. Section（字段分组）

```json
{
  "section_name": "称重",
  "fields": [...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `section_name` | string | 分组名，如 `"称重"`、`"测定"`、`"色谱"`。空字符串表示无分组 |
| `fields` | array | 该分组下的字段列表 |

**Naming rule:** 统一使用 `section_name`。禁止再使用 `section`（单字 key）。

---

## 6. Field（字段）

```json
{
  "field_key": "intermediate/appearance/s0/外观描述",
  "name": "外观描述",
  "type": "text",
  "attr": "fillable",
  "unit": null,
  "default": null,
  "formula": null,
  "rule": null,
  "options": null,
  "note": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `field_key` | string | **唯一标识**，见下方生成规则 |
| `name` | string | 字段显示名（中文），公式中以此名引用 |
| `type` | string | `text` / `number` / `select` / `checkbox` / `date` |
| `attr` | string | `fillable`（人工填写） / `prefilled`（预填充） / `calculated`（自动计算） |
| `unit` | string? | 单位，如 `"g"`、`"%"`、`"ml"` |
| `default` | any | 默认值（仅 `prefilled`） |
| `formula` | string? | 计算公式（仅 `calculated`），使用中文 `name` 作为变量 |
| `rule` | string? | 判定规则公式（仅 `calculated`），返回布尔值 |
| `options` | array<string>? | 下拉选项（仅 `select` / `checkbox`） |
| `note` | string? | 备注说明 |

### 6.1 field_key 生成规则

格式：

```
{stage_key}/{test_name_en}/s{section_idx}/{field_name}
```

- `stage_key`: 阶段机器标识
- `test_name_en`: 检测项英文名
- `section_idx`: 该检测项内 section 的零基索引
- `field_name`: 字段 `name`，含 `{序号}` 的已展开为实际数字

**示例：**

| 字段 | field_key |
|------|-----------|
| 中间体-性状-外观描述 | `intermediate/appearance/s0/外观描述` |
| 中间体-水分-称样1 | `intermediate/moisture/s0/称样1` |
| 中间体-含量-样1-净重 | `intermediate/content/s0/样1-净重` |
| 中间体-含量-样1-含量 | `intermediate/content/s1/样1-含量` |

**注意：**
- `field_key` 由 `product_builder.py` 在组装时注入，前端不再自行拼接 path。
- 公式计算仍以 `name`（中文）作为变量名，`form_engine.js` 通过 `field_key` 前缀匹配确定同 scope 字段。

---

## 7. Global / Autofill 字段

```json
[
  {"key": "batch_number",   "label": "批号",       "type": "text"},
  {"key": "inspector",      "label": "检验者",     "type": "text"},
  {"key": "inspector_date", "label": "检验日期",   "type": "date"},
  {"key": "reviewer",       "label": "复核者",     "type": "text"},
  {"key": "reviewer_date",  "label": "复核日期",   "type": "date"}
]
```

全局字段独立于 `stages`，在数据库 `BatchRecord` 表中存储。

---

## 8. Calculated 字段

### 8.1 公式字段
- `attr: "calculated"`
- `formula`: 数学表达式，使用同 scope 字段的 `name` 作为变量
- 支持函数：`ABS()`、`ROUND()`、`SQRT()`、`ALL()`
- 运算符：`+`、`-`、`*`、`/`、`^`、`<=`、`>=`、`==`、`&&`、`||`

### 8.2 规则字段（结论判定）
- `attr: "calculated"`
- `rule`: 布尔表达式
- 结果映射：`true` → `options[0]`（默认 `"符合"`），`false` → `options[1]`（默认 `"不符合"`）

---

## 9. Repeat 表格

Repeat 在 `method_resolver.py` 中已展开为平铺字段，因此契约层看不到 `repeat` 对象，只看到展开后的多个 `field`。

展开示例（`崩解时限` 方法中的 `repeat: count: 6`）：

```json
{"field_key": ".../s0/片1-崩解时间", "name": "片1-崩解时间", ...},
{"field_key": ".../s0/片1-结果",     "name": "片1-结果",     ...},
{"field_key": ".../s0/片2-崩解时间", "name": "片2-崩解时间", ...},
{"field_key": ".../s0/片2-结果",     "name": "片2-结果",     ...},
...
```

---

## 10. 兼容性说明

### 10.1 页面渲染层
- `src/pharma_ops/web/record_helpers.py` 中的 `load_record_template()` 返回原始 YAML（中文 key），供 Jinja2 模板使用。
- `src/pharma_ops/web/routes_records.py` 使用 `get_product_structure()` 返回本契约结构，供 API 和 `form_engine.js` 使用。
- 两套结构并行存在，页面渲染不依赖契约结构，因此现有页面不受影响。

### 10.2 旧 `product_engine.py`
- `product_engine.py` 基于旧 `products.yaml` + `template_fields.yaml`，已过时。
- 新代码不再引用 `product_engine.py`。
- 文件已归档到 `archive/engine_legacy/20260611/product_engine.py`，主线不得重新 import。

### 10.3 `form_engine.js`
- 已统一为读取 `structure.stages` / `stage.tests` / `test.sections` / `section.fields` / `field.field_key`。
- 不再使用 `structure.parts` / `part.items`。

---

## 11. API

### GET `/api/record-structure/<product_key>`

返回完整契约 JSON。

**示例：** `/api/record-structure/allopurinol`

返回结构见上方各节。

---

## 12. 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-06-11 | 1.0 | 初版：统一 `stages` / `tests` / `sections` / `fields`，引入 `field_key`，废弃 `parts` / `items` |
