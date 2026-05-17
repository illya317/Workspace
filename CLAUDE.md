@AGENTS.md

---

# 部署事故复盘与避坑指南

## 2026-05-16 事故：服务完全宕机

### 现象
- 访问 `49.235.213.225:3000` 提示 "refused to connect"
- PM2 状态 `pid: N/A`，进程在反复重启（`↺: 3`）
- 端口 3000 无监听

### 根因（共 4 个）

1. **Schema 变更未同步到数据库**
   - `prisma/schema.prisma` 已将 `ReportGroupMember.departmentId` 改为 `userId`
   - 但从未执行 `npx prisma db push`
   - 导致代码查询 `userId` 时数据库报 `P2022: column does not exist`

2. **`.next/standalone` 目录丢失**
   - PM2 配置的执行路径是 `.next/standalone/server.js`
   - 服务器上该目录不存在，原因未知（推测被误删或 rsync --delete 波及）
   - 进程启动即崩溃

3. **`.env` 数据库路径是本地 macOS 路径**
   - `DATABASE_URL="file:/Users/koito/Desktop/Project/Weekly/prisma/dev.db"`
   - Linux 服务器上 `/Users` 目录不存在，SQLite 无法打开数据库

4. **生产数据库文件完全丢失**
   - 服务器上 `find / -name '*.db'` 找不到任何 SQLite 文件
   - `/home/ubuntu/weekly/prisma/` 目录不存在
   - 推测在某次部署中被 `rsync --delete` 或其他操作误删

### 修复步骤

```bash
# 1. 本地修正 .env 路径
sed -i 's|Weekly/prisma/dev.db|HR/prisma/dev.db|' .env

# 2. 本地同步 schema（ReportGroupMember departmentId -> userId）
npx prisma db push --accept-data-loss

# 3. 本地构建
npm run build

# 4. 复制静态资源到 standalone
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# 5. 同步构建产物到服务器（排除 .env）
rsync -avz --delete --exclude='.env' \
  .next/standalone/ ubuntu@SERVER:/home/ubuntu/weekly/.next/standalone/

# 6. 服务器上创建 prisma 目录、复制数据库、修正 .env
ssh ubuntu@SERVER "mkdir -p /home/ubuntu/weekly/prisma"
rsync -avz prisma/dev.db ubuntu@SERVER:/home/ubuntu/weekly/prisma/dev.db
ssh ubuntu@SERVER "cat > /home/ubuntu/weekly/.next/standalone/.env << 'EOF'
DATABASE_URL=\"file:/home/ubuntu/weekly/prisma/dev.db\"
...其他环境变量...
EOF"

# 7. 重启服务
pm2 restart weekly
```

### 避坑点

1. **Schema 变更后必须 `db push`**
   - 修改 `schema.prisma` 后，**先本地 `npx prisma db push`，再构建**
   - 部署时如果服务器已有数据库，必须加 `--push-db`：`./deploy.sh --push-db`
   - **普通 `./deploy.sh` 不会同步 schema**，只同步构建产物。漏掉 `--push-db` 会导致服务器数据库字段缺失，所有查询报 `P2022: column does not exist`
   - `--push-db` 只同步 schema 结构，不覆盖服务器数据

2. **rsync 永远不要包含 `.env`**
   - 本地 `.env` 路径是 macOS 绝对路径，会覆盖服务器配置
   - `deploy.sh` 已增加 `--exclude='.env'`

3. **数据库文件必须单独保护**
   - `prisma/dev.db` 不在 `.next/standalone/` 内，rsync 理论上不影响
   - 但如果有人对整个项目根目录做 `rsync --delete`，数据库会被删
   - **建议**：定期将 `prisma/dev.db` 备份到安全位置

4. **部署前检查清单**
   ```bash
   # 本地检查
   npx prisma db push      # schema 是否已同步
   npm run build           # 构建是否成功
   ls .next/standalone/    # standalone 目录是否存在

   # 服务器检查
   pm2 status              # 进程是否正常
   pm2 logs weekly --lines 20   # 有无报错
   curl -s http://SERVER:3000/login   # 是否可达
   ```

5. **`--push-db` 的正确用法**
   - `./deploy.sh --push-db` 会先拉取服务器 DB、本地 `db push` 改结构、再推回去
   - **这不会覆盖服务器数据**，只更新 schema
   - 前提是服务器上必须已有 `prisma/dev.db`，否则 rsync 拉取会失败

---

# 前端交互规范

## 共享组件（必须使用，禁止重复造轮子）

| 组件 | 用途 | 导入 |
|------|------|------|
| `ConfirmModal` | 确认弹框，替代 `window.confirm` | `@/app/components/ConfirmModal` |
| `EditToolbar` | 编辑工具栏（编辑→保存+取消+版本） | `@/app/components/EditToolbar` |
| `Toast` + `useToast` | 通知提示，替代裸 `setTimeout` | `@/app/components/Toast` + `@/app/hooks/useToast` |
| `FilterBar` | 筛选栏容器 | `@/app/components/FilterBar` |
| `DataTable` | 数据表格（可选用） | `@/app/components/DataTable` |

**规范**：
- 确认弹框统一用 `<ConfirmModal>`，禁止 `window.confirm` / `window.alert`
- 通知统一用 `useToast()`，禁止 `setTimeout(() => setSaveTip(""), 1500)`
- 表格编辑统一用 `<EditToolbar>` —— 编辑模式点"保存"后自动退出，点"取消"清除当前单元格编辑
- 公司名/编码统一从 `lib/company` 导入，禁止硬编码字符串

## 尽量用子 Agent 执行

- 复杂任务、多文件修改优先拆 Sub Agent 并行执行
- 主 Agent 负责任务拆分和结果验收
- **分配子 Agent 时必须在 prompt 中告知 `@CLAUDE.md` 或 `@AGENTS.md`**，确保子 Agent 了解项目规范、共享模块和避坑指南

---

# 业务规则

## 公司分组（统一从 `lib/company.ts` 导入）

- **丰华生物组**：`FENGHUA_BIO_GROUP` = 丰华生物、丰华天力通、丰华悦通、加拿大（共享数据）
- **丰华制药**：独立
- **编码前缀**：01 丰华生物, 02 丰华天力通, 03 丰华悦通, 04 丰华制药, 05 加拿大
- `SHARED_GROUP_CODES` = ["01","02","03"]（共享存储）

## 公司名清洗

- `制药` → `丰华制药`, `江苏制药` → `丰华制药`, 其他保持原名

---

# 共享工具模块

## 拼音搜索 (`lib/search.ts`)

```typescript
import { getInitials, matchEmployee } from "@/lib/search";
```

## 公司常量 (`lib/company.ts`)

```typescript
import { CODE_TO_NAME, NAME_TO_CODE, FENGHUA_BIO_GROUP, SHARED_GROUP_CODES, resolveCompanyFilter, getCompanyFromCode } from "@/lib/company";
```

禁止在页面/API中硬编码公司名、公司编码、分组逻辑。

## 认证与权限 (`lib/auth.ts`)

```typescript
import { authenticate, requireAdmin, isAdmin, checkPermission, isGroupAdmin } from "@/lib/auth";
```

API 路由统一使用这些 helpers，禁止在路由中定义本地 `requireAdmin`。

## 周期计算 (`lib/period.ts`)

```typescript
import { getCurrentPeriod, getPeriodRange, getPreviousPeriod, getPeriodOptions, getYearOptions, getPeriodTypeName } from "@/lib/period";
import type { PeriodType, PeriodInfo } from "@/lib/period";
```

支持 `daily` | `weekly` | `monthly` | `quarterly` | `yearly` 五种周期，用于报告页面的日期选择器和标题自适应。

## RBAC 常量 (`lib/permissions.ts`)

```typescript
import { RES, ROLE, perm } from "@/lib/permissions";
```

`RES` = Resource key 树（system/people/docs/work/finance 及其子资源），`ROLE` = 5 种角色 key（access/read/write/delete/admin），`perm` = 向后兼容的扁平权限字符串。

## Prisma 客户端 (`lib/prisma.ts`)

```typescript
import { prisma } from "@/lib/prisma";
```

全局单例 PrismaClient，禁止在页面/API中重复创建。

## 周计算 (`lib/week.ts`)

```typescript
import { getCurrentWeekInfo, getWeekRange } from "@/lib/week";
```

仅用于 `week-info` API 端点，周报页面已迁移到 `lib/period.ts`。
