# 左右分列展示优先级

所有左右分列页面在移动端和窄视口必须优先展示右侧主内容。左侧列表、目录、selector、筛选树和导航列只是辅助定位区，不能压在主内容之前。

## 固定规则

- `PageSurface kind="split"` / `SplitWorkspace`：右侧主内容是页面主体；左侧只能通过桌面侧栏或移动端抽屉出现。
- `PageSurface` 的 `surfaceGroup` + `layout: "grid"`：第一个 block 视为左侧辅助列，Core 渲染器会在移动端自动排到最后。
- `TemplateWorkbenchFrame`：左侧 selector 在移动端固定排到右侧内容之后。
- 页面风格预览模板只允许使用 `RightPrioritySplit` 这一种左右分列模板；不要再新增第二套 split 模板。
- 少数必须手写的左右分列，左侧容器必须显式带 `max-lg:order-last`，桌面列宽保持原布局。

## 禁止

- 禁止新增移动端左侧优先的左右分列页面。
- 禁止业务页绕过 `PageSurface` / `SplitWorkspace` / `TemplateWorkbenchFrame` 自己拼左侧优先 selector。
- 禁止新增额外左右分列模板来改变优先级。

`npm run arch:gate` 会运行 `split-priority` 检查；命中左侧优先手写分列会直接失败。
