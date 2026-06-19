# Reports 工作汇报模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 工作汇报 | `/reports` | `app/reports/page.tsx` |

## 页面结构

Reports 页面包含周报列表和编辑器：

| 组件 | 说明 |
|------|------|
| ReportEditor | 周报编辑器（富文本/自动调整大小） |
| WorkSection | 工作事项展示区 |
| AutoResizeTextarea | 自适应高度文本输入 |

## 核心组件链

```
page.tsx
  ├─ useReportAuth.ts      — 汇报权限/目标对象校验
  ├─ useReportLoader.ts    — 周报数据加载
  ├─ useReportPeriod.ts    — 周期计算
  └─ ReportEditor.tsx
       ├─ WorkSection.tsx
       └─ AutoResizeTextarea.tsx
```

## 数据流

1. **useReportPeriod.ts** 计算当前汇报周期（基于 `@workspace/core/period`）
2. **useReportLoader.ts** 加载当前周期已提交的周报（含版本历史）
3. **useReportAuth.ts** 校验用户能否向目标对象提交汇报
4. **API** `app/api/reports/` 提供 CRUD 和版本查询

## API 规范

| 端点 | 说明 |
|------|------|
| `GET /api/reports` | 周报列表 |
| `POST /api/reports` | 提交周报 |
| `PUT /api/reports/[id]` | 更新周报 |
| `GET /api/reports/[id]/versions` | 查看版本历史 |
| `GET /api/reports/[id]/versions/[version]` | 查看指定版本 |
| `GET /api/week-info` | 当前周期信息 |
| `GET /api/my-targets` | 我的汇报对象 |

## 权限标准

- 登录即可查看和提交自己的周报
- 只能向自己的汇报对象（my-targets）提交周报
- 历史版本仅自己和汇报对象可见

汇报周期由 `@workspace/core/period` 统一管理，支持周/月/季度等多种周期类型。
