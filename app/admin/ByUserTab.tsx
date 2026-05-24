"use client";

import FilterBar from "@/app/components/FilterBar";
import ConfirmModal from "@/app/components/ConfirmModal";
import { isTopLevelResource } from "./lib";
import type { ResourceItem, DeptItem, SearchResult, EmployeePerm } from "./types";
import { useByUserTab } from "./useByUserTab";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: ResourceItem[];
  roles: Array<{ id: number; key: string; name: string; description: string | null }>;
  allDepts: DeptItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function ByUserTab({ user, resources, allDepts, showToast }: Props) {
  const s = useByUserTab(user, resources, allDepts, showToast);

  return (
    <div className="space-y-6">
      {/* ===== Section 1: Permission Card ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">权限卡片</h3>

        <SearchBox s={s} />

        {s.selectedUser ? (
          <>
            <SelectedUserInfo s={s} />
            <GlobalSwitches s={s} />
            <ScopedRoles s={s} />
          </>
        ) : (
          <p className="text-sm text-gray-400">请搜索并选择员工来查看权限卡片</p>
        )}
      </div>

      {/* ===== Section 2: Employee Roster Table ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">员工权限列表</h3>
        <FilterControls s={s} />
        <RosterTable s={s} />
      </div>

      {/* ===== Confirm Modal: Password Reset ===== */}
      <PasswordResetModal s={s} />
    </div>
  );
}

/* ─── Sub-components ─── */

function SearchBox({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <div className="relative mb-4">
      <input
        type="text" placeholder="搜索员工姓名/工号…"
        value={s.searchQuery}
        onChange={(e) => s.handleSearchChange(e.target.value)}
        onFocus={() => { if (s.searchResults.length > 0) s.setShowDropdown(true); }}
        onBlur={() => setTimeout(() => s.setShowDropdown(false), 200)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
      />
      {s.searchLoading && <span className="absolute right-3 top-2.5 text-xs text-gray-400">搜索中…</span>}
      {s.showDropdown && s.searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {s.searchResults.map((item, idx) => (
            <button
              key={`${item.employeeId}-${item.rowId}-${idx}`}
              onMouseDown={(e) => { e.preventDefault(); s.handleSelectUser(item); }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50"
            >
              <span className="font-medium text-gray-800">{item.name}</span>
              <span className="text-xs text-gray-400">{item.employeeId}</span>
              {item.dept1 && <span className="text-xs text-gray-500">{item.dept1}</span>}
              {item.position && <span className="text-xs text-gray-400">{item.position}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedUserInfo({ s }: { s: ReturnType<typeof useByUserTab> }) {
  const perms = s.getSelectedUserPerms();
  const user = s.selectedUser!;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gray-50 p-3">
      <span className="font-medium text-gray-800">{user.name}</span>
      <span className="text-xs text-gray-400">{user.employeeId}</span>
      {perms?.username && (
        <span className="text-xs text-gray-500">账号: {perms.username}</span>
      )}
      {(user.dept1 || user.position) && (
        <span className="text-xs text-gray-500">
          {[user.dept1, user.position].filter(Boolean).join(" / ")}
        </span>
      )}
      {perms && !perms.canLogin && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">已停用</span>
      )}
    </div>
  );
}

function GlobalSwitches({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <>
      <h4 className="mb-2 text-xs font-medium text-gray-500">全局开关</h4>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {s.topLevelResources.map((r) => {
          const perms = s.getSelectedUserPerms();
          const hasAccess = perms ? s.userHasAccess(perms, r.key) : false;
          return (
            <button key={r.key} title={r.description || r.name}
              onClick={() => s.togglePermission(s.selectedUser!.userId, r.key, hasAccess)}
              disabled={!s.selectedUser!.userId}
              className={`rounded-lg border p-3 text-center text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                hasAccess
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:border-emerald-200 hover:bg-emerald-50/50"
              }`}
            >
              <div className="font-medium">{r.name}</div>
              <div className={`mt-1 text-xs ${hasAccess ? "text-emerald-600" : "text-gray-400"}`}>
                {hasAccess ? "已授权" : "未授权"}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ScopedRoles({ s }: { s: ReturnType<typeof useByUserTab> }) {
  const perms = s.getSelectedUserPerms();
  if (!perms) return <p className="text-sm text-gray-400">未找到权限数据</p>;
  const scoped = perms.resourceRoles.filter(
    (rr) => rr.resource && !isTopLevelResource(rr.resource.key)
  );
  if (scoped.length === 0) return <p className="text-sm text-gray-400">无范围分配</p>;
  return (
    <>
      <h4 className="mb-2 text-xs font-medium text-gray-500">范围分配（只读）</h4>
      <div className="space-y-1.5">
        {scoped.map((rr, idx) => (
          <div key={`${rr.resource!.key}-${idx}`}
            className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm">
            <span className="text-gray-600">{rr.resource!.name}</span>
            <span className="text-xs text-gray-400">({rr.resource!.key})</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
              {rr.role!.name}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function FilterControls({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <FilterBar>
      <select value={s.companyFilter}
        onChange={(e) => { s.setCompanyFilter(e.target.value); s.setDeptFilter("全部"); }}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
        {s.companies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={s.deptFilter}
        onChange={(e) => s.setDeptFilter(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
        {s.deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <input type="text" placeholder="搜索姓名/工号/账号…"
        value={s.keywordFilter} onChange={(e) => s.setKeywordFilter(e.target.value)}
        className="min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
      />
      <select value={s.selectedParent}
        onChange={(e) => { s.setSelectedParent(e.target.value); s.setSelectedChild("__all__"); }}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
        {s.topLevelResources.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
      </select>
      {s.childrenOfParent.length > 0 && (
        <select value={s.selectedChild}
          onChange={(e) => s.setSelectedChild(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
          <option value="__all__">全部</option>
          {s.childrenOfParent.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      )}
      <select value={s.authFilter}
        onChange={(e) => s.setAuthFilter(e.target.value as "全部" | "已授权" | "未授权")}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
        <option value="全部">全部状态</option>
        <option value="已授权">已授权</option>
        <option value="未授权">未授权</option>
      </select>
    </FilterBar>
  );
}

function RosterTable({ s }: { s: ReturnType<typeof useByUserTab> }) {
  if (s.empPermLoading) {
    return <div className="mt-4 text-center"><p className="text-sm text-gray-400">加载中…</p></div>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <th className="whitespace-nowrap pb-2 pr-3">姓名 / 工号</th>
            <th className="whitespace-nowrap pb-2 pr-3">账号</th>
            <th className="whitespace-nowrap pb-2 pr-3">公司</th>
            <th className="whitespace-nowrap pb-2 pr-3">部门</th>
            <th className="whitespace-nowrap pb-2 pr-3">岗位</th>
            <th className="whitespace-nowrap pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {s.filteredEmpPerms.map((emp) => (
            <RosterRow key={`${emp.employeeId}-${emp.userId ?? "x"}`} emp={emp} s={s} />
          ))}
        </tbody>
      </table>
      {s.filteredEmpPerms.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-400">无匹配结果</p>
      )}
    </div>
  );
}

function RosterRow({ emp, s }: { emp: EmployeePerm; s: ReturnType<typeof useByUserTab> }) {
  const isAllMode = s.selectedChild === "__all__";
  const hasAccess = isAllMode
    ? s.getAllAccessState(emp)
    : s.userHasAccess(emp, s.selectedResource);

  // Deduplicate roles by company+dept+position
  const uniqueRoles = emp.roles.filter((r, i) =>
    i === emp.roles.findIndex(t => (t.company || "") === (r.company || "") && t.dept1 === r.dept1 && t.position === r.position)
  );

  async function handleToggle() {
    if (isAllMode) {
      const val = hasAccess;
      const targets = [s.selectedParent, ...s.childrenOfParent.map(c => c.key)];
      for (const key of targets) {
        await fetch("/api/admin/user-permissions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: emp.userId, resourceKey: key, roleKey: "access", value: !val }),
        });
      }
      s.showToast(!val ? `已授权 ${s.selectedParent} 全部` : `已取消 ${s.selectedParent} 全部`, "success");
    } else {
      await s.togglePermission(emp.userId, s.selectedResource, hasAccess);
    }
    await s.loadEmpPerms();
  }

  const btnLabel = hasAccess ? "已授权" : "未授权";
  const btnClass = hasAccess
    ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600"
    : "bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-600";

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="whitespace-nowrap py-2 pr-3">
        <div className="flex flex-col">
          <span className="font-medium text-gray-800">{emp.name}</span>
          <span className="text-xs text-gray-400">{emp.employeeId}</span>
        </div>
      </td>
      <td className="whitespace-nowrap py-2 pr-3">
        <span className="text-gray-600">{emp.username || "-"}</span>
        {!emp.canLogin && (
          <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-600">停</span>
        )}
      </td>
      <td className="py-2 pr-3 text-gray-600 text-xs leading-relaxed">
        {uniqueRoles.map((r, i) => <div key={i}>{r.company || "" || "-"}</div>)}
      </td>
      <td className="py-2 pr-3 text-gray-600 text-xs leading-relaxed">
        {uniqueRoles.map((r, i) => <div key={i}>{r.dept1 || "-"}</div>)}
      </td>
      <td className="py-2 pr-3 text-gray-600 text-xs leading-relaxed">
        {uniqueRoles.map((r, i) => <div key={i}>{r.position || "-"}</div>)}
      </td>
      <td className="whitespace-nowrap py-2">
        <button
          onClick={handleToggle}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${btnClass}`}>
          {btnLabel}
        </button>
        {s.user.isWorkListAdmin && emp.userId && (
          <button
            onClick={() => s.setPwdModal({
              open: true, userId: emp.userId,
              employeeId: emp.employeeId, name: emp.name,
            })}
            className="ml-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="重置密码">重置</button>
        )}
      </td>
    </tr>
  );
}

function PasswordResetModal({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <ConfirmModal
      open={s.pwdModal.open}
      title="重置密码"
      message={
        s.resetResult
          ? `${s.pwdModal.name} 的新密码已生成，请复制并妥善保管：\n\n${s.resetResult}`
          : `确定要重置 ${s.pwdModal.name} (${s.pwdModal.employeeId}) 的密码吗？重置后将生成随机密码。`
      }
      confirmLabel={s.resetResult ? "关闭" : "确定重置"}
      cancelLabel={s.resetResult ? "关闭" : "取消"}
      confirmDanger={!s.resetResult}
      onConfirm={() => {
        if (s.resetResult) {
          navigator.clipboard.writeText(s.resetResult).catch(() => {});
          s.setPwdModal({ open: false, userId: null, employeeId: "", name: "" });
          s.setResetResult(null);
          return;
        }
        if (s.pwdModal.userId) {
          s.handleResetPassword(s.pwdModal.userId, s.pwdModal.employeeId, s.pwdModal.name);
        }
      }}
      onCancel={() => {
        s.setPwdModal({ open: false, userId: null, employeeId: "", name: "" });
        s.setResetResult(null);
      }}
    />
  );
}
