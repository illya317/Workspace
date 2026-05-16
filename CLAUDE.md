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
   - 部署时如果服务器已有数据库，用 `./deploy.sh --push-db`（只同步 schema 结构，不覆盖数据）

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

## 禁止使用浏览器原生 confirm / alert

- **不要用** `window.confirm("确定删除？")` —— 会显示域名 + "says"，丑且无法定制样式
- **要用** 自定义确认框组件（如 admin/page.tsx 中的 `confirmModal` 模式）
- 项目中如有新加删除/危险操作确认，统一用自定义弹框

## 尽量用子 Agent 执行

- 复杂任务、多文件修改优先拆 Sub Agent 并行执行
- 节省主对话上下文，避免过长导致截断
- 主 Agent 负责任务拆分和结果验收
