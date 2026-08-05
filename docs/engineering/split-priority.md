# 左右分列展示优先级

左右分列在桌面端可以并列，在移动端必须改成渐进流程。用于选择业务对象的左侧列表先占满屏幕；选择一次后进入右侧详情，详情提供明确的返回列表动作。非导航型的手写双列内容仍应优先展示主内容，不能把辅助说明压在正文之前。

## 固定规则

- `BodySurface split` / `SplitWorkspace`：桌面并列；移动端先展示左侧列表，选择后全屏进入右侧详情并可返回。
- `PageSurface` 的 `surfaceGroup` + `layout: "grid"`：第一个 block 视为左侧辅助列，Core 渲染器会在移动端自动排到最后。
- 页面风格预览模板只允许使用 `RightPrioritySplit` 这一种左右分列模板；不要再新增第二套 split 模板。
- 少数必须手写的左右分列，左侧容器必须显式带 `max-lg:order-last`，桌面列宽保持原布局。

## 禁止

- 禁止业务手写两栏响应式顺序；需要列表到详情时统一使用 `SplitWorkspace`。
- 禁止业务页绕过 `PageSurface` / `BodySurface split` / `SplitWorkspace` 自己拼左侧优先 selector。
- 禁止新增额外左右分列模板来改变优先级。

`npm run arch:gate` 会运行 `split-priority` 检查；命中绕过 Core 的手写辅助列会直接失败。
