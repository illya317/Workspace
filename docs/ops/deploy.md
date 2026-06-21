# 丰华工作台部署说明

当前流水线分工：GitHub Actions 负责公开 CI，CNB 只负责私有 CD/生产发布。生产部署只有一条主链路：本地提交代码，同步 push 到 GitHub 与 CNB，通过 CNB API/CLI 触发 `.cnb.yml` 的 `api_trigger`，CNB/Linux CD 容器执行 `ops/deploy.sh` 构建 Next standalone 产物并上传到 CVM，服务器只解包、挂载运行态目录并用 PM2 重启。

旧 CloudBase/tcb 云托管方案已经不是当前生产路径，不再作为部署参考。

## 本地开发

```bash
npm install
npx prisma db push
npm run dev
```

访问 `http://localhost:3000`。

## 发布流程

本地不直连服务器部署。`git push github main` 触发 GitHub Actions CI；`git push origin main` 只同步 CNB 源码，不触发生产发布，也不作为常规 CI 使用。不要依赖 push 自动部署。

源码同步流程：

```bash
git status --short
git add <files>
git commit -m "<message>"
git push github main
git push origin main
```

生产发布必须基于已同步到 GitHub 与 CNB 的 commit，通过 CNB API/CLI 触发 `.cnb.yml` 的 `api_trigger`：

```bash
sha="$(git rev-parse HEAD)"
cnb build start-build \
  --repo illya317/workspace \
  --branch main \
  --sha "$sha" \
  --event api_trigger \
  --title "deploy ${sha:0:8}" \
  --sync false \
  --verbose
```

部署后用返回的 `sn` 查询状态：

```bash
cnb build get-build-status --repo illya317/workspace --sn "<sn>" --verbose
```

如果部署失败，用同一个 `sn` 和 pipeline/stage id 拉取失败 stage 日志；不要再额外 push 一次制造第二条部署记录。

## CNB 配置

当前仓库的 CD 只保留 CNB 配置：

```bash
.cnb.yml
```

CNB 容器内执行的部署命令由 `.cnb.yml` 固定为：

```bash
bash ./ops/deploy.sh
```

`ops/deploy.sh` 是给 CNB Linux CD 容器使用的部署脚本：

- 不读取本机 `.workspace`，只依赖 CD 环境变量和服务器上已有的运行态目录。
- 不把服务器 `data/` 反向拉回 CD 机器。
- 在 CNB/CD 容器构建 standalone 产物，通过 SSH + rsync 上传到服务器，最后用 PM2 重启。

部署变量来自 CNB imports/环境变量：

| 变量 | 说明 |
|------|------|
| `SERVER` | SSH 目标，例如 `ubuntu@111.229.86.81` |
| `REMOTE_DIR` | 服务器部署目录，例如 `/home/ubuntu/workspace` |
| `PM2_NAME` | PM2 进程名，当前为 `workspace` |
| `KEY_CONTENT` | SSH 私钥内容，推荐使用加密变量 |
| `REMOTE_WORKSPACE_CONFIG_DIR` | 服务器运行态目录，默认 `$(dirname REMOTE_DIR)/.workspace` |
| `HEALTHCHECK_URL` | 可选，部署后在服务器本机执行的健康检查地址，例如 `http://127.0.0.1:3000/` |
| `RUN_LOCAL_CHECKS` | 可选，默认 `1`；设为 `0` 时跳过 CI 机上的静态检查 |

## 部署行为

1. 本地提交后先 push 到 GitHub 跑 CI，再 push 到 CNB 同步发布源码；push 本身不发布生产。
2. 用 CNB API/CLI 触发 `api_trigger`。
3. CNB deploy job 先执行 `.cnb.yml` 里的部署前检查。
4. CNB/Linux CD 容器执行 `npm ci`、部署前检查和 `npm run build`。
5. CNB 将 `.next/standalone`、`.next/static`、`public` 打包为 standalone 产物。
6. CNB 通过 SSH 上传产物到服务器，服务器解包到 `REMOTE_DIR/releases/<release>`。
7. 服务器把 `.env`、数据库、品牌资源、Agent 头像等运行态资源继续指向 `$REMOTE_WORKSPACE_CONFIG_DIR`。
8. 服务器在切换 release 前备份 `$REMOTE_WORKSPACE_CONFIG_DIR` 到 `workspace-runtime-backups/`。
9. 服务器清空 `REMOTE_DIR` 里的旧源码、旧 `.next`、旧 `node_modules` 等杂物，只保留 `releases/` 和 `current`。
10. 使用 PM2 重新启动 `server.js` 并保存进程列表。

这套策略把发布构建放在 CNB/CD 容器里，CVM 只负责运行指定版本；日常 CI 消耗放在 GitHub Actions，避免 CNB 私有项目消耗核时。

## 运行态目录

生产数据库和品牌资源都在服务器外部运行态目录里，构建产物不得覆盖服务器运行态目录；部署脚本会在解包后重新挂载这些运行态资源。

运行态目录内容包括：

- `.env`
- `data/`
- `public/company/`
- `public/assets/agent/avatar/`
- `.workspace/config/`
- `.workspace/cache/`

运行态目录规则见 [environment.md](/Users/koito/Project/workspace/workspace/docs/ops/environment.md)。

## 常见问题

### Push 后为什么没有发布？

`git push github main` 触发 GitHub Actions CI；`git push origin main` 只同步 CNB 源码。正式发布必须用 CNB API/CLI 触发 `api_trigger`。

### 服务器为什么不执行 build？

发布构建统一在 CNB/Linux CD 容器中完成，服务器只运行 standalone 产物。这样可以避免服务器 CPU、内存被构建过程打满，也避免 `.next` 旧构建残留和源码目录混在一起。

### 部署失败后怎么查？

用触发部署时返回的 `sn` 查询状态和日志。不要为了看日志反复 push，因为那会产生新的部署记录，反而掩盖原始失败现场。

### 数据库和头像会被覆盖吗？

不会。`data/`、品牌图、Agent 头像、`.env` 等运行态资源来自 `$REMOTE_WORKSPACE_CONFIG_DIR`，不随构建产物覆盖。
