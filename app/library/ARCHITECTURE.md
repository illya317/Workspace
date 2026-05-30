# Library — 本地文件浏览器

## 状态：试验版 (Experimental)

当前为**本地文件系统**实现，通过配置适配任意文件夹。
未来可扩展为 S3/OSS 远程存储适配器。

## 架构

```
app/library/
  page.tsx            # 服务端组件：构建目录树，渲染 AppShell + LibraryClient
  LibraryClient.tsx   # 客户端组件：侧边栏目录树 + 右侧内容区
  ARCHITECTURE.md     # 本文件

app/api/library/[...path]/
  route.ts            # 文件下载 API：安全路径解析 + MIME 检测

server/services/library/
  config.ts           # 配置 + 路径安全 + readDirectory + buildTree
```

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LIBRARY_ROOT` | 文件根目录（绝对路径） | 无（不配置则不显示任何文件） |
| `LIBRARY_LABEL` | 页面标题和面包屑根节点名称 | `资料库` |

## 安全

- `safeResolve()` 使用 `path.resolve()` 规范化路径
- 验证解析后的绝对路径必须在 `LIBRARY_ROOT` 前缀内
- API 层双重校验：`safeResolve` + 二次 `startsWith` 检查
- 拒绝 `..` 路径穿越，返回 403 Forbidden

## 交互

- **左侧侧边栏**：仅显示文件夹树（递归），可折叠隐藏
- **右侧内容区**：显示当前目录下的文件夹和文件
- **点击文件夹**：纯客户端导航（`setCurrentPath`），不走 Next.js 路由
- **点击文件**：`<a>` 链接到 `/api/library/...` 触发下载/预览
- **面包屑**：点击任意层级导航到对应目录

## 未来扩展方向

1. **按需加载**：`readDirectory()` 已拆出，可改为 API 懒加载子目录，避免大目录一次递归
2. **多根目录**：`getLibraryRoots()` 已支持逗号分隔的多路径，前端可加根目录切换
3. **远程适配器**：将 `readDirectory` / `readFile` 抽象为接口，实现 S3/OSS adapter
4. **搜索**：文件名搜索（当前无索引）
5. **预览**：图片/PDF 内嵌预览而非直接下载
6. **权限**：按根目录粒度控制访问权限
