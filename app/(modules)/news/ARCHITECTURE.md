# 资讯 Architecture

## Purpose

资讯是 Workspace 的外部信息入口，以每日简报聚合新闻条目；它不是传统交易台账，也不承载内部反馈流程。

## Ownership

- `app/(modules)/news/page.tsx` 是薄 App Router 入口。
- `packages/news/ui` 负责 Workspace 原生的标题列表与内容详情分栏。
- `packages/news/server/news-service.ts` 负责读取简报、权限校验和个人资讯偏好持久化。
- `packages/news/server/integrations/hotsearch-html-adapter.ts` 是远端 hotsearch 服务的兼容边界。
- `prisma/models/news.prisma` 只持久化 `NewsReaction`。

## Contracts

浏览器只调用 `/api/modules/news` 下受保护的 Workspace 路由，不直接调用 hotsearch，也不嵌入其 HTML。

- `GET /api/modules/news` 返回标准化简报与当前用户的资讯偏好。
- `POST /api/modules/news/reactions` 保存或取消当前用户对稳定资讯标识的喜欢/不喜欢。

`news.create` 是登录用户的默认自助动作，它隐含 entry/read，仅用于个人资讯偏好。

## Upstream boundary

当前 hotsearch 端点只暴露 HTML。目标由 `NEWS_PROVIDER_URL` 提供，或从 `WORKSPACE_PUBLIC_ORIGIN` 的 `/news/` 派生；业务包不包含租户 hostname。配置缺失或不安全时，简报降级为不可用。

适配器只接受 HTTPS（开发环境允许 loopback HTTP），最多跟随 3 次同源重定向，要求 `text/html`，解码内容上限 1 MB，并拒绝没有可识别条目的页面。原文链接只允许 HTTP(S)，条目标识由来源、标题和规范 URL 的 SHA-256 生成，不持久化 `deep-0` 一类位置 ID。

当 hotsearch 提供版本化 JSON contract 后，只替换 `NewsSourcePort` 后的适配器，UI 与个人偏好持久化保持不变。

## Failure behavior

hotsearch 超时或结构不匹配时，页面显示不可用状态；已保存的个人资讯偏好不会被清除。
