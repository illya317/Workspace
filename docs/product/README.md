# Product And User Docs

这里放给最终用户、业务使用者或业务资料维护者看的文档。它和 agent / engineering 规范分开维护。

## 放置规则

| 内容 | 位置 | Owner |
|---|---|---|
| 线上文档中心页面 | `app/(docs)/docs/*` | Feature |
| 用户操作流程、制度、说明 | `docs/product/*` 或产品页面 | Feature |
| 业务参考资料和外部资料来源 | `docs/product/reference/*` | 对应业务 Feature / Data |
| 教育、会计准则等数据来源说明 | `docs/product/reference/*` | Data |

## 当前资料

- `reference/education-data.md`：教育学校/专业/QS 数据源说明。
- `reference/casc/`：财务报表列报和会计准则参考资料。

不要把 agent 开工规则、架构 gate、CI、RBAC 或 Core UI 规范放在本目录。
