# HR 项目代码审查 2026-05-18

## API 测试结果 ✅

| API | Status | 数据 |
|-----|--------|------|
| `/api/auth/dev-login` | ✅ | admin 登录成功 |
| `/api/admin/permissions` | ✅ | system=175, people=5, work=175, docs=0, finance=0 |
| `/api/projects` | ✅ | 10 个项目 |
| `/api/my-targets` | ✅ | 50部门, 10项目, 145岗位 |
| `/api/admin/employee-permissions` | ✅ | 168 员工 |
| `/api/employees?export=1` | ✅ | Excel 200 OK, 160KB |
| `/api/employees/search` | ✅ | 20 结果 |

---

## 解耦优化建议

### 1. 🔴 User interface 重复 13 次（最高优先级）

| 文件 | 行 | 字段数 |
|------|-----|--------|
| `app/hr/page.tsx` | 15 | 3 |
| `app/hr/CodeTab.tsx` | 11 | 4 |
| `app/hr/useCodeTab.ts` | 11 | 4 |
| `app/hr/EmployeeTab.tsx` | 10 | 4 |
| `app/hr/PositionTab.tsx` | 10 | 4 |
| `app/hr/RosterTab.tsx` | 9 | 4 |
| `app/hr/ProjectTab.tsx` | 23 | 3 |
| `app/hr/ProjectInfoTab.tsx` | 22 | 3 |
| `app/works/page.tsx` | 17 | 4 |
| `app/history/page.tsx` | 33 | 3 |
| `app/portal/page.tsx` | 9 | 4 |
| `app/components/UserMenu.tsx` | 6 | 3 |
| `app/api-guide/page.tsx` | 10 | 3 |

**建议**: 抽 `app/hr/types.ts` → 其他文件 import

### 2. 🟡 Employee interface 重复 4 次

`app/hr/RosterTab.tsx`, `app/hr/EmployeeTab.tsx`, `app/hr/CodeTab.tsx`, `app/hr/useCodeTab.ts`

**建议**: 统一到 `app/hr/types.ts`

### 3. 🟡 CodeTab.tsx + useCodeTab.ts（942行）

- CodeTab.tsx 521行 + useCodeTab.ts 421行
- 表单的 2 个 inline 分组（丰华生物/制药）可抽为 `CodeGroupTable`
- 编码详情弹窗可复用 `DetailModal`

### 4. 🟢 works/page.tsx（408行）

已经拆了大部分子组件。`WorkForm` 可进一步抽到独立 hook。

### 5. 🟢 lib/week.ts 可标记废弃

只剩 `api/week-info` 在用，报告已迁移到 `lib/period.ts`。

---

## 今日完成

- ✅ ReportGroup 消灭，Report 直接 targetType+targetId
- ✅ TargetSwitcher 两段选择器
- ✅ SearchBox + useSearch 统一搜索
- ✅ DetailModal 通用弹窗
- ✅ Admin 权限树无限下钻 + 员工卡片
- ✅ UserResourceRole 去重（390→175）
- ✅ Project 多对多 Department
- ✅ SUBAGENT.md 子 Agent 速查卡
- ✅ 全部 console.log 清理
- ✅ `window.location.reload()` 全消灭
