# Allopurinol（别嘌醇片）P6 基线验收报告

> 验收日期：2026-06-11 | 状态：✅ PASS

## 1. UI Readiness: 0 stub ✅

## 2. Data Readiness

### 模板

| 项目 | `allopurinol.yaml` |
|---|---|
| 行数 | 626 |
| 阶段 | 3 |
| 检测项 | 15 |
| needs_review | **0** ✅ |

自动生成草稿不再放入 `config/record_templates/`；运行 `scripts/md_to_record_template.py` 时，已存在的正式模板会写入外置 `workspace/drafts/record_templates/` 作为对照。

### 方法公式

| 方法 | 字段 | formula | 评价 |
|------|-----|---------|------|
| UV-BPC中间体含量 | 27 | 10 | ✅ |
| UV-BPC含量 | 22 | 9 | ✅ |
| 溶出度 | 15 | 3 | ✅ |
| 重量差异 | 8 | 3 | ✅ |
| 微生物限度-计数法 | 17 | 4 | ✅ |
| 其他(鉴别/水分/目测/崩解) | 12+2+1+5 | 0 | ✅ |

## 3. 路由: 全 200 ✅

`/record/allopurinol` `/intermediate` `/packaging` `/finished` `/api/record-structure/allopurinol`

## 4. 数据链路: 端到端 ✅

```
POST /batch/create (batch=P6-BASELINE-001) → 302 → batch_id=2
POST /batch/save {水分1:"3.20", 水分2:"3.40"} → 200
GET /api/batch/2/data → product=别嘌醇片, 水分1=3.20, 水分2=3.40
```

## 5. 综合判定

| 维度 | 状态 |
|------|------|
| ui_ready | ✅ true (0 stub) |
| data_review_needed | ✅ false (0 nr) |
| md_gaps | 0 |
| route_ok | ✅ 6/6 |
| formula_status | ✅ ok |
| conclusion_status | ✅ ok |
| save_load_ok | ✅ verified |
| **acceptance_ready** | **✅ YES** |

## 6. 2026-06-12 回归补充

| 项目 | 结果 |
|------|------|
| business readiness | 0 blocker / 0 warning |
| 本轮清理 | 待包装品 2.3 溶出度、成品 2.4 溶出度、成品 2.7 含量操作方法中的数据区提示 |
| 保持不变 | 方法、字段、公式、结论判定、保存回填基线 |

本轮只移除了操作方法尾部的“测定与计算 / 结果记录 / RD应≤2.0%”等数据区残留。溶出度和含量的字段仍由 `溶出度`、`UV-BPC含量` 方法模板生成。
