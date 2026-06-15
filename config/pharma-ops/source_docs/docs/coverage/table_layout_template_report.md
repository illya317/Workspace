# Table Layout Template Report

> 自动生成：`python3 scripts/audit_layout_template_report.py`
> 当前覆盖口径：MD/YAML 真源；旧 `config/table_layouts/products/**/*.json` 只作为 legacy/reference 样本。

## 汇总

- 当前 YAML 项目入口: 225
- legacy products/**/*.json reference: 224
- legacy loose JSON samples: 2
- template JSON: 108
- 已映射到模板: 225
- 待补模板: 0
- 归类族: 16
- YAML 方法结构 cluster: 52

## 模板

| template_id | Level | 类别 | order | 子组件 | 原文编号 | 使用数 | 状态 |
|---|---:|---|---:|---:|---|---:|---|
| `calculation/content_uniformity_10_sample` | L4 | calculation | 150 | True |  | 12 | pilot |
| `calculation/friability_three_runs` | L3 | calculation | 50 | True |  | 8 | pilot |
| `calculation/hplc_impurity_multi_component_calculation` | L4 | calculation | 160 | True |  | 1 | pilot |
| `calculation/hplc_related_substances_peak_area_calculation` | L4 | calculation | 155 | True |  | 10 | pilot |
| `common/abnormal_handling` | L3 | common | 220 | True |  | 225 | pilot |
| `common/cleanup_checklist` | L3 | common | 230 | True |  | 183 | pilot |
| `common/conclusion` | L3 | conclusion | 199 | True |  | 225 | pilot |
| `common/environment_table` | L3 | common | 100 | True |  | 225 | pilot |
| `common/equipment_table` | L3 | common | 110 | True |  | 167 | pilot |
| `common/materials_table` | L3 | common | 120 | True |  | 106 | pilot |
| `common/post_method` | L3 | common | 170 | True |  | 225 | pilot |
| `common/project_header_dates` | L3 | common | 1 | True |  | 209 | pilot |
| `common/raw_data_attachments` | L3 | common | 200 | True |  | 58 | pilot |
| `common/reference_standard_table` | L3 | common | 130 | True |  | 86 | pilot |
| `common/standard_text` | L3 | common | 210 | True |  | 225 | pilot |
| `measurement/hplc_0512_linear_gradient_table` | L3 | measurement | 137 | True |  | 5 | pilot |
| `measurement/hplc_impurity_system_suitability_peak_area` | L4 | measurement | 150 | True |  | 1 | pilot |
| `measurement/hplc_reference_sample_calculation` | L4 | measurement | 150 | True | 2.3.5.2 | 56 | pilot |
| `microbiology/aerobic_count_observation` | L4 | microbiology | 182 | True |  | 16 | pilot |
| `microbiology/cleanroom_exit` | L3 | microbiology | 240 | True |  | 16 | pilot |
| `microbiology/detection_limit_test` | L3 | microbiology | 149 | True |  | 16 | pilot |
| `microbiology/equipment_limit_test` | L3 | microbiology | 40 | True |  | 16 | pilot |
| `microbiology/escherichia_coli_observation` | L5 | microbiology | 171 | True |  | 16 | pilot |
| `microbiology/escherichia_coli_procedure` | L5 | microbiology | 150 | True |  | 16 | pilot |
| `microbiology/escherichia_coli_test` | L4 | microbiology | 150 | True |  | 16 | pilot |
| `microbiology/materials_limit_test` | L3 | microbiology | 140 | True |  | 16 | pilot |
| `microbiology/microbial_count_observation_results` | L4 | microbiology | 180 | True |  | 16 | pilot |
| `microbiology/microbial_count_procedure` | L5 | microbiology | 177 | True |  | 16 | pilot |
| `microbiology/microbial_count_process_membrane_filter` | L4 | microbiology | 177 | True |  | 1 | pilot |
| `microbiology/microbial_count_process_membrane_filter_manganese` | L4 | microbiology | 177 | True |  | 1 | pilot |
| `microbiology/microbial_count_process_pour_plate` | L5 | microbiology | 175 | True |  | 14 | pilot |
| `microbiology/microbial_count_test` | L4 | microbiology | 175 | True |  | 16 | pilot |
| `microbiology/mold_yeast_count_observation` | L4 | microbiology | 192 | True |  | 16 | pilot |
| `microbiology/pre_test_confirmations` | L3 | microbiology | 130 | True |  | 16 | pilot |
| `microbiology/project_header` | L3 | microbiology | 1 | True |  | 16 | pilot |
| `microbiology/reference_strain_table` | L3 | microbiology | 145 | True |  | 16 | pilot |
| `operation/acid_release_uv_cross_reference_method_text` | L3 | operation | 39 | False |  | 1 | pilot |
| `operation/acid_release_uv_method_text` | L3 | operation | 35 | False |  | 1 | pilot |
| `operation/acid_resistance_uv_method_text` | L3 | operation | 35 | False |  | 1 | pilot |
| `operation/appearance_operation` | L3 | operation | 110 | True |  | 42 | pilot |
| `operation/appearance_visual_method_text` | L3 | operation | 35 | False |  | 42 | pilot |
| `operation/buffer_release_uv_cross_reference_method_text` | L3 | operation | 40 | False |  | 1 | pilot |
| `operation/buffer_release_uv_method_text` | L3 | operation | 35 | False |  | 1 | pilot |
| `operation/capsule_fill_variation_20_method_text` | L3 | operation | 37 | False |  | 6 | pilot |
| `operation/capsule_weight_variation_20_method_text` | L3 | operation | 36 | False |  | 2 | pilot |
| `operation/content_uniformity_hplc_operation` | L3 | operation | 135 | True |  | 12 | pilot |
| `operation/disintegration_method_text` | L3 | operation | 35 | False |  | 6 | pilot |
| `operation/disintegration_operation` | L3 | operation | 130 | True |  | 6 | pilot |
| `operation/dissolution_hplc_0931_0512_method_text` | L3 | operation | 35 | False |  | 7 | pilot |
| `operation/dissolution_hplc_cross_reference_0931_0512_method_text` | L3 | operation | 38 | False |  | 1 | pilot |
| `operation/dissolution_operation` | L3 | operation | 135 | True |  | 29 | pilot |
| `operation/dissolution_uv_0931_0401_method_text` | L3 | operation | 35 | False |  | 9 | pilot |
| `operation/dissolution_uv_cross_reference_0931_0401_method_text` | L3 | operation | 37 | False |  | 6 | pilot |
| `operation/dissolution_uv_sample_only_0931_0401_method_text` | L3 | operation | 36 | False |  | 1 | pilot |
| `operation/friability_0923_method_text` | L3 | operation | 130 | True |  | 8 | pilot |
| `operation/friability_operation` | L3 | operation | 40 | True |  | 8 | pilot |
| `operation/hplc_content_0512_method_text` | L3 | operation | 35 | False |  | 7 | pilot |
| `operation/hplc_content_cross_reference_0512_method_text` | L3 | operation | 38 | False |  | 2 | pilot |
| `operation/hplc_content_full_solution_prep_0512_method_text` | L3 | operation | 36 | False |  | 14 | pilot |
| `operation/hplc_content_operation` | L3 | operation | 135 | True |  | 48 | pilot |
| `operation/hplc_content_system_solution_prep_0512_method_text` | L3 | operation | 37 | False |  | 7 | pilot |
| `operation/hplc_content_uniformity_0512_method_text` | L3 | operation | 35 | False |  | 5 | pilot |
| `operation/hplc_content_uniformity_reference_assay_method_text` | L3 | operation | 36 | False |  | 5 | pilot |
| `operation/hplc_related_substances_0512_method_text` | L3 | operation | 35 | False |  | 1 | pilot |
| `operation/hplc_related_substances_full_gradient_0512_method_text` | L3 | operation | 35 | False |  | 5 | pilot |
| `operation/hplc_related_substances_multi_impurity_gradient_0512_method_text` | L3 | operation | 35 | False |  | 1 | pilot |
| `operation/hplc_related_substances_solution_prep_0512_method_text` | L3 | operation | 35 | False |  | 4 | pilot |
| `operation/identification_chemical_reaction_method_text` | L3 | operation | 39 | False |  | 2 | pilot |
| `operation/identification_hplc_prep_method_text` | L3 | operation | 40 | False |  | 2 | pilot |
| `operation/identification_operation` | L3 | operation | 135 | True |  | 16 | pilot |
| `operation/identification_retention_time_method_text` | L3 | operation | 36 | False |  | 4 | pilot |
| `operation/identification_tlc_method_text` | L3 | operation | 37 | False |  | 1 | pilot |
| `operation/identification_uv_ir_method_text` | L3 | operation | 38 | False |  | 7 | pilot |
| `operation/moisture_rapid_analyzer_method_text` | L3 | operation | 35 | False |  | 17 | pilot |
| `operation/moisture_two_sample_operation` | L3 | operation | 140 | True |  | 17 | pilot |
| `operation/pre_method_friability` | L3 | operation | 1 | True |  | 8 | pilot |
| `operation/pre_method_microbiology_limit` | L3 | microbiology | 1 | True |  | 16 | pilot |
| `operation/pre_method_standard` | L3 | operation | 1 | True |  | 201 | pilot |
| `operation/related_substances_hplc_operation` | L3 | operation | 135 | True |  | 11 | pilot |
| `operation/titration_content_method_text` | L3 | operation | 35 | False |  | 3 | pilot |
| `operation/uv_content_0401_method_text` | L3 | operation | 35 | False |  | 12 | pilot |
| `operation/uv_content_uniformity_0401_method_text` | L3 | operation | 37 | False |  | 2 | pilot |
| `operation/uv_titration_compound_content_method_text` | L3 | operation | 35 | False |  | 3 | pilot |
| `operation/variation_20_operation` | L3 | operation | 130 | True |  | 20 | pilot |
| `operation/weight_variation_20_method_text` | L3 | operation | 35 | False |  | 12 | pilot |
| `parents/appearance_basic` | L2 | visual | 10 | False |  | 42 | pilot |
| `parents/content_uniformity_hplc_full` | L2 | assay | 70 | False |  | 12 | pilot |
| `parents/disintegration_full` | L2 | physical | 100 | False |  | 6 | pilot |
| `parents/dissolution_full` | L2 | assay | 60 | False |  | 29 | pilot |
| `parents/experiment_projects_full` | L1 | overview | 2 | False | 2 | 0 | pilot |
| `parents/friability_full` | L2 | physical | 90 | False |  | 8 | pilot |
| `parents/general_review_full` | L2 | general | 900 | False |  | 0 | needs_review |
| `parents/hplc_content_full` | L2 | assay | 40 | False |  | 48 | pilot |
| `parents/identification_full` | L2 | identification | 20 | False |  | 16 | pilot |
| `parents/microbiology_limit_full` | L2 | microbiology | 990 | False |  | 16 | pilot |
| `parents/moisture_two_sample_full` | L2 | weighing | 30 | False |  | 17 | pilot |
| `parents/related_substances_hplc_full` | L2 | assay | 50 | False |  | 11 | pilot |
| `parents/variation_20_full` | L2 | weighing | 80 | False |  | 20 | pilot |
| `weighing/fill_variation_20_capsule_table` | L3 | weighing | 78 | True |  | 3 | pilot |
| `weighing/hplc_impurity_multi_reference_sample_weighing` | L4 | weighing | 140 | True |  | 1 | pilot |
| `weighing/hplc_reference_sample_20_tablets` | L4 | weighing | 140 | True | 2.4.5.1 | 1 | pilot |
| `weighing/hplc_reference_sample_theoretical` | L4 | weighing | 140 | True | 2.3.5.1 | 32 | pilot |
| `weighing/hplc_related_substances_named_weighing` | L4 | weighing | 140 | True |  | 9 | pilot |
| `weighing/moisture_two_sample` | L3 | weighing | 140 | True | 2.2.3 | 17 | pilot |
| `weighing/uv_absorbance_sample_20_tablets` | L4 | weighing | 42 | True |  | 1 | pilot |
| `weighing/uv_absorbance_sample_theoretical` | L4 | weighing | 41 | True |  | 1 | pilot |
| `weighing/variation_20_capsule_weight_table` | L3 | weighing | 77 | True |  | 1 | pilot |
| `weighing/variation_20_table` | L3 | weighing | 76 | True |  | 6 | pilot |

## 归类族

| family | 数量 | 产品数 | 结构数 | 字段 | 公式 | 规则 | 当前模板 | 代表 layout |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 性状/目测 (`visual.appearance`) | 42 | 14 | 1 | 84 | 0 | 42 | `parents/appearance_basic` | `products/allopurinol/intermediate/appearance` |
| HPLC含量（称重+测定） (`assay.hplc_content_full`) | 30 | 10 | 4 | 840 | 120 | 30 | `parents/hplc_content_full` | `products/atenolol/intermediate/content` |
| 溶出度/UV测定 (`assay.dissolution_uv`) | 23 | 10 | 12 | 636 | 155 | 23 | `parents/dissolution_full` | `products/allopurinol/packaging/dissolution` |
| 水分称样/两平行 (`weighing.moisture_two_sample`) | 17 | 16 | 4 | 119 | 34 | 17 | `parents/moisture_two_sample_full` | `products/allopurinol/intermediate/moisture` |
| 鉴别 (`identification.mixed`) | 16 | 16 | 2 | 168 | 8 | 24 | `parents/identification_full` | `products/allopurinol/finished/identification` |
| 微生物限度 (`microbial.limit`) | 16 | 16 | 2 | 256 | 48 | 16 | `parents/microbiology_limit_full` | `products/allopurinol/finished/microbial_limit` |
| 含量均匀度/HPLC (`assay.content_uniformity_hplc`) | 12 | 6 | 2 | 612 | 48 | 12 | `parents/content_uniformity_hplc_full` | `products/hydrochlorothiazide/packaging/content_uniformity` |
| UV含量 (`assay.uv_content`) | 12 | 4 | 5 | 338 | 118 | 12 | `parents/hplc_content_full` | `products/allopurinol/intermediate/content` |
| 20片重量差异 (`weighing.weight_variation_20`) | 12 | 6 | 1 | 792 | 264 | 252 | `parents/variation_20_full` | `products/allopurinol/packaging/weight_variation` |
| 有关物质/HPLC (`assay.related_substances_hplc`) | 11 | 11 | 9 | 259 | 53 | 13 | `parents/related_substances_hplc_full` | `products/allopurinol/finished/related_substances` |
| 20粒装量差异 (`weighing.fill_variation_20`) | 8 | 4 | 2 | 688 | 168 | 8 | `parents/variation_20_full` | `products/azithromycin/packaging/fill_variation` |
| 脆碎度三次称重 (`weighing.friability_three_runs`) | 8 | 8 | 2 | 136 | 56 | 8 | `parents/friability_full` | `products/allopurinol/finished/friability` |
| 溶出度/HPLC测定 (`assay.dissolution_hplc`) | 6 | 3 | 3 | 168 | 54 | 6 | `parents/dissolution_full` | `products/azithromycin/packaging/dissolution` |
| 崩解时限 (`physical.disintegration`) | 6 | 3 | 1 | 96 | 0 | 6 | `parents/disintegration_full` | `products/berberine_tannate/packaging/disintegration` |
| 滴定含量 (`assay.titration_content`) | 3 | 1 | 1 | 33 | 6 | 3 | `parents/hplc_content_full` | `products/methimazole/intermediate/content` |
| 通用待复核 (`general.review`) | 3 | 1 | 1 | 84 | 12 | 3 | `parents/hplc_content_full` | `products/compound_rutin/intermediate/content` |
