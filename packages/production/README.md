# @workspace/production

生产/QC 业务包边界。当前先承载模块注册，后续生产模块的 UI、server、types、constants、import 按目录逐步迁入。

```txt
ui/        # 生产页面组件和 hooks
server/    # 生产查询、QC 配置读取、批次校验和 DTO 组装
types/     # 生产 DTO 和领域类型
constants/ # 生产选项、阶段常量和非业务事实常量
import/    # 生产导入解析、清洗和校验流程
```

已迁入：

- `ui/qc/`：生产 QC 批次、阶段、检测记录和纸面布局 UI；旧 `app/production/qc/components` 已迁入生产业务包，route 只负责鉴权/预取/挂载。
- `types/qc/types.ts`：生产 QC 布局、批次等领域类型。
- `server/qc/`：生产 QC 配置读取、批次记录渲染和批次台账服务；旧 `server/services/production/qc` 已收口到生产业务包。

旧库存入口和 Production 检验模板 L2 已从注册表和 API contract 中移除；当前导航以 QC 批次为主，模板编辑由 `/docs/editor` 承接。
