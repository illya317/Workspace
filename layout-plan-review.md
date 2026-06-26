# Layout / Visual Debt Review

## 结论

原执行计划不能直接照做：它把 layout、visual、业务页面外观混在一起，并倾向通过 `appearance="toolbar"`、`triggerClassName` 或 min-width 继续把尺寸留在业务层。这会制造新的历史债。

本轮按三类 policy 收敛：

- `intrinsic`：框架随内容变化，例如 Toolbar 筛选、顶部动作区。
- `parentLocked`：父级框架锁定行高、列宽、对齐，例如 DataTable 单元格、纸面/填表字段、固定字段网格。
- `selfLocked`：只留给系统反馈层，例如 Toast、ConfirmModal、ErrorDialog、LoadingOverlay。

字体、字号、字重、行高、垂直居中等内容要素不单独分 `sm/md/lg`，默认跟随引用主体。

页面级全局组件例外：Toolbar、TabBar、WorkspaceSplitPage 侧栏、PanelCard 页面壳等定义页面结构，使用自身稳定规格；引用方只能选 Core 暴露的语义档位，不得手写尺寸覆盖。

## 需要修正的计划点

- 不应扩大 `appearance="toolbar"` 的用途；它只属于 Toolbar 语义。
- 不应保留 `triggerClassName` 作为业务逃生口。
- `w-full`、`min-w-*`、`px/py` 从字段上删除后，必须由父级 context 或 Core semantic prop 接管。
- visual 只能通过语义状态表达，例如 `visualVariant="info"`、`state="error"`、`fontRole="mono"`、`textAlign="right"`。
- DataTable 这类父级锁定场景应提供字段 context，业务列渲染不再手写字段尺寸。
- foundation / private impl 不作为页面 API 暴露，不为清债随意注册。

## 当前处理状态

- 业务侧 field layout debt 扫描已清零。
- Core 字段控件增加了最小语义 props 和私有 field context。
- 桌面分类表已按 policy / debtKind 重写：`/Users/koito/Desktop/计划/82-debt-constraint-table.md`。
- Core UI guard 授权说明已写入：`/Users/koito/Desktop/UI/core-ui-change-request.md`。
