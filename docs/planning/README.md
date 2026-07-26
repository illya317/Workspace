# Planning Policy

源码中的本目录只保留规划治理原则，不保存项目进度、已完成清单、业务决策流水、待办台账或租户事实。

- 当前任务计划和过程记录写入 Git 忽略的 `.planning/<task>/`。
- 涉及租户业务、生产核验、数据来源或发布回执的计划证据写入 `WORKSPACE_CONFIG_DIR/audit/`。
- 稳定且跨租户适用的工程规则经评审后提炼到 `docs/engineering/*`。
- 稳定的模块边界提炼到模块 `ARCHITECTURE.md` 或 `MODULE.md`，不得附带实施进度或真实业务样例。
- 不把已完成或已过期计划归档回 Git；版本历史不是业务或运维台账。

`long-term/`、`short-term/`、`tracking/` 与 `archive/` 下只允许各自的 README 说明，不允许提交实际计划文件。
