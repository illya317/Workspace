# Pharma Ops — 部署指南

> 药品生产、检验与记录信息化工作台。Flask + SQLite + YAML 模板驱动动态表单。

## 项目概述

| 项目 | 值 |
|------|-----|
| 名称 | Pharma Ops |
| 技术栈 | Python Flask + SQLAlchemy + SQLite + Jinja2 + Vanilla JS |
| 数据 | 14 种方法模板 × 16 品种，YAML 驱动 |
| 本地访问 | `http://localhost:5001` |
| 部署 | 本地开发为主，可 Docker 化 |

## 前置条件

| 依赖 | 来源 |
|------|------|
| Python >= 3.10 | `brew install python` |
| pip + venv | 自带 |
| PyYAML | `pip install pyyaml` |

## 部署步骤

### 1. 安装依赖

```bash
cd ~/Project/pharma-ops
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -e .
```

### 2. 初始化数据库

```bash
python3 -c "from app import app; from pharma_ops.records.models import db; app.app_context().push(); db.create_all()"
```

### 3. 启动

```bash
python app.py
# 监听 0.0.0.0:5001，debug 模式
```

### 4. 验证

```bash
curl -sS -o /dev/null -w '%{http_code}' http://localhost:5001
# 应返回 200
```

## 腾讯云一键部署（推荐）

项目已配置针对腾讯云服务器 `111.229.86.81` 的一键部署脚本：

```bash
cd ~/.System/tencent
bash deploy-pharma-ops.sh
```

脚本会完成：rsync 同步代码（保留 `data/`、`instance/`、`.venv/`）、安装 Python 依赖、执行必要的数据库迁移、用 pm2 + gunicorn 重启服务。

部署后访问：http://111.229.86.81:5001

## SSH 手动同步方式

如无部署脚本，可按下述 `rsync` over SSH 手动同步。远端地址、用户名和目录按实际服务器替换：

```bash
# 先预览，不真正写入
rsync -azn --delete \
  --exclude 'data/' \
  --exclude 'instance/' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude '__pycache__/' \
  --exclude '.DS_Store' \
  --exclude '.mypy_cache/' \
  --exclude '.ruff_cache/' \
  ~/Project/pharma-ops/ user@host:/path/to/pharma-ops/

# 确认 dry-run 输出无误后，去掉 -n 执行同步
rsync -az --delete \
  --exclude 'data/' \
  --exclude 'instance/' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude '__pycache__/' \
  --exclude '.DS_Store' \
  --exclude '.mypy_cache/' \
  --exclude '.ruff_cache/' \
  ~/Project/pharma-ops/ user@host:/path/to/pharma-ops/
```

注意：
- 源路径末尾的 `/` 表示同步目录内容到远端目录。
- `--delete` 会删除远端中本地已不存在的文件，只能用于本项目专用部署目录；首次同步或不确定时必须先跑 `-n` dry-run。
- 不同步 `data/`、`instance/`、`.venv/`、`venv/` 等运行时目录，避免覆盖远端数据库、实例配置和依赖环境。
- 如果需要指定 SSH key，用 `-e 'ssh -i ~/.ssh/<key>'`。

## 目录结构

```
pharma-ops/
├── app.py                  # 启动入口（薄封装）→ src/pharma_ops/web/app.py
├── src/pharma_ops/
│   ├── web/                # Flask factory、蓝图路由、页面 helper
│   ├── records/
│   │   ├── models.py       # SQLAlchemy 模型（BatchRecord、TestData）
│   │   └── engine/         # 记录结构引擎
│   │       ├── yaml_loader.py      # config YAML 读取
│   │       ├── method_resolver.py  # 方法模板解析
│   │       └── product_builder.py  # 产品记录结构生成
│   ├── coverage/           # 覆盖审计可复用逻辑
│   ├── md/                 # MD canonical 质量审计与清洗工具
│   ├── docx/               # DOCX 解析、证据抽取、指纹审计
│   ├── formulas/           # 公式/方法 YAML 工具
│   └── shared/             # 路径等共享基础设施
├── config/
│   ├── methods/            # 方法级模板
│   ├── products.yaml       # 16 品种 × 阶段 × 检测项映射
│   ├── record_templates/   # 品种级检验记录模板
│   └── table_layouts/      # 表格布局；products 为旧样本源，templates 为新 include 体系
├── requirements.txt        # Python 依赖
├── schema/
│   ├── md_extracted/    # MD 抽取稿，Phase -1 输入
│   ├── md_canonical/       # MD 清洗真源稿，覆盖审计和模板生成真源
│   ├── template_headings.md # 整体结构骨架
│   └── README.md           # 当前 MD 主线说明
├── data/                      # 忽略路径；真实运行数据在外置 workspace
├── static/js/
│   ├── core/                   # 核心逻辑
│   │   ├── form_engine.js      # 前端计算引擎（公式解析、实时重算、规则判定）
│   │   └── record_engine.js    # 检验记录通用交互引擎
│   ├── components/             # 表格组件、记录组件
│   ├── app/                    # 页面入口脚本（预留）
├── templates/
│   ├── base.html               # 页面骨架
│   ├── batch_list.html         # 批次管理（新建 + 列表）
│   └── product_methods.html    # 产品-方法映射确认页
├── scripts/
│   └── *.py                    # CLI wrappers；主逻辑在 src/pharma_ops/
├── raw/                        # 原始 docx 文件（16 品种）
├── AGENTS.md                   # 本文件
└── CLAUDE.md → AGENTS.md       # 软链接
```

## 外置工作区

本地运行数据不进入源码仓库，默认放在：

```bash
~/Desktop/workspace/.pharma-ops
```

| 目录 | 内容 |
|------|------|
| `.pharma-ops/data/` | SQLite 运行数据，例如 `qc.db` |
| `.pharma-ops/feedback/` | 页面 POST 产生的临时人工反馈 |
| `.pharma-ops/drafts/` | 自动生成但尚未确认的 YAML/JSON 草稿 |
| `.pharma-ops/drafts/table_layout_templates/` | 外置 layout 模板候选蓝图草稿，人工看图确认后才允许转正式模板 |
| `.pharma-ops/docs/` | 可选 DOCX/PDF/PNG 预览等大型资料 |

脚本默认读取该目录；如需换位置，可设置：

```bash
export PHARMA_OPS_WORKSPACE=/path/to/.pharma-ops
```

源码内的 `docs/coverage/` 保留网页和计划会直接读取的小型报告，例如
`component_mapping.md`、`component_checklist.md`、`manual/component_feedback.json`。
`docs/coverage/audit/docx_inventory.json` 与 `table_fingerprint.json` 可放在源码目录内
作为本地审计缓存，但必须保持 Git 忽略。

详细资产边界和架构规则见 `docs/architecture.md`。

硬规则：
- 运行数据必须走 `~/Desktop/workspace/.pharma-ops/data/`，不要在项目内创建真实数据库。
- 页面 POST 产生的临时人工反馈优先写入 `~/Desktop/workspace/.pharma-ops/feedback/`。
- 自动生成但尚未人工确认的模板草稿写入 `~/Desktop/workspace/.pharma-ops/drafts/`，不要混入正式 `config/`。
- `docs/coverage/audit/docx_inventory.json` 和 `table_fingerprint.json` 是可重建缓存，允许放在项目目录，必须保持 Git 忽略。
- GET 页面不得写 tracked 文件；刷新审计报告必须通过显式 POST 或 CLI。
- 新增可复用 Python 逻辑优先放入 `src/pharma_ops/`，脚本只做编排入口。
- 会修改 canonical MD 或正式 YAML 的修复脚本必须默认 dry-run、写外置 drafts，或要求显式 `--apply` / `--overwrite`；脚本分组见 `scripts/README.md`。

## 架构

### 数据流

```
raw/*.docx
          ↓
schema/md_extracted/*.md       (抽取稿)
          ↓
schema/md_canonical/*.md          (清洗真源稿)
          ↓
scripts/audit_md_quality.py       (Phase -1)
          ↓
scripts/audit_coverage.py         (Phase 0)
          ↓
config/methods/*.yaml + config/products.yaml + config/record_templates/*.yaml
          + config/table_layouts/templates/**/*.json
          ↓
src/pharma_ops/records/engine/: 解析模板 → 生成字段结构（含 formula/rule/repeat）
          ↓
Flask API / templates/records: 动态渲染表单，JS 实时计算+判定
          ↓
SQLite (EAV: TestData 表)
```

### 核心模块

| 层级 | 文件 | 职责 |
|------|------|------|
| 路由/入口 | `app.py` + `src/pharma_ops/web/app.py` + `src/pharma_ops/web/routes_*.py` | Flask factory、启动入口、路由、API endpoint |
| 模板引擎 | `src/pharma_ops/records/engine/*.py` | YAML 读取、方法继承、config 注入、记录结构生成 |
| 数据模型 | `src/pharma_ops/records/models.py` | SQLAlchemy ORM（BatchRecord、TestData） |
| 方法模板 | `config/methods/*.yaml` | 方法级字段、公式、规则、repeat 定义 |
| 产品映射 | `config/products.yaml` | 16 品种 × Part → 检测项 → method/config |
| 品种模板 | `config/record_templates/*.yaml` | 品种级检验记录内容 |
| 表格布局 | `config/table_layouts/templates/**/*.json` | 新模板体系：common/operation/weighing/measurement/calculation/microbiology/parents 子模板 + 父模板 include |
| 旧布局样本 | `config/table_layouts/products/**/*.json` | 只作为归类/取样参考，不作为长期逐个维护目标 |
| MD 真源 | `schema/md_canonical/*.md` | 覆盖审计和模板生成依据 |
| 前端 | `templates/records/*.html` | 记录页骨架和组件 |
| 计算引擎 | `static/js/core/form_engine.js` | 公式 eval、跨行聚合 ALL()、规则判定、DOM 更新 |
| 组件映射 | `src/pharma_ops/coverage/component_mapping_audit.py` + `src/pharma_ops/coverage/coverage_utils.py` | JS 组件扫描、MD 映射解析、mock section 构建 |
| DOCX/MD 审计 | `src/pharma_ops/docx/*.py` + `src/pharma_ops/md/*.py` | DOCX 证据、MD 质量、清洗修复、指纹审计 |
| 公式工具 | `src/pharma_ops/formulas/formula_utils.py` | 方法 YAML 加载/保存、repeat 展开与还原 |
| 方法编辑器 | `templates/method_editor.html` + `static/js/app/method_editor.js` + `static/css/method-editor.css` | 内联编辑 YAML 方法字段，并在同页完成表格布局设计 |
| 通用组件 | `static/js/components/modal.js` | 自定义 Modal 弹框（alert/confirm），替换浏览器默认弹框 |

### API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 首页（双入口：批次检验记录 + 组件映射） |
| `/batches` | GET | 批次管理（新建批次 + 批次列表） |
| `/batch/create` | POST | 创建批次并进入检验记录 |
| `/record/<product>` | GET | 检验记录页面 |
| `/api/record-structure/<product>` | GET | 返回产品表单结构 JSON |
| `/api/batch/save` | POST | 保存批次数据（EAV） |
| `/api/batch/<id>/data` | GET | 加载批次已保存数据 |
| `/coverage` | GET | 组件映射总览（左侧产品导航、阶段筛选、汇总统计） |
| `/coverage/refresh` | POST | 显式刷新组件映射报告 |
| `/coverage/preview/<component>` | GET | 真实 JS 组件渲染预览（iframe + mock 数据） |
| `/formulas` | GET | 公式一览（所有方法字段、公式、规则、默认值） |
| `/methods/editor` | GET | 方法编辑器（字段编辑 + 表格设计） |
| `/api/methods/<method_name>` | POST | 保存方法字段回 YAML |
| `/product-methods` | GET | 产品-方法映射确认页 |

### 字段类型

| attr | 说明 | 前端渲染 |
|------|------|---------|
| `fillable` | 手动输入 | 可编辑 input |
| `calculated` | 公式计算 | 灰色只读，自动更新 |
| `prefilled` | 预设值 | 可编辑，带默认值 |

### 公式引擎支持

- 基本运算：`+ - * / ()`
- 数学函数：`ABS()`, `SQRT()`, `^`（幂）
- 逻辑运算：`&&`, `||`, `==`/`!=`, `>`, `<`, `>=`, `<=`
- 跨行聚合：`ALL(fieldName)` — 取所有 repeat 行的最大值
- 字符串比较：`字段名 == '字符串'`
- 规则判定：布尔公式 → select options[0]/options[1]（符合/不符合）
- `{序号}` 占位符：repeat 组内自动替换为行号

## 硬约束

交付前验证：

```bash
python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py
python3 scripts/audit_template_contracts.py
python3 scripts/audit_tooling_boundaries.py
python3 scripts/generate_layout_template_consolidation.py
python3 scripts/generate_layout_template_blueprints.py
python3 scripts/generate_layout_template_review_matrix.py
python3 scripts/audit_layout_template_review_matrix.py
python3 scripts/audit_layout_template_blueprints.py
python3 scripts/audit_layout_templates.py
python3 scripts/audit_business_readiness.py
python3 scripts/audit_runtime_acceptance.py
python app.py                                               # 启动验证（端口 5001）
curl -sS -o /dev/null -w '%{http_code}' http://localhost:5001  # 页面可达
```

提交规则：
- commit 前先看 `git status`，不要提交 `data/`, `__pycache__/`, `.DS_Store`, `venv/`, `instance/`
- 不需要 `pip freeze` 全量更新 `requirements.txt`，只在新增依赖时手动加
- 修改 `config/methods/*.yaml`、`config/products.yaml` 或 `config/record_templates/*.yaml` 必须在提交信息里说明变更内容

## Git 忽略清单

| 模式 | 说明 |
|------|------|
| `data/` | 运行数据目录；项目内不得创建真实数据库 |
| `instance/` | Flask 实例配置 |
| `archive/` | 旧管线归档和大型历史资料，外置保存 |
| `docs/coverage/audit/previews/` | PNG 预览，外置保存 |
| `docs/coverage/audit/pdf_previews/` | PDF 预览，外置保存 |
| `__pycache__/` | Python 缓存 |
| `venv/` | 虚拟环境 |
| `*.egg-info/` | Python editable install 元数据 |
| `.DS_Store` | macOS 系统文件 |
| `.mypy_cache/` | MyPy 缓存 |
| `.ruff_cache/` | Ruff 缓存 |

## 注意事项

- 当前数据主线是 `schema/md_extracted` → `schema/md_canonical` → `docs/coverage` → `config/*.yaml`。
- `schema/s1_raw`、`schema/s2_agent`、`schema/s3_tbc`、`schema/s4_confirmed` 属于旧 JSON 管线；如需追溯，优先查外置工作区或旧备份，不要作为新开发输入。
- 旧 S0/S1/S2/docx 规则已归档到外置 `workspace/archive/config_rules_legacy/20260612/`，当前主线不再读取 `config/rules`。
- `scripts/` 根目录只放当前主线脚本。旧 docx→json→editor 脚本不再放源码主线。
- YAML 模板是运行时真源 → 新增方法/字段优先改 `config/*.yaml`，不要在模板里硬编码品种逻辑。
- Layout 新方向已经进入“需要人工看图确认版式”的阶段：旧 `config/table_layouts/products/**/*.json` 只作为归类/取样参考，不再做逐个旧 JSON review UI，也不要手改 226 个 product JSON。
- Layout 迁移主线是 `scripts/generate_layout_template_consolidation.py` → `scripts/generate_layout_template_blueprints.py` → `scripts/generate_layout_template_review_matrix.py` → `scripts/audit_layout_template_review_matrix.py` → `scripts/audit_layout_template_blueprints.py`；外置蓝图和人工确认矩阵经人工确认后，才把正式模板写入 `config/table_layouts/templates/{common,operation,weighing,measurement,calculation,microbiology,parents}/`。
- 浏览器里的 table-layout 保存只能写外置 `workspace/drafts/table_layout_editor/` 或 test fixtures，不能直接写正式 `config/table_layouts/`。
- 不直接修改 `~/Desktop/workspace/.pharma-ops/data/qc.db`，走 Flask SQLAlchemy / API
- 字段存储使用 EAV 模型，field_key 格式：`{stage_key}/{test_name_en}/s{section_idx}/{field_name}`，重复时加 `_n` 后缀
- 保存时 `db.session.flush()` 避免 IntegrityError
- 前端 `oninput` 实时捕获值（非 `onchange`），确保批号等字段即时保存
- 归档不是删除。只有新主线通过 Phase -1、Phase 0 和对应功能验收后，才考虑移除历史归档。

## 检验记录页面复刻规范

用户上传参考图要求复刻表格时，必须遵守以下规范：

### 1. 零添加原则
- **用户说不要的内容，绝对不要加**。例如用户明确说"不要平均溶出度/RD"，即使之前上下文提过，也不要加。
- **不要擅自补空单元格**（`<td></td>`）来凑列数。如果参考图没有，就不写。
- **不要擅自修改结论格式**。不同检测项结论不同：有的有 `%`（如含量），有的没有（如溶出度）。以 YAML 中 `结论含数值` 标志或用户明确描述为准。

### 2. 表格结构推断方法
复刻前必须仔细分析参考图的行列结构：
1. **数总列数**：通过竖线边界确定表格总共几列。所有行的 `<td>` 数量（含 colspan）必须一致。
2. **看 rowspan**：哪些单元格跨多行（如"吸光度"、"计算"、"供试品溶出度"）。
3. **看 colspan**：哪些单元格跨多列（如"波长"、"空白OD"、公式行）。
4. **上下对齐**：同一列的数据在上下行必须对齐。例如样1/2/3 在上面的供试品OD行和下面的溶出度结果行必须在同一列位置。
5. **独立区块**：注意参考图中是否有的区块是独立的（如"供试品OD"不在"吸光度"的rowspan内，而是独立在其下方的行）。

### 3. 确认后再动手
- 如果参考图结构复杂（如列数不确定、行span关系不明显），**先向用户确认推断的结构**，而不是直接写一个猜测的版本。
- 如果用户明确给出了文本格式的表格（如用tab分隔），严格按用户给的格式来，不要自行推断。

### 4. 对照数据源优先级
修改检测项内容时，优先级：
1. 用户明确给出的参考图/文字描述
2. `schema/md_canonical/<品种>.md` 中的真源稿
3. 现有 YAML 配置

### 5. 通用组件修改须知
- `weighing_table`、`assay_table`、`dissolution_table` 等组件是**跨检测项复用**的。修改前要评估是否影响其他检测项的页面。
- 如果不同检测项需要不同的表格变体（如称重表格有的需要"平均片重+理论片重"，有的需要"片重÷20"），应通过 YAML 标志或 macro 参数来区分，而不是直接改掉通用组件的默认行为。
