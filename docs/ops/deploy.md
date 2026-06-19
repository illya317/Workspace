# 丰华工作台 - 腾讯云 CloudBase 部署指南

## 项目简介

丰华工作台是一个企业内部工作管理平台，支持周报/月报/日报填写、部门工作清单管理、历史记录追踪等功能。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **数据库**: Prisma + SQLite
- **样式**: Tailwind CSS
- **语言**: TypeScript
- **部署**: 腾讯云 CloudBase 云托管（容器）

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
npx prisma db push

# 3. 启动开发服务
npm run dev
```

访问 http://localhost:3000

## 腾讯云 CloudBase 部署

> 当前生产环境使用腾讯云 CVM + Nginx + PM2，不走 CloudBase 云托管。CloudBase 段落保留为历史部署参考。

## 当前生产部署（CVM + PM2）

本地不直连服务器部署。`git push origin main` 只触发 CNB CI 检查，不发布生产；不要依赖 push 自动部署。

源码同步流程：

```bash
git status --short
git add <files>
git commit -m "<message>"
git push origin main
```

生产发布必须基于已 push 到 CNB 的 commit，通过 CNB API/CLI 触发 `.cnb.yml` 的 `api_trigger`：

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

部署脚本只读取 CNB imports/CI 环境变量，不读取本机 `ops/server.env.sh`。需要在 CNB 环境里配置：

| 变量 | 说明 |
|------|------|
| `SERVER` | SSH 目标，例如 `ubuntu@<server-ip>` |
| `REMOTE_DIR` | 服务器源码目录，例如 `/home/ubuntu/workspace` |
| `PM2_NAME` | PM2 进程名，例如 `workspace` |
| `KEY_CONTENT` / `KEY` | SSH 私钥内容或 CI 内部私钥路径，二选一 |

部署流程：

1. 本地只提交并 push 到 CNB，push 本身不发布生产。
2. 用 CNB API/CLI 触发 `api_trigger`。
3. CNB/Linux 容器执行 `npm ci`、静态检查和 `npm run build`。
4. CNB 将 `.next/standalone`、`.next/static`、`public` 打包为 standalone 产物。
5. CNB 通过 SSH 上传产物到服务器，服务器解包到 `REMOTE_DIR/releases/<release>`。
6. 服务器把 `.env`、数据库、品牌资源、Agent 头像等运行态资源继续指向 `$REMOTE_WORKSPACE_CONFIG_DIR`。
7. 服务器在切换 release 前备份 `$REMOTE_WORKSPACE_CONFIG_DIR` 到 `workspace-runtime-backups/`。
8. 服务器清空 `REMOTE_DIR` 里的旧源码、旧 `.next`、旧 `node_modules` 等杂物，只保留 `releases/` 和 `current`。
9. 使用 PM2 重新启动 `server.js` 并保存进程列表。

这套策略把构建 CPU 放在 CNB/CI 容器里，CVM 只负责运行指定版本，避免生产服务器在部署时执行 `npm ci` 或 `npm run build`。

## CNB / 云效远端部署

`ops/deploy.sh` 是给 CNB、云效或其他远端 Linux CI 机器使用的部署脚本：

- 不读取本机 `.workspace`，只依赖 CI 环境变量和服务器上已有的运行态目录。
- 不把服务器 `data/` 反向拉回 CI 机器。
- 在 CI 机器构建 standalone 产物，通过 SSH + rsync 上传到服务器，最后用 PM2 重启。

建议在云效流水线里配置这些变量：

| 变量 | 说明 |
|------|------|
| `SERVER` | SSH 目标，例如 `ubuntu@111.229.86.81` |
| `REMOTE_DIR` | 服务器源码目录，例如 `/home/ubuntu/workspace` |
| `PM2_NAME` | PM2 进程名，当前为 `workspace` |
| `KEY_CONTENT` | SSH 私钥内容，推荐使用加密变量 |
| `REMOTE_WORKSPACE_CONFIG_DIR` | 服务器运行态目录，默认 `$(dirname REMOTE_DIR)/.workspace` |
| `HEALTHCHECK_URL` | 可选，部署后在服务器本机执行的健康检查地址，例如 `http://127.0.0.1:3000/` |
| `RUN_LOCAL_CHECKS` | 可选，默认 `1`；设为 `0` 时跳过 CI 机上的静态检查 |

当前仓库已提供 CNB 配置和一份云效 YAML 样例：

```bash
.cnb.yml
```

```bash
ops/yunxiao.pipeline.yml
```

说明：

1. 代码源连接由云效服务连接提供，YAML 内引用该连接。
2. 私密变量推荐放在云效通用变量组或流水线 UI 变量里，不要直接写进 YAML。
3. 如果通过 OpenAPI 创建流水线，建议采用“两步法”：
   - 先用 `ops/yunxiao.pipeline.yml` 创建流水线本体；
   - 再用流水线关联 API 给该流水线绑定变量组。

流水线命令最小示例，必须在 CNB/CI 容器内执行：

```bash
chmod +x ops/deploy.sh
./ops/deploy.sh
```

推荐触发方式：

1. `main` 分支 push 只做 CI 检查。
2. 需要生产发布时，用 CNB API/CLI 触发 `api_trigger`。
3. 远端 CI 先执行 `ops/deploy.sh` 里的静态检查。
4. 再在 CI 容器构建 standalone 产物并上传服务器。
5. 最后健康检查。

如果你想把 CI/CD 分成两个阶段，也可以：

1. CI 阶段只跑检查，不部署。
2. CD 阶段调用 `./ops/deploy.sh`。

当前项目由于生产数据库和品牌资源都在服务器外部运行态目录里，构建产物不得覆盖服务器运行态目录；部署脚本会在解包后重新挂载这些运行态资源。

### 前置条件

- 腾讯云账号
- 已开通 [CloudBase 云开发](https://console.cloud.tencent.com/tcb)
- Node.js >= 18

### 1. 安装 CloudBase CLI

```bash
npm i -g @cloudbase/cli

# 验证安装
tcb --version
```

### 2. 登录 CloudBase

```bash
# 交互式登录（打开浏览器扫码）
tcb login

# 或在 CI 环境中使用 API 密钥登录
# tcb login --apiKeyId xxx --apiKey xxx
```

### 3. 创建云开发环境

登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)，创建一个环境，记录 **环境 ID**（如 `weekly-report-xxx`）。

### 4. 配置环境变量

```bash
# 设置当前使用的环境
tcb env use <你的环境ID>

# 配置密钥（用于 cloudbaserc.json 中的变量替换）
tcb credentials add
```

或者直接在 `cloudbaserc.json` 中修改 `envId`：

```json
{
  "envId": "weekly-report-xxx"
}
```

### 5. 配置数据库持久化存储（CFS）

**重要**: SQLite 是文件型数据库，需要挂载持久化存储，否则容器重启后数据会丢失。

1. 进入 [CloudBase 控制台 - 云托管](https://console.cloud.tencent.com/tcb)
2. 找到「存储」→「文件存储（CFS）」
3. 创建一个文件存储实例
4. 在云托管服务的「存储挂载」中，将 CFS 挂载到 `/data`

### 6. 首次部署

```bash
# 部署到 CloudBase 云托管
tcb app deploy
```

部署完成后，控制台会输出访问地址。

### 7. 初始化生产数据库

首次部署后，需要初始化数据库 Schema：

```bash
# 进入云托管容器的 Web Shell
# 控制台 → 云托管 → 服务列表 → weekly-report → 版本详情 → Web Shell

# 在容器中执行：
npx prisma db push
```

> **注意**：当前项目不使用 `prisma migrate deploy`。部分旧 migration（如 `20260530000000_add_budget_version_v1`）包含表重定义操作，在空库上会因目标表不存在而失败。SQLite 开发/生产环境统一使用 `prisma db push` 从 schema 直接同步，或从已有数据库备份恢复。修复 migration 历史需单独开任务处理。

### 8. 后续更新部署

```bash
# 修改代码后重新构建并部署
npm run build
tcb app deploy
```

## 配置说明

### Dockerfile

- 使用多阶段构建，减小镜像体积
- 基于 `node:22-alpine`
- 生产环境使用 Next.js standalone 输出
- 暴露端口 3000

### cloudbaserc.json

| 配置项 | 说明 |
|--------|------|
| `envId` | CloudBase 环境 ID |
| `serviceName` | 云托管服务名称 |
| `containerPort` | 容器内部端口（3000） |
| `envVariables.DATABASE_URL` | 数据库路径，指向 CFS 挂载点 `/data/dev.db` |
| `volumeMounts.cfs.mountPath` | CFS 挂载到容器的路径 `/data` |

### next.config.ts

已配置 `output: "standalone"`，使 Next.js 生成最小化的生产构建，适合容器部署。

## 域名与 HTTPS

1. 进入 CloudBase 控制台 → 云托管 → 访问设置
2. 绑定自定义域名（或直接使用 CloudBase 提供的默认域名）
3. 自动开通 HTTPS

## 注意事项

1. **数据库持久化**: 务必配置 CFS 挂载，否则 SQLite 数据在容器重启后会丢失
2. **环境变量**: 生产环境的 `NEXTAUTH_SECRET` 应使用强随机字符串，不要在代码中硬编码
3. **企微集成**: 如需对接企业微信，在 CloudBase 控制台配置 `WECHAT_CORP_ID` 等环境变量
4. **日志查看**: 部署后可在 CloudBase 控制台查看容器日志进行调试

## 常见问题

### Q: 部署后页面显示 502？

A: 检查容器是否正常启动。进入控制台 → 云托管 → 日志，查看错误信息。常见原因是数据库路径不存在或权限问题。

### Q: 数据库数据丢失？

A: 确认 CFS 已正确挂载到 `/data`，且 `DATABASE_URL` 指向 `/data/dev.db`。

### Q: 如何备份数据库？

A: CFS 中的文件可以手动下载备份，或配置定时任务自动备份到 COS。

## 相关文档

- [CloudBase CLI 官方文档](https://cloud.tencent.com/document/product/876/41539)
- [CloudBase 云托管文档](https://cloud.tencent.com/document/product/1243)
- [Next.js 部署文档](https://nextjs.org/docs/app/building-your-application/deploying)
