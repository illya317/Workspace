# @workspace/production

生产/QC 业务包边界。当前先承载模块注册，后续生产模块的 UI、server、types、constants、import 按目录逐步迁入。

```txt
ui/        # 生产页面组件和 hooks
server/    # 生产查询、检验模板、批次校验和 DTO 组装
types/     # 生产 DTO 和领域类型
constants/ # 生产选项、阶段常量和非业务事实常量
import/    # 生产导入解析、清洗和校验流程
```

已迁入：

- `types/qc/types.ts`：生产 QC 模板、布局、批次等领域类型。
- `types/qc/feedback.ts`：QC 模板反馈上下文、反馈项和解决状态类型。
- `server/qc/`：生产 QC 配置读取、模板缓存、批次台账和模板反馈服务；旧 `server/services/production/qc` 已收口到生产业务包。

资源注册中保留 `production.inventory` 作为历史权限兼容项；当前导航仍以 QC 批次和检验模板为主。
