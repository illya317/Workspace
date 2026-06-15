# Table Layout Templates

`products/**/*.json` 是从旧 DOCX 指纹生成的归类/取样参考，不作为长期逐个维护入口。

目标结构是子模板 + 父模板 include：

- `common/`：日期头、实验环境、仪器设备等跨检测项块。
- `operation/`：操作方法、试液、供试品/对照品制备等过程块。
- `weighing/`：称量、装量差异、重量差异等称量块。
- `measurement/`：HPLC、UV、滴定等测定块。
- `calculation/`：计算、结果、结论判定块。
- `microbiology/`：微生物限度专用块。
- `parents/`：按检测项组合 include 的父模板。

迁移候选归类由 `python3 scripts/generate_layout_template_consolidation.py` 生成。
