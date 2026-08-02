---
name: workspace-role-router
description: Select the primary Workspace delivery role before repository work begins. Use at the start of every Workspace planning, investigation, implementation, data, architecture, operations, hygiene, or review task, then load exactly one matching workspace role skill before deep source exploration.
---

# Workspace Role Router

先确定角色，再读源码、改文件或运行检查。不要仅因角色选择而追问用户；能从任务范围判断时自行选择并继续。

## 选择顺序

1. 先服从当前 system、宿主项目入口、权限和 collaboration mode；本 skill 不覆盖更高层指令。
2. 确认工作环境和权威目录，运行根 `AGENTS.md` 指定的只读状态检查。
3. 从下表选择一个主角色。只有跨职责任务才列辅助角色；辅助角色不替代主角色 skill。
4. 读取 router 后的第一条角色声明更新应写明：`环境: <...> / 主角色: <...> / 辅助角色: <...或无> / 将读取: <专题文档>`；此前可以只报告正在确认环境。
5. 完整读取主角色 skill，再读 `docs/engineering/project-overview.md`、对应模块 `ARCHITECTURE.md` 和任务命中的专题文档。
6. 若检查后发现主职责判断错误，明确切换角色并读取新的 skill；不要同时混用多个角色边界。

## 角色路由

| 任务主体 | 主角色 | 必须加载 |
|---|---|---|
| 规划、拆包、多 agent、跨模块依赖、冲突处理、集成收口 | Coordinator | `.agents/skills/workspace-coordinator/SKILL.md` |
| 用户可见业务功能、UI、表单、页面/API 壳、业务 service、普通 bug | Feature | `.agents/skills/workspace-feature/SKILL.md` |
| Core/Platform/Apps 边界、registry、RBAC/API contract、gate、共享 contract | Architecture | `.agents/skills/workspace-architecture/SKILL.md` |
| schema、migration、seed、导入/导出、数据发布、生成数据或生成物 | Data | `.agents/skills/workspace-data/SKILL.md` |
| CI、构建、环境、开发运行态、部署、发布、生产诊断、运维脚本 | Operations | `.agents/skills/workspace-operations/SKILL.md` |
| 历史债、baseline、重复实现、stale 引用、硬编码或规则漏洞巡检 | Hygiene | `.agents/skills/workspace-hygiene/SKILL.md` |
| 完成后的独立 diff、边界、回归、验证和交付风险审查 | Review | `.agents/skills/workspace-review/SKILL.md` |

## 冲突规则

- 同一任务命中多个角色且需要协调依赖时，主角色选 Coordinator，其余作为执行或咨询角色。
- 普通业务任务默认 Feature；不要因为触及共享文件就自动升级为 Architecture，除非任务改变公开 contract 或治理规则。
- Review 必须独立。实现者或集成者可以自检，但不能以 Review 角色为自己的改动背书。
- 用户只要求分析、诊断或 review 时，不把它扩成实现；用户要求 change/build 时才执行变更。
