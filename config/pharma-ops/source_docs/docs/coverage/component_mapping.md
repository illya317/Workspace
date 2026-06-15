# 16 产品 × 组件映射表

> 自动生成：`python3 scripts/audit_component_mapping.py`
>
> 最后更新：2026-06-12 10:06:42

状态说明：
- ✅ 已实现 — JS 组件有真实实现
- ✅ 通用 — genericFieldsTable 已实现
- ❌ 占位符 — stub 待实现（JS 文件存在但只返回错误框）
- ⚠️ per-product — 有关物质每品种独立文件
- 🔴 缺模板 — `config/record_templates/` 尚无对应 YAML

## 克拉霉素 胶囊 (`clarithromycin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 溶出度 | 溶出度-HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质 | 称重 | relatedSubstances | ⚠️ per-product |
| | | | 色谱 | relatedSubstances | ⚠️ per-product |
| | | | 附加 | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度-HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 别嘌醇片 (`allopurinol`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | UV-BPC中间体含量 | 称重 | productionWeighing | ✅ 已实现 |
| | | | 测定 | uvAbsorbance | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | UV-BPC含量 | 称重 | total20 | ✅ 已实现 |
| | | | 测定 | uvAbsorbance | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质-BPC | 称样 | relatedSubstances | ⚠️ per-product |
| | | | 测定 | relatedSubstances | ⚠️ per-product |
| | | | 计算 | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 含量 | UV-BPC含量 | 称重 | total20 | ✅ 已实现 |
| | | | 测定 | uvAbsorbance | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.8 微生物限度 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 复方芦丁片 (`compound_rutin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | 复方芦丁含量 | 芦丁含量-称重 | genericFieldsTable | ✅ 通用 |
| | | | 芦丁含量-测定与计算 | genericFieldsTable | ✅ 通用 |
| | | | 维生素C含量-称重与滴定 | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | 复方芦丁含量 | 芦丁含量-称重 | genericFieldsTable | ✅ 通用 |
| | | | 芦丁含量-测定与计算 | genericFieldsTable | ✅ 通用 |
| | | | 维生素C含量-称重与滴定 | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | 复方芦丁含量 | 芦丁含量-称重 | genericFieldsTable | ✅ 通用 |
| | | | 芦丁含量-测定与计算 | genericFieldsTable | ✅ 通用 |
| | | | 维生素C含量-称重与滴定 | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-控制菌 | 大肠埃希菌 | microbialControl | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 氢氯噻嗪片 (`hydrochlorothiazide`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质 | 称重 | relatedSubstances | ⚠️ per-product |
| | | | 色谱 | relatedSubstances | ⚠️ per-product |
| | | | 附加 | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.8 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 泮托拉唑钠肠溶片 (`pantoprazole`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 酸中释放度 | 酸中释放度-泮托拉唑UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 释放度 | 释放度-泮托拉唑UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.5 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 有关物质 | 有关物质 | 称重 | relatedSubstances | ⚠️ per-product |
| | | | 色谱 | relatedSubstances | ⚠️ per-product |
| | | | 附加 | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 酸中释放度 | 酸中释放度-泮托拉唑UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 释放度 | 释放度-泮托拉唑UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 耐酸力 | 耐酸力-泮托拉唑UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.8 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.9 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 甘草酸二铵胶囊 (`diammonium_glycyrrhizinate`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | UV-甘草酸二铵含量 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定与计算 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度-甘草酸二铵UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | UV-甘草酸二铵含量 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定与计算 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度-甘草酸二铵UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 含量 | UV-甘草酸二铵含量 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定与计算 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 甲巯咪唑片 (`methimazole`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | 滴定 | — | titrationAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | 滴定 | — | titrationAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | 滴定 | — | titrationAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 盐酸左氧氟沙星胶囊 (`levofloxacin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 溶出度 | 溶出度-左氧氟沙星UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 有关物质 | 有关物质-左氧氟沙星 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 溶出度 | 溶出度-左氧氟沙星UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 微生物限度检查 | 微生物限度-控制菌 | 大肠埃希菌 | microbialControl | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 盐酸特拉唑嗪 胶囊 (`terazosin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度-特拉唑嗪UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质-特拉唑嗪 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 溶出度 | 溶出度-特拉唑嗪UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-控制菌 | 大肠埃希菌 | microbialControl | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 盐酸维拉帕米片 (`verapamil`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度-双波长UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质-维拉帕米 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度-双波长UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 硝酸异山梨酯片 (`isosorbide_dinitrate`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度 | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 螺内酯片 (`spironolactone`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度-螺内酯UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质-螺内酯 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 溶出度 | 溶出度-螺内酯UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.8 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 辛伐他汀片 (`simvastatin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 溶出度 | 溶出度-辛伐他汀HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 含量均匀度 | 含量均匀度 | 称重 | contentUniformity | ✅ 已实现 |
| | | | 色谱 | contentUniformity | ✅ 已实现 |
| | | | 附加 | contentUniformity | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 有关物质 | 有关物质-辛伐他汀 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 溶出度 | 溶出度-辛伐他汀HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 阿奇霉素胶囊 (`azithromycin`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 溶出度 | 溶出度-HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 有关物质 | 有关物质-阿奇霉素 | — | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度-HPLC | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 装量差异 | 装量差异 | — | fillVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 阿替洛尔片 (`atenolol`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 溶出度 | 溶出度-阿替洛尔UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别-BPC | — | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 有关物质 | 有关物质 | 称重 | relatedSubstances | ⚠️ per-product |
| | | | 色谱 | relatedSubstances | ⚠️ per-product |
| | | | 附加 | relatedSubstances | ⚠️ per-product |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 溶出度 | 溶出度-阿替洛尔UV | — | dissolutionAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 含量 | HPLC | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 色谱 | hplcAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.8 微生物限度检查 | 微生物限度-计数法 | 需氧菌 | microbialCount | ✅ 已实现 |
| | | | 霉菌酵母菌 | microbialCount | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

## 鞣酸小檗碱片 (`berberine_tannate`)

| 阶段 | 检测项 | 方法 | section | render_as | 状态 |
|------|--------|------|---------|-----------|------|
| 中间体 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.2 水分 | 水分 | — | moistureAssay | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 中间体 | 2.3 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.2 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.3 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 待包装品 | 2.4 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.1 性状 | 目测 | — | genericFieldsTable | ✅ 通用 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.2 鉴别 | 鉴别 | 化学鉴别 | identification | ✅ 已实现 |
| | | | UV鉴别 | identification | ✅ 已实现 |
| | | | HPLC鉴别 | identification | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.3 脆碎度 | 脆碎度 | — | friability | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.4 重量差异 | 重量差异 | — | weightVariation | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.5 崩解时限 | 崩解时限 | — | disintegration | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.6 含量 | UV-对照法 | 称重 | referenceWeighing | ✅ 已实现 |
| | | | 测定 | uvReference | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |
| 成品 | 2.7 微生物限度检查 | 微生物限度-控制菌 | 大肠埃希菌 | microbialControl | ✅ 已实现 |
| | | | 结论 | conclusion | ✅ 已实现 |

---

## 汇总

| 总section | 已实现(✅) | 通用(✅) | 占位符(❌) | per-product(⚠️) | 缺模板(🔴) |
|-----------|------------|----------|------------|-----------------|-------------|
| 558 | 487 | 50 | 0 | 21 | 0 |

## JS 组件清单

| 组件名 | 文件 | 状态 |
|--------|------|------|
| conclusion | `components/conclusion.js` | ✅ 已实现 |
| contentUniformity | `components/assay/content_uniformity.js` | ✅ 已实现 |
| disintegration | `components/physical/disintegration.js` | ✅ 已实现 |
| dissolutionAssay | `components/assay/dissolution.js` | ✅ 已实现 |
| fillVariation | `components/physical/fill_variation.js` | ✅ 已实现 |
| friability | `components/physical/friability.js` | ✅ 已实现 |
| hplcAssay | `components/assay/hplc.js` | ✅ 已实现 |
| identification | `components/identification/identification.js` | ✅ 已实现 |
| impurityCalc | `components/assay/impurity_calc.js` | ✅ 已实现 |
| impurityWeighing | `components/weighing/impurity.js` | ✅ 已实现 |
| microbialControl | `components/microbial/control.js` | ✅ 已实现 |
| microbialCount | `components/microbial/count.js` | ✅ 已实现 |
| moistureAssay | `components/assay/moisture.js` | ✅ 已实现 |
| parallelNet | `components/weighing/parallel_net.js` | ✅ 已实现 |
| productionWeighing | `components/weighing/production.js` | ✅ 已实现 |
| referenceWeighing | `components/weighing/reference.js` | ✅ 已实现 |
| relatedSubstances | `components/related_substances/index.js` | ✅ 已实现 |
| titrationAssay | `components/assay/titration.js` | ✅ 已实现 |
| total20 | `components/weighing/total20.js` | ✅ 已实现 |
| uvAbsorbance | `components/assay/uv_absorbance.js` | ✅ 已实现 |
| uvReference | `components/assay/uv_reference.js` | ✅ 已实现 |
| weightVariation | `components/physical/weight_variation.js` | ✅ 已实现 |
