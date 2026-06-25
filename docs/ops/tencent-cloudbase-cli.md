# 腾讯云 CloudBase CLI 文档（已废弃）

> ⚠️ 旧 CloudBase/tcb 云托管方案已经不是当前生产路径，本文档仅作历史参考。
>
> 原文：https://cloud.tencent.com/document/product/876/41539
> 抓取时间：2026-05-16

## 1. 工具简介

CloudBase CLI (`tcb`) 是腾讯云 CloudBase 的官方命令行工具，V3 版本提供 15 个顶级命令模块，覆盖从环境创建到部署的完整工作流。

## 2. 安装

```bash
npm i -g @cloudbase/cli
# 或
yarn global add @cloudbase/cli
# 或
pnpm add -g @cloudbase/cli
```

验证安装：
```bash
tcb --version
```

## 3. 登录

| 方式 | 命令 |
|------|------|
| 交互式登录（打开浏览器） | `tcb login` |
| API 密钥登录 | `tcb login --key` |
| CI 登录 | `tcb login --apiKeyId xxx --apiKey xxx` |
| 临时凭证 | `tcb login --apiKeyId xxx --apiKey xxx --token xxx` |

## 4. 部署命令

| 资源类型 | 命令 |
|----------|------|
| 云函数 | `tcb fn deploy [name]` / `tcb fn deploy --all` |
| 静态托管 | `tcb hosting deploy` |
| 云应用（含构建） | `tcb app deploy` |
| 云托管（容器） | `tcb cloudrun deploy` |
| 存储 | `tcb storage upload` |

## 5. 关键配置

- 配置文件：`cloudbaserc.json`（项目根目录，通过 `tcb init` 生成）
- 环境 ID 优先级：`--env-id` 参数 > 配置文件 > `tcb env use` 全局设置
- 常用全局参数：
  - `--env-id`：指定环境 ID
  - `--region`：指定地域
  - `--json`：结构化输出
  - `--yes`：跳过确认提示
  - `--verbose`：详细输出

## 6. 快速上手流程

```bash
# 1. 安装
npm i -g @cloudbase/cli

# 2. 登录
tcb login

# 3. 初始化项目（生成 cloudbaserc.json）
tcb init

# 4. 部署
tcb app deploy
```
