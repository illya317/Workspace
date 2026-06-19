# 现有模块内新增能力清单

适用场景：不是新增业务模块，而是在已有模块内增加一个新 Tab、子页面、审核流、规则页或 CRUD 能力。

例如：

- `finance/ledger` 下新增“重分类规则”
- `finance/ledger` 下新增“重分类审核”
- `hr` 下新增一个分析页

不适用场景：

- 新增采购、绩效、法务等新 domain
- 新增独立资源树和模块入口

这类任务不要套 `docs/new-module-checklist.md` 的“新模块接入”全流程，按下面的轻量流程执行。

## 1. 先锁边界

- [ ] 说明这次是“现有模块内新增能力”，不是新模块
- [ ] 写清楚本 phase 做什么、不做什么
- [ ] 明确是否只做 UI、只做 service、只做 API，还是三者联动
- [ ] 如有旧逻辑，先说明是复用、并存，还是替换

建议先写一句：

```md
本次仅扩展现有 `<domain>` 业务包能力，不新增模块入口、不新增 domain；`app/<domain>/...` 只作为路由壳。
```

## 2. 数据与规则先行

- [ ] 先确认依赖哪些现有表、现有字段、现有 service
- [ ] 缺字段时才改 schema；不为 UI 临时造字段
- [ ] 规则逻辑放 `packages/<domain>/server/...`
- [ ] 不把复杂判断堆进 page、tab、route

如果是规则/审核/状态机类能力，优先拆成：

- `types.ts`：输入输出契约
- `rules.ts`：纯函数规则
- `index.ts` 或 `service.ts`：查询、聚合、落库

## 3. API 只做四件事

- [ ] 认证
- [ ] 参数校验
- [ ] 调 service
- [ ] 返回 DTO

约束：

- [ ] GET 用 `access`
- [ ] POST/PUT/PATCH 用 `write`
- [ ] DELETE 用 `delete`
- [ ] route 不超过 120 行，超了继续拆 service

如果是现有模块内扩展，优先复用已有 wrapper 和已有资源，不要随手发明新权限模型。

## 4. UI 只负责展示与交互

- [ ] 页面 facade 只组合组件和 hooks
- [ ] Tab 内不要直接堆复杂 fetch、聚合、权限判断
- [ ] 列表页先定筛选项、表格列、操作按钮，再写代码
- [ ] 编辑动作优先 modal，不要默认 inline edit

推荐拆分：

- `*Tab.tsx`：容器
- `*Table.tsx`：表格
- `*Modal.tsx`：编辑/审核弹窗
- `use*.ts`：状态与请求

## 5. 权限先复用，后细化

- [ ] 优先挂到当前模块已有资源，例如 `finance.ledger.access/write`
- [ ] 页面可见性和 API 权限保持一致
- [ ] 不要只做按钮隐藏，API 必须再校验一次
- [ ] 如果暂时不需要新资源，就不要为单个 tab 强行扩资源树

默认策略：

- 查看类：`*.access`
- 提交/审核类：`*.write`
- 删除类：`*.delete`

## 6. 文档只补真正变化的边界

- [ ] 如果只是模块内扩展，优先更新该模块的 `ARCHITECTURE.md`
- [ ] 只在新增独立模块时才走 `docs/new-module-checklist.md`
- [ ] 路由、权限、核心数据流变了才补 README/AGENTS 对应段落

最低要求通常是：

- 新增的 Tab / 子页面
- 新增或复用的 API
- 依赖的数据表/字段
- 权限口径

## 7. 交付前硬检查

```bash
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

如涉及架构/文档/Schema，再补：

```bash
npm run arch:gate
npm run schema:check
```

## 常用模板

### A. 纯 UI/CRUD 扩展

1. 复用现有 GET/PUT/DELETE API
2. 新增一个 Tab + Table + Modal
3. 本地更新 state，避免每次整页重拉
4. 不顺手接引擎、批处理、审核流

### B. 规则引擎扩展

1. 先做 `types.ts`
2. 再做 `rules.ts`
3. 最后做 `index.ts`
4. 默认先支持 dry-run
5. 落库只写明确需要落库的结果

### C. 审核流扩展

1. 先定义状态机
2. GET 返回审核所需上下文，不只返回裸表
3. PATCH payload 用显式 action 区分
4. 审核动作只改审核表，不反写事实表

## 一句话判断

如果这次需求的核心是“在已有模块里再加一块能力”，就先看这个清单。

如果这次需求的核心是“再长出一个新的业务域”，就看 `docs/new-module-checklist.md`。
