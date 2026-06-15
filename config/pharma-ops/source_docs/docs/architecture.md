# Pharma Ops Architecture

> 本文是项目架构、代码规范和资产边界的唯一正式说明。根目录 `架构.md` 仅作跳转。

## 1. 项目定位

Pharma Ops 是药品生产、检验与记录信息化工作台。当前主业务是批检验记录信息化，后续可以扩展到生产记录、批次生命周期、放行和审计追踪。

技术栈：

| 层 | 技术 |
|----|------|
| 后端 | Flask + SQLAlchemy |
| 数据库 | SQLite，运行数据放外置 workspace |
| 模板 | Jinja2 |
| 前端 | Vanilla JS + 组件化表格渲染 |
| 配置 | YAML + JSON |
| 真源资料 | DOCX + Markdown canonical |

## 2. 三条主线

### 运行时主线

```text
config/products.yaml
  + config/methods/*.yaml
  + config/record_templates/*.yaml
  + config/table_layouts/templates/**/*.json
        ↓
src/pharma_ops/records/engine/product_builder.py
        ↓
Flask API /api/record-structure/<product>
        ↓
templates/records/* + static/js/*
        ↓
SQLite EAV: BatchRecord + TestData
```

运行时只能依赖 `config/`、`templates/`、`static/`、`src/` 和数据库。运行时不应依赖可重建审计缓存。

### 真源与生成主线

```text
raw/*.docx
        ↓
schema/md_extracted/*.md
        ↓
schema/md_canonical/*.md
        ↓
scripts/audit_*.py / scripts/generate_*.py
        ↓
docs/coverage/* + config/table_layouts/*
```

DOCX 是复杂表格版式真源；MD canonical 是章节和普通文本真源；YAML/JSON 是运行配置。

### 验收主线

```text
docs/coverage/*.md
  + docs/coverage/manual/*.md
  + /coverage 页面人工核对
        ↓
修 config / static / templates
        ↓
重新运行审计和功能验证
```

验收文档可以提交；人工反馈文件可提交；大型缓存和运行数据不可提交。

## 3. 目录边界

| 路径 | 类型 | Git | 说明 |
|------|------|-----|------|
| `app.py` | 源码入口 | 提交 | 保持 `python app.py` 可启动 |
| `src/pharma_ops/` | Python 源码包 | 提交 | 新增可复用逻辑优先放这里 |
| `src/pharma_ops/records/engine/` | 运行时结构引擎 | 提交 | YAML 方法解析、字段展开、记录结构契约生成 |
| `scripts/` | CLI 入口 | 提交 | 主线脚本保持薄 wrapper，复杂逻辑放在 `src/pharma_ops/` |
| `static/` | 浏览器静态资源 | 提交 | 前端 core/components/app/legacy 分层 |
| `templates/` | Jinja 模板 | 提交 | 页面和记录模板 |
| `config/` | 运行配置 | 提交 | YAML/JSON 运行时真源 |
| `config/table_layouts/products/` | 旧表格布局样本 | 提交 | 只作为归类/取样参考，不作为长期逐个维护目标 |
| `config/table_layouts/templates/` | 表格布局模板 | 提交 | 新模板体系：子模板 + 父模板 include |
| `raw/` | 原始业务真源 | 提交 | 16 个 DOCX 原始记录 |
| `schema/md_extracted/` | MD 抽取稿 | 提交 | 可复查抽取结果 |
| `schema/md_canonical/` | MD 清洗真源稿 | 提交 | 覆盖审计和模板生成依据 |
| `docs/coverage/*.md` | 审计/验收报告 | 提交 | 人读报告和人工验收记录 |
| `docs/coverage/audit/*.yaml` | 结构化审计产物 | 提交 | 小型、可审阅、可复现 |
| `docs/coverage/audit/runtime_acceptance_report.md` | 运行时准入报告 | 提交 | 16 产品路由、结构契约、字段 key、保存入口审计 |
| `docs/coverage/audit/docx_inventory.json` | 可重建审计缓存 | 忽略 | 从 DOCX 抽取的结构清单 |
| `docs/coverage/audit/table_fingerprint.json` | 可重建审计缓存 | 忽略 | 从 DOCX 抽取的表格指纹 |
| `docs/coverage/audit/previews/` | 可重建预览缓存 | 忽略 | PNG 预览 |
| `docs/coverage/audit/pdf_previews/` | 可重建预览缓存 | 忽略 | PDF 预览 |
| `data/` | 运行数据 | 忽略 | 不应在项目内创建真实数据库 |
| `~/Desktop/workspace/.pharma-ops/data/` | 运行数据 | 仓库外 | SQLite 等本地数据 |
| `~/Desktop/workspace/.pharma-ops/feedback/` | 运行反馈 | 仓库外 | 页面 POST 产生的临时人工反馈 |
| `.venv/`, `node_modules/`, `__pycache__/` | 依赖/缓存 | 忽略 | 本地安装产物 |

## 4. 代码规范

### Python

- 新的业务逻辑放 `src/pharma_ops/<domain>/`。
- Python 包元数据放 `pyproject.toml`；部署兼容依赖清单保留 `requirements.txt`。
- `scripts/` 只保留命令入口、参数解析和流程编排；直接执行兼容逻辑集中在 `scripts/_bootstrap.py`。
- 不在 Flask GET 路由里写 tracked 文件。
- 运行数据路径必须通过 `pharma_ops.shared.paths` 获取。
- 不直接修改 SQLite 文件；通过 SQLAlchemy 模型或 API 写入。
- 结构化数据使用 YAML/JSON 解析写入，不用正则拼接。
- 旧管线代码不得留在运行路由或静态入口；确需保留时放入 `archive/` 并写清来源。

### 前端

- 页面入口脚本放 `static/js/app/`。
- 表单核心逻辑放 `static/js/core/`。
- 可复用表格组件放 `static/js/components/`。
- 废弃前端入口不放在 `static/js/` 运行目录，先归档再删除。
- 通用组件修改前必须评估跨产品影响。

### 配置

- `config/methods/*.yaml` 描述方法级字段、公式、规则和 repeat。
- `config/record_templates/*.yaml` 描述品种级记录内容、操作方法、标准规定和结论。
- `config/products.yaml` 描述产品、阶段、检测项和方法映射。
- `config/table_layouts/products/**/*.json` 是旧 product layout 样本源；只读、归类、取样，不手改，不做长期逐个维护。
- `config/table_layouts/templates/{common,operation,weighing,measurement,calculation,microbiology,parents}/**/*.json` 是新布局模板体系；正式模板必须通过 include 展开审计。
- Layout 模板候选先写外置 `workspace/drafts/table_layout_templates/`，经人工看图确认后再进入 `config/table_layouts/templates/`。

## 5. 写入规则

| 操作 | 写入位置 |
|------|----------|
| 批次录入、保存、提交 | 外置 `workspace/data/qc.db` |
| 手工组件核对反馈 | `docs/coverage/manual/component_feedback.json` |
| 产品-方法映射 POST 反馈 | 外置 `workspace/feedback/products/` |
| record template 自动生成草稿 | 外置 `workspace/drafts/record_templates/` |
| 方法编辑器测试环境 | `test/fixtures/methods/` |
| 表格布局正式配置 | `config/table_layouts/templates/` |
| 表格布局旧样本 | `config/table_layouts/products/` 只读参考 |
| 表格布局测试草稿 | `test/fixtures/table_layouts/` |
| 组件映射刷新 | 显式调用 `/coverage/refresh` 或 `scripts/audit_component_mapping.py` |
| DOCX 指纹缓存 | `docs/coverage/audit/*.json`，但保持 Git 忽略 |

GET 页面只能读取和展示；需要写文件的动作必须是 POST API 或 CLI。

## 6. 当前重构边界

短期保持稳定：

- 根目录 `app.py` 只保留启动入口；`src/pharma_ops/web/app.py` 提供 `create_app()` factory。
- 记录结构引擎已迁入 `src/pharma_ops/records/engine/`，运行时代码不再依赖根目录 `engine/`。
- Coverage、DOCX、MD 清洗、表格布局、record template 生成等主线脚本实现已迁入 `src/pharma_ops/coverage`、`docx`、`md`、`records`。
- `config/`、`schema/`、`raw/` 保持当前位置。
- `/coverage` 默认只读，刷新必须显式触发。

后续逐步调整：

1. `scripts/` 主线入口已收敛为薄 wrapper；后续新增维护脚本也保持此约束。
2. `generate_table_previews.py` 是可选开发工具，核心逻辑位于 `src/pharma_ops/docx/table_previews.py`，运行 PNG 预览需额外安装 matplotlib。
3. `config/table_layouts/products/**/*.json` 不再作为长期维护目标；模板化迁移由 consolidation 报告和外置 blueprint 草稿推进。

## 7. 验证基线

提交前至少运行：

```bash
python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py
python3 scripts/audit_template_contracts.py
python3 scripts/generate_layout_template_consolidation.py
python3 scripts/generate_layout_template_blueprints.py
python3 scripts/audit_layout_template_blueprints.py
python3 scripts/audit_layout_templates.py
python3 scripts/audit_business_readiness.py
python3 scripts/audit_runtime_acceptance.py
(cd test && npm test)
```

涉及页面或路由时，还要用 Flask test client 或浏览器确认核心页面可访问。
