# 远端开发环境

远端开发的代码、Shell、依赖和运行进程都应位于同一台 SSH 主机。Codex 任务界面显示的项目路径只是当前任务的实际工作目录；如果它显示的是本机路径，那么本机改动不会自动出现在服务器开发目录。

## 当前 Workspace 边界

| 环境 | 源码 | 运行方式 | 端口 |
|---|---|---|---|
| 本机开发 | 本机 Git checkout | `npm run dev` | 本机固定 `3000` |
| 服务器开发 | `/home/ubuntu/workspace-dev/source` | Compose 项目 `/home/ubuntu/workspace-dev` | 容器内 `3000`，宿主机仅 `127.0.0.1:3100` |
| 生产 | 不可变 release tree | PM2 / 正式发布流程 | 宿主机 `3000` |

服务器开发使用独立源码、`.workspace`、密钥、PostgreSQL 容器、数据卷和 Docker 网络。不得读取或修改生产 `current`、生产数据库或生产租户配置，也不得把开发端口 `3100` 绑定到公网地址。

开始任务前先确认运行位置：

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
```

在服务器开发项目中，上述 Git 根目录必须是 `/home/ubuntu/workspace-dev/source`。如果 Codex 显示或命令返回本机目录，应停止把当前任务当作远端任务；改用下面的 Codex SSH 项目，或明确通过 SSH 操作服务器。

## Codex 直接使用 SSH 项目

Codex 桌面端支持把 SSH 主机上的目录保存为远端项目。远端项目任务直接读取、修改远端文件并在远端 Shell 执行命令；它不是本机 checkout 的自动同步功能。

1. 在本机 `~/.ssh/config` 添加一个不含通配符的具体 alias。主机名、用户名和密钥路径只留在本机私有 SSH 配置，不进入仓库：

   ```sshconfig
   Host workspace-dev
     HostName <server-host>
     User <ssh-user>
     IdentityFile <private-key-path>
   ```

2. 在本机确认 SSH 能直接连接：

   ```bash
   ssh workspace-dev
   ```

3. 在远端主机安装 Codex CLI，并完成登录；无图形界面时优先使用 device-code 登录：

   ```bash
   npm install --global @openai/codex
   codex login --device-auth
   codex login status
   ```

4. 在 Codex 桌面端打开 **Settings > Connections**，添加或启用 `workspace-dev` SSH 主机，然后选择远端目录 `/home/ubuntu/workspace-dev/source` 保存为项目。
5. 从这个远端项目新建任务。已有本地任务只有在两端保存了同一 Git 仓库和同一项目子目录时，才能从任务底部的运行位置菜单选择远端主机并 **Hand off**；否则新建远端任务更明确。

官方说明：[Codex Remote connections - Connect to an SSH host](https://learn.chatgpt.com/docs/remote-connections#connect-to-an-ssh-host)。

## 浏览器访问服务器开发服务

开发服务不公开监听。通过 SSH 隧道把服务器回环端口映射到本机：

```bash
ssh -N -L 127.0.0.1:3100:127.0.0.1:3100 workspace-dev
```

保持终端连接后，浏览器访问：

```text
http://127.0.0.1:3100/workspace/login
```

登录必须走正式登录页支持的身份流程。仓库和服务器开发环境都不得提供按 `userId` 签发会话的免认证 bypass。

## 服务器开发运行命令

```bash
ssh workspace-dev
cd /home/ubuntu/workspace-dev
docker compose ps
docker compose logs -f app
docker compose stop
docker compose up -d
```

`docker compose stop` 保留源码、运行配置和 PostgreSQL 数据。除非明确要销毁开发数据库，不得运行 `docker compose down -v`。修改 `package-lock.json` 后重启 app；启动 wrapper 只在 lock hash 改变时运行 `npm ci`。

即使在服务器容器中，Workspace 开发进程也继续遵守项目固定的内部端口 `3000`。`3100` 只是服务器宿主机的回环映射，不能改写成仓库内的 Next dev 端口。
