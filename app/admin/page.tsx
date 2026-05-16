"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { matchEmployee } from "@/lib/search";

interface User {
  id: number;
  username: string;
  name: string;
  company: string | null;
  departmentName: string | null;
  departmentId: number;
  isWorkListAdmin: boolean;
  canAccessHR: boolean;
  employeeId: string | null;
}

interface Dept {
  id: number;
  name: string;
  company: string;
  count: number;
}

interface ReportGroup {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  departmentId: number | null;
  department: { id: number; name: string } | null;
  _count: { members: number; viewers: number; reports: number };
}

interface DepartmentAdmin {
  id: number;
  dept1: string;
  company: string;
  userId: number;
  user: {
    id: number;
    name: string;
    username: string;
    employeeId: string | null;
  };
}

interface Department {
  id: number;
  name: string;
  company: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [allDepts, setAllDepts] = useState<Dept[]>([]);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"depts" | "permission-table">("depts");

  // 人员权限（花名册表格）
  const [empPerms, setEmpPerms] = useState<
    Array<{
      employeeId: string;
      name: string;
      roles: { company: string | null; dept1: string | null; dept2: string | null; position: string | null }[];
      canLogin: boolean;
      isWorkListAdmin: boolean;
      canAccessHR: boolean;
      hasApiKey: boolean;
      userId: number | null;
      username: string | null;
    }>
  >([]);
  const [empPermLoading, setEmpPermLoading] = useState(false);
  const [selectedPerm, setSelectedPerm] = useState("isWorkListAdmin");
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "error" | "success" }>({ show: false, message: "", type: "error" });

  // 筛选
  const [filterCompany, setFilterCompany] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 周报管理
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [groupMembers, setGroupMembers] = useState<Array<{ userId: number; name: string; dept1: string; position: string }>>([]);
  const [groupAdmins, setGroupAdmins] = useState<Array<{ id: number; name: string; dept1: string; position: string }>>([]);
  const [adminUserIds, setAdminUserIds] = useState<number[]>([]);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<Array<{ rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }>>([]);
  const [memberSearchTimer, setMemberSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminSearchResults, setAdminSearchResults] = useState<Array<{ rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }>>([]);
  const [adminSearchTimer, setAdminSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);

  // 管理员（系统+部门）
  const [sysAdmins, setSysAdmins] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptAdmins, setDeptAdmins] = useState<DepartmentAdmin[]>([]);
  const [deptAdminCompany, setDeptAdminCompany] = useState("");
  const [sysAdminSearchQuery, setSysAdminSearchQuery] = useState("");
  const [sysAdminSearchResults, setSysAdminSearchResults] = useState<Array<{ rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }>>([]);
  const [sysAdminSearchTimer, setSysAdminSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [deptAdminSearchQuery, setDeptAdminSearchQuery] = useState("");
  const [deptAdminSearchResults, setDeptAdminSearchResults] = useState<Array<{ rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }>>([]);
  const [deptAdminSearchTimer, setDeptAdminSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [addingDeptAdmin, setAddingDeptAdmin] = useState<{ name: string; company: string } | null>(null);

  // 权限面板视图
  const [permView, setPermView] = useState<"by-user" | "by-permission">("by-permission");
  const [permSearchQuery, setPermSearchQuery] = useState("");
  const [permSearchResults, setPermSearchResults] = useState<User[]>([]);
  const [selectedPermission, setSelectedPermission] = useState("");
  const [selectedUserPerm, setSelectedUserPerm] = useState<User | null>(null);
  const [permListSearchQuery, setPermListSearchQuery] = useState("");

  const allPermissions = [
    { key: "isWorkListAdmin", label: "超级管理员", desc: "管理后台全部权限" },
    { key: "canLogin", label: "可登录", desc: "能否登录系统" },
    { key: "canAccessHR", label: "人事行政", desc: "访问人事行政管理" },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const u = data.user;
        if (!u?.isWorkListAdmin && !u?.isAnyGroupAdmin) {
          router.push("/dashboard");
          return;
        }
        setUser(u);
        loadData();
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (activeTab === "permission-table") {
      loadAdminData();
      loadEmpPermData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (user?.isWorkListAdmin) {
      setPermView("by-user");
    }
  }, [user?.isWorkListAdmin]);

  async function loadData() {
    const [usersRes, groupsRes, deptsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/report-groups"),
      fetch("/api/admin/departments"),
    ]);
    const usersData = await usersRes.json();
    const groupsData = await groupsRes.json();
    const deptsData = await deptsRes.json();
    setUsers(usersData.users || []);
    setReportGroups(groupsData.groups || []);
    setAllDepts(deptsData.departments || []);
    setLoading(false);
  }

  async function loadAdminData() {
    const res = await fetch("/api/admin/department-admins");
    if (res.ok) {
      const data = await res.json();
      setDepartments(data.departments || []);
      setDeptAdmins(data.admins || []);
    }
    const usersRes = await fetch("/api/admin/users");
    if (usersRes.ok) {
      const data = await usersRes.json();
      setSysAdmins((data.users || []).filter((u: User) => u.isWorkListAdmin));
      setUsers(data.users || []);
    }
  }

  async function loadEmpPermData() {
    setEmpPermLoading(true);
    const res = await fetch("/api/admin/employee-permissions");
    if (res.ok) {
      const data = await res.json();
      setEmpPerms(data.employees || []);
    }
    setEmpPermLoading(false);
  }

  async function toggleEmpPerm(
    emp: {
      employeeId: string;
      name: string;
      userId: number | null;
      canLogin: boolean;
      isWorkListAdmin: boolean;
      canAccessHR: boolean;
    },
    field: "canLogin" | "isWorkListAdmin" | "canAccessHR"
  ) {
    const res = await fetch("/api/admin/employee-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: emp.employeeId,
        name: emp.name,
        [field]: !emp[field],
      }),
    });
    if (res.ok) {
      setEmpPerms((prev) =>
        prev.map((e) =>
          e.employeeId === emp.employeeId ? { ...e, [field]: !e[field] } : e
        )
      );
    } else {
      showToast("更新失败");
    }
  }

  function showToast(message: string, type: "error" | "success" = "error") {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  }

  async function toggleUserPerm(userId: number, field: string, currentValue: boolean) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, field, value: !currentValue }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, [field]: !currentValue } : u))
      );
      if (selectedUserPerm?.id === userId) {
        setSelectedUserPerm((prev) => (prev ? { ...prev, [field]: !currentValue } : null));
      }
    } else {
      showToast("更新失败");
    }
  }

  async function searchPermUsers(query: string) {
    if (!query.trim()) {
      setPermSearchResults([]);
      return;
    }
    const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      setPermSearchResults([]);
      return;
    }
    const data = await res.json();
    const matchedUserIds = new Set(
      (data.items || [])
        .map((item: { userId: number | null }) => item.userId)
        .filter(Boolean)
    );
    const results = users.filter((u) => matchedUserIds.has(u.id));
    setPermSearchResults(results.slice(0, 10));
  }

  async function createGroup() {
    if (!editName.trim()) return showToast("名称不能为空");
    const res = await fetch("/api/report-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    if (res.ok) {
      setEditName("");
      loadData();
    } else {
      showToast("创建失败");
    }
  }

  async function updateGroup(id: number) {
    if (!editName.trim()) return showToast("名称不能为空");
    const res = await fetch(`/api/report-groups/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, departmentId: editDeptId }),
    });
    if (res.ok) {
      await loadData();
      await selectGroup(id);
    } else {
      showToast("更新失败");
    }
  }

  async function reorderGroups(dragId: number, dropId: number) {
    if (dragId === dropId) return;
    const dragIndex = reportGroups.findIndex((g) => g.id === dragId);
    const dropIndex = reportGroups.findIndex((g) => g.id === dropId);
    if (dragIndex === -1 || dropIndex === -1) return;

    const newGroups = [...reportGroups];
    const [removed] = newGroups.splice(dragIndex, 1);
    newGroups.splice(dropIndex, 0, removed);

    const orders = newGroups.map((g, i) => ({ id: g.id, sortOrder: i }));
    const res = await fetch("/api/report-groups/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders }),
    });
    if (res.ok) {
      setReportGroups(newGroups);
    } else {
      showToast("排序保存失败");
    }
  }

  async function deleteGroup(id: number) {
    const res = await fetch(`/api/report-groups/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadData();
    } else {
      showToast("删除失败");
    }
  }

  async function selectGroup(groupId: number | null) {
    setSelectedGroupId(groupId);
    setIsEditingGroup(false);
    setMemberSearchQuery("");
    setMemberSearchResults([]);

    if (!groupId) {
      setGroupMembers([]);
      setGroupAdmins([]);
      setAdminUserIds([]);
      setEditName("");
      setEditDescription("");
      setEditSortOrder(0);
      return;
    }

    const group = reportGroups.find((g) => g.id === groupId);
    setEditName(group?.name || "");
    setEditDescription(group?.description || "");
    setEditSortOrder(group?.sortOrder || 0);
    setEditDeptId(group?.departmentId ?? null);

    const [membersRes, adminsRes] = await Promise.all([
      fetch(`/api/report-groups/${groupId}/members`),
      fetch(`/api/report-groups/${groupId}/admins`),
    ]);
    const membersData = await membersRes.json();
    const adminsData = await adminsRes.json();
    setGroupMembers(membersData.members || []);
    setGroupAdmins(adminsData.admins || []);
    setAdminUserIds((adminsData.admins || []).map((a: { id: number }) => a.id));
  }

  async function saveMembers(groupId: number) {
    const userIds = groupMembers.map((m) => m.userId);
    const res = await fetch(`/api/report-groups/${groupId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "保存填写人员失败" }));
      setToast({ show: true, message: data.error || "保存填写人员失败", type: "error" });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
    } else {
      setToast({ show: true, message: "保存成功", type: "success" });
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2000);
    }
  }

  async function searchEmployees(query: string) {
    if (!query.trim()) {
      setMemberSearchResults([]);
      return;
    }
    const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setMemberSearchResults(data.items || []);
  }

  function addMember(emp: { rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }) {
    if (!emp.userId) {
      showToast("该员工尚未关联系统用户，无法添加");
      return;
    }
    if (groupMembers.some((m) => m.userId === emp.userId)) return;
    setGroupMembers([
      ...groupMembers,
      { userId: emp.userId, name: emp.name, dept1: emp.dept1, position: emp.position },
    ]);
    setMemberSearchQuery("");
    setMemberSearchResults([]);
  }

  function removeMember(userId: number) {
    setGroupMembers(groupMembers.filter((m) => m.userId !== userId));
  }

  async function searchAdmins(query: string) {
    if (!query.trim()) {
      setAdminSearchResults([]);
      return;
    }
    const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setAdminSearchResults(data.items || []);
  }

  function addAdmin(emp: { rowId: number; employeeId: string; name: string; dept1: string; position: string; userId: number | null }) {
    if (!emp.userId) {
      showToast("该员工尚未关联系统用户，无法设置为负责人");
      return;
    }
    if (adminUserIds.includes(emp.userId)) return;
    setAdminUserIds([...adminUserIds, emp.userId]);
    setGroupAdmins([...groupAdmins, { id: emp.userId, name: emp.name, dept1: emp.dept1, position: emp.position }]);
    setAdminSearchQuery("");
    setAdminSearchResults([]);
  }

  function removeAdmin(userId: number) {
    setAdminUserIds(adminUserIds.filter((id) => id !== userId));
    setGroupAdmins(groupAdmins.filter((a) => a.id !== userId));
  }

  async function saveAdmins(groupId: number) {
    const res = await fetch(`/api/report-groups/${groupId}/admins`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: adminUserIds }),
    });
    if (!res.ok) showToast("保存周报管理员失败");
  }

  async function removeSysAdmin(userId: number) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isWorkListAdmin: false }),
    });
    if (res.ok) {
      setSysAdmins(sysAdmins.filter((u) => u.id !== userId));
      setUsers(users.map((u) => (u.id === userId ? { ...u, isWorkListAdmin: false } : u)));
      showToast("已移除系统管理员", "success");
    } else {
      showToast("移除失败");
    }
  }

  async function addSysAdmin(userId: number) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isWorkListAdmin: true }),
    });
    if (res.ok) {
      await loadAdminData();
      setSysAdminSearchQuery("");
      setSysAdminSearchResults([]);
      showToast("已添加系统管理员", "success");
    } else {
      showToast("添加失败");
    }
  }

  async function searchSysAdmins(query: string) {
    if (!query.trim()) {
      setSysAdminSearchResults([]);
      return;
    }
    const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setSysAdminSearchResults(data.items || []);
  }

  async function removeDeptAdmin(adminId: number) {
    const res = await fetch(`/api/admin/department-admins?id=${adminId}`, { method: "DELETE" });
    if (res.ok) {
      setDeptAdmins(deptAdmins.filter((a) => a.id !== adminId));
      showToast("已移除部门管理员", "success");
    } else {
      showToast("移除失败");
    }
  }

  async function addDeptAdmin(name: string, company: string, userId: number) {
    const res = await fetch("/api/admin/department-admins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dept1: name, company, userId }),
    });
    if (res.ok) {
      await loadAdminData();
      setDeptAdminSearchQuery("");
      setDeptAdminSearchResults([]);
      setAddingDeptAdmin(null);
      showToast("已添加部门管理员", "success");
    } else {
      const data = await res.json().catch(() => ({ error: "添加失败" }));
      showToast(data.error || "添加失败");
    }
  }

  async function searchDeptAdmins(query: string) {
    if (!query.trim()) {
      setDeptAdminSearchResults([]);
      return;
    }
    const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setDeptAdminSearchResults(data.items || []);
  }

  async function resetPassword(targetUser: { id: number; name: string; username?: string | null }) {
    setConfirmModal({
      open: true,
      title: "重置密码确认",
      message: `确定重置 ${targetUser.name} (${targetUser.username || ""}) 的密码？`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/users/${targetUser.id}`, { method: "POST" });
        const data = await res.json();
        if (res.ok) {
          setResetResult({ name: targetUser.name, password: data.password });
        } else {
          showToast(data.error || "重置失败");
        }
        setConfirmModal((prev) => ({ ...prev, open: false }));
      },
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <NavLink href="/dashboard">填写周报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">管理后台</h1>

        {/* Tab */}
        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("depts")}
            className={`pb-2 text-sm font-medium ${activeTab === "depts" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            周报管理
          </button>
          <button
            onClick={() => setActiveTab("permission-table")}
            className={`pb-2 text-sm font-medium ${activeTab === "permission-table" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            权限管理
          </button>
        </div>

        {activeTab === "depts" && (
          <div className="space-y-4">
            {/* 新建（仅超级管理员） */}
            {user?.isWorkListAdmin && (
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-end gap-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="新建周报部门"
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    onClick={createGroup}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                  >
                    创建
                  </button>
                </div>
              </div>
            )}

            {/* 标签列表 */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {reportGroups.map((g) => (
                  <span
                    key={g.id}
                    draggable={user?.isWorkListAdmin}
                    onDragStart={() => setDraggedGroupId(g.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedGroupId !== null) {
                        reorderGroups(draggedGroupId, g.id);
                        setDraggedGroupId(null);
                      }
                    }}
                    onClick={() => selectGroup(g.id)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-sm ${
                      selectedGroupId === g.id
                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    } ${user?.isWorkListAdmin ? "cursor-move" : ""}`}
                  >
                    {g.name}
                    {user?.isWorkListAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmModal({
                            open: true,
                            title: "删除确认",
                            message: `确定删除「${g.name}」周报部门？`,
                            onConfirm: () => {
                              deleteGroup(g.id);
                              setConfirmModal((prev) => ({ ...prev, open: false }));
                            },
                          });
                        }}
                        className="ml-1 text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* 选中部门详情 */}
            {selectedGroupId !== null && (() => {
              const selectedGroup = reportGroups.find((g) => g.id === selectedGroupId);
              if (!selectedGroup) return null;
              const isAdminOfSelected = user?.isWorkListAdmin || groupAdmins.some((a) => a.id === user?.id);
              const canEdit = user?.isWorkListAdmin || isAdminOfSelected;
              return (
                <div className="space-y-4">
                  {/* 基本信息 */}
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {isEditingGroup ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="名称"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                          />
                        ) : (
                          <div>
                            <h3 className="text-base font-semibold text-gray-800">{selectedGroup.name}</h3>
                            {selectedGroup.description && (
                              <p className="text-xs text-gray-500">{selectedGroup.description}</p>
                            )}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => setIsEditingGroup(!isEditingGroup)}
                          className="ml-3 shrink-0 text-xs text-emerald-600 hover:text-emerald-800"
                        >
                          {isEditingGroup ? "取消" : "设置"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 相关部门 */}
                  {canEdit && (
                    <div className="rounded-lg bg-white p-4 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">相关部门</h3>
                      {isEditingGroup ? (
                        <select
                          value={editDeptId ?? ""}
                          onChange={(e) => setEditDeptId(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                        >
                          <option value="">不关联部门</option>
                          {allDepts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.company})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedGroup.department ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                              {selectedGroup.department.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">未关联部门</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 负责人 */}
                  {user?.isWorkListAdmin && (
                    <div className="rounded-lg bg-white p-4 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">负责人</h3>

                      {isEditingGroup && (
                        <div className="relative mb-3">
                          <input
                            type="text"
                            value={adminSearchQuery}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdminSearchQuery(val);
                              if (adminSearchTimer) clearTimeout(adminSearchTimer);
                              const timer = setTimeout(() => searchAdmins(val), 300);
                              setAdminSearchTimer(timer);
                            }}
                            placeholder="输入姓名搜索花名册..."
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                          />
                          {adminSearchResults.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg">
                              {adminSearchResults.map((emp) => (
                                <div
                                  key={`admin-${emp.rowId}-${emp.dept1}-${emp.position}`}
                                  onClick={() => { if (emp.userId) addAdmin(emp); }}
                                  className={`px-3 py-2 text-sm text-gray-800 ${emp.userId ? "cursor-pointer hover:bg-gray-50" : "pointer-events-none opacity-50"}`}
                                >
                                  {emp.name}-{emp.dept1 || "未知部门"}-{emp.position || "未知职务"}
                                  {!emp.userId && <span className="text-gray-400"> (未关联用户)</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mb-3 flex flex-wrap gap-2">
                        {groupAdmins.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
                          >
                            {a.name}
                            {isEditingGroup && (
                              <button
                                onClick={() => removeAdmin(a.id)}
                                className="ml-1 text-emerald-500 hover:text-emerald-800"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                        {groupAdmins.length === 0 && (
                          <span className="text-xs text-gray-400">暂未选择负责人</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 填写人员 */}
                  {isAdminOfSelected && (
                    <div className="rounded-lg bg-white p-4 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">填写人员</h3>

                      {isEditingGroup && (
                        <div className="relative mb-3">
                          <input
                            type="text"
                            value={memberSearchQuery}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMemberSearchQuery(val);
                              if (memberSearchTimer) clearTimeout(memberSearchTimer);
                              const timer = setTimeout(() => searchEmployees(val), 300);
                              setMemberSearchTimer(timer);
                            }}
                            placeholder="输入姓名搜索花名册..."
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                          />
                          {memberSearchResults.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg">
                              {memberSearchResults.map((emp) => (
                                <div
                                  key={`member-${emp.rowId}-${emp.dept1}-${emp.position}`}
                                  onClick={() => { if (emp.userId) addMember(emp); }}
                                  className={`px-3 py-2 text-sm text-gray-800 ${emp.userId ? "cursor-pointer hover:bg-gray-50" : "pointer-events-none opacity-50"}`}
                                >
                                  {emp.name}-{emp.dept1 || "未知部门"}-{emp.position || "未知职务"}
                                  {!emp.userId && <span className="text-gray-400"> (未关联用户)</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mb-3 flex flex-wrap gap-2">
                        {groupMembers.map((m) => (
                          <span
                            key={m.userId}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
                          >
                            {m.name}
                            {isEditingGroup && (
                              <button
                                onClick={() => removeMember(m.userId)}
                                className="ml-1 text-emerald-500 hover:text-emerald-800"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                        {groupMembers.length === 0 && (
                          <span className="text-xs text-gray-400">暂无填写人员</span>
                        )}
                      </div>

                      {isEditingGroup && (
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              await Promise.all([
                                updateGroup(selectedGroupId),
                                saveAdmins(selectedGroupId),
                                saveMembers(selectedGroupId),
                              ]);
                              setIsEditingGroup(false);
                              setAdminSearchQuery("");
                              setAdminSearchResults([]);
                              setMemberSearchQuery("");
                              setMemberSearchResults([]);
                              selectGroup(selectedGroupId);
                            }}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingGroup(false);
                              setAdminSearchQuery("");
                              setAdminSearchResults([]);
                              setMemberSearchQuery("");
                              setMemberSearchResults([]);
                              selectGroup(selectedGroupId);
                            }}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "permission-table" && (
          <div className="space-y-4">
            {/* 视图切换（仅管理员可见） */}
            {user?.isWorkListAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPermView("by-user");
                    setSelectedPermission("");
                    setSelectedUserPerm(null);
                  }}
                  className={`rounded-md px-4 py-2 text-sm ${
                    permView === "by-user"
                      ? "bg-emerald-600 text-white"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  按员工
                </button>
                <button
                  onClick={() => {
                    setPermView("by-permission");
                    setSelectedUserPerm(null);
                    setPermSearchQuery("");
                    setPermSearchResults([]);
                  }}
                  className={`rounded-md px-4 py-2 text-sm ${
                    permView === "by-permission"
                      ? "bg-emerald-600 text-white"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  按权限
                </button>
              </div>
            )}

            {/* 按员工视图 */}
            {permView === "by-user" && (
              <div className="space-y-4">
                {/* 搜索 + 权限卡片 */}
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">搜索员工</h3>
                  <div className="relative mb-3">
                    <input
                      type="text"
                      value={permSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPermSearchQuery(val);
                        void searchPermUsers(val);
                      }}
                      placeholder="输入姓名、用户名或工号搜索..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                    />
                    {permSearchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg">
                        {permSearchResults.map((u) => (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedUserPerm(u);
                              setPermSearchResults([]);
                              setPermSearchQuery("");
                            }}
                            className="cursor-pointer px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {u.name} ({u.username}) · {u.departmentName || "无部门"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedUserPerm && (
                    <div className="rounded-md border border-gray-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <span className="text-base font-semibold text-gray-800">{selectedUserPerm.name}</span>
                          <span className="ml-2 text-sm text-gray-500">({selectedUserPerm.username})</span>
                        </div>
                        <button
                          onClick={() => setSelectedUserPerm(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          清除
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {allPermissions.map((p) => {
                          const hasPerm = (selectedUserPerm as any)[p.key] === true;
                          return (
                            <div
                              key={p.key}
                              onClick={() => toggleUserPerm(selectedUserPerm.id, p.key, hasPerm)}
                              className={`cursor-pointer rounded-md px-3 py-2 text-sm ${
                                hasPerm
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-gray-50 text-gray-400"
                              }`}
                            >
                              <div className="font-medium">{p.label}</div>
                              <div className="text-xs">{hasPerm ? "已开启" : "未开启"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 花名册表格 */}
                <div className="space-y-4">
                  {resetResult && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-medium text-emerald-800">
                        {resetResult.name} 的密码已重置为：
                        <span className="ml-2 font-mono text-lg font-bold">{resetResult.password}</span>
                      </p>
                      <p className="mt-1 text-xs text-emerald-600">请妥善保存，此信息仅显示一次。</p>
                      <button
                        onClick={() => setResetResult(null)}
                        className="mt-2 text-xs text-emerald-700 hover:underline"
                      >
                        关闭
                      </button>
                    </div>
                  )}

                  {/* 筛选 */}
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
                    <select
                      value={filterCompany}
                      onChange={(e) => { setFilterCompany(e.target.value); setFilterDept(""); }}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none sm:w-auto"
                    >
                      <option value="">所有公司</option>
                      <option value="丰华生物">丰华生物</option>
                      <option value="丰华制药">丰华制药</option>
                    </select>
                    <select
                      value={filterDept}
                      onChange={(e) => setFilterDept(e.target.value)}
                      disabled={!filterCompany}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 sm:w-auto"
                    >
                      <option value="">{filterCompany ? "所有部门" : "请先选择公司"}</option>
                      {[...new Set(
                        (() => {
                          if (!filterCompany) return [];
                          const subs = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];
                          const isSub = subs.includes(filterCompany);
                          return empPerms
                            .filter(e => e.roles.some(r =>
                              isSub ? subs.includes(r.company || "") : r.company === filterCompany
                            ))
                            .flatMap(e => e.roles.map(r => r.dept1))
                            .filter(Boolean);
                        })()
                      )].map(d => (
                        <option key={d} value={d!}>{d}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="搜索姓名、工号或账号"
                      className="w-full flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none sm:min-w-[200px]"
                    />
                    <select
                      value={selectedPerm}
                      onChange={(e) => setSelectedPerm(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none sm:w-auto"
                    >
                      {allPermissions.map(p => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { setFilterCompany(""); setFilterDept(""); setSearchKeyword(""); setSelectedPerm("canLogin"); }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 sm:w-auto"
                    >
                      重置
                    </button>
                  </div>

                  <div className="rounded-lg bg-white shadow-sm">
                    {empPermLoading ? (
                      <p className="p-8 text-center text-gray-500">加载中...</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">姓名/账号</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">公司/部门/职务</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-600">{allPermissions.find(p => p.key === selectedPerm)?.label}</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empPerms
                            .filter(e => {
                              if (filterCompany) {
                                const subs = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];
                                const isSub = subs.includes(filterCompany);
                                if (!e.roles.some(r => isSub ? subs.includes(r.company || "") : r.company === filterCompany)) return false;
                              }
                              if (filterDept && !e.roles.some(r => r.dept1 === filterDept)) return false;
                              if (searchKeyword) {
                                const kw = searchKeyword.toLowerCase();
                                return (
                                  e.name.toLowerCase().includes(kw) ||
                                  e.employeeId.toLowerCase().includes(kw) ||
                                  (e.username?.toLowerCase().includes(kw) ?? false)
                                );
                              }
                              return true;
                            })
                            .sort((a, b) => (a.employeeId || "").localeCompare(b.employeeId || ""))
                            .map((e) => {
                              const permValue = (e as any)[selectedPerm] === true;
                              return (
                                <tr key={e.employeeId} className="border-b last:border-0">
                                  <td className="px-4 py-3">
                                    <div className="text-gray-700">{e.name}</div>
                                    <div className="text-xs text-gray-400">{e.employeeId || e.username || "-"}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {e.roles.map((r, idx) => (
                                      <div key={idx} className={idx > 0 ? "mt-1" : ""}>
                                        <span className="text-gray-500">
                                          {[r.company, r.dept2 ? `${r.dept1}/${r.dept2}` : r.dept1, r.position].filter(Boolean).join(" · ")}
                                        </span>
                                      </div>
                                    ))}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => toggleEmpPerm(e, selectedPerm as any)}
                                      disabled={!e.userId}
                                      className={`rounded-full px-2 py-0.5 text-xs ${permValue ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"} ${!e.userId ? "opacity-50 cursor-not-allowed" : ""}`}
                                    >
                                      {permValue ? "是" : "否"}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {e.userId ? (
                                      <button
                                        onClick={() =>
                                          setConfirmModal({
                                            open: true,
                                            title: "重置密码确认",
                                            message: `确定重置 ${e.name} 的密码？`,
                                            onConfirm: async () => {
                                              const res = await fetch(`/api/admin/users/${e.userId}`, { method: "POST" });
                                              const data = await res.json();
                                              if (res.ok) {
                                                setResetResult({ name: e.name, password: data.password });
                                              } else {
                                                showToast(data.error || "重置失败");
                                              }
                                              setConfirmModal((prev) => ({ ...prev, open: false }));
                                            },
                                          })
                                        }
                                        className="text-xs text-emerald-600 hover:text-emerald-800"
                                      >
                                        重置密码
                                      </button>
                                    ) : (
                                      <span className="text-xs text-gray-300">未关联</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {empPerms.filter(e => {
                            if (filterCompany) {
                              const subs = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];
                              const isSub = subs.includes(filterCompany);
                              if (!e.roles.some(r => isSub ? subs.includes(r.company || "") : r.company === filterCompany)) return false;
                            }
                            if (filterDept && !e.roles.some(r => r.dept1 === filterDept)) return false;
                            if (searchKeyword) {
                              const kw = searchKeyword.toLowerCase();
                              return (
                                e.name.toLowerCase().includes(kw) ||
                                e.employeeId.toLowerCase().includes(kw) ||
                                (e.username?.toLowerCase().includes(kw) ?? false)
                              );
                            }
                            return true;
                          }).length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">暂无数据</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 按权限视图 */}
            {permView === "by-permission" && (
              <div className="space-y-4">
                {/* 权限卡片 */}
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {allPermissions.map((p) => (
                      <div
                        key={p.key}
                        onClick={() => {
                          setSelectedPermission(selectedPermission === p.key ? "" : p.key);
                          setPermListSearchQuery("");
                        }}
                        className={`cursor-pointer rounded-md border p-3 ${
                          selectedPermission === p.key
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-800">{p.label}</div>
                        <div className="text-xs text-gray-500">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 选中权限后的用户列表 */}
                {selectedPermission && (
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="mb-4">
                      <input
                        type="text"
                        value={permListSearchQuery}
                        onChange={(e) => setPermListSearchQuery(e.target.value)}
                        placeholder="搜索姓名、用户名或部门..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    {(() => {
                      const usersWithPerm = selectedPermission
                        ? users.filter((u) => (u as any)[selectedPermission] === true)
                        : [];
                      const usersWithoutPerm = selectedPermission
                        ? users.filter((u) => (u as any)[selectedPermission] !== true)
                        : [];

                      const query = permListSearchQuery.trim();
                      const filteredUsersWithPerm = query
                        ? usersWithPerm.filter((u) => matchEmployee(u, query))
                        : usersWithPerm;
                      const filteredUsersWithoutPerm = query
                        ? usersWithoutPerm.filter((u) => matchEmployee(u, query))
                        : usersWithoutPerm;

                      return (
                        <div>
                          <p className="mb-2 text-sm text-gray-600">
                            共 <span className="font-semibold">{users.length}</span> 人，
                            <span className="font-semibold text-emerald-600">{usersWithPerm.length}</span> 人有权限，
                            <span className="font-semibold text-gray-400">{usersWithoutPerm.length}</span> 人无权限
                            {query && (
                              <span>，筛选后 <span className="font-semibold">{filteredUsersWithPerm.length + filteredUsersWithoutPerm.length}</span> 人</span>
                            )}
                          </p>
                          {filteredUsersWithPerm.length + filteredUsersWithoutPerm.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {[...filteredUsersWithPerm, ...filteredUsersWithoutPerm].map((u) => {
                                const hasPerm = (u as any)[selectedPermission] === true;
                                return (
                                  <div key={u.id} className="rounded-md border border-gray-200 p-3 flex items-center justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-gray-800">{u.name}</div>
                                      <div className="text-xs text-gray-500">{[u.username, u.departmentName].filter(Boolean).join(" · ") || "无部门"}</div>
                                    </div>
                                    <button
                                      onClick={() => toggleUserPerm(u.id, selectedPermission, hasPerm)}
                                      className={`text-xs ml-2 shrink-0 ${hasPerm ? "text-red-500 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"}`}
                                    >
                                      {hasPerm ? "取消" : "赋予"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">{query ? "无匹配结果" : "暂无数据"}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 部门管理员板块 */}
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <h2 className="mb-4 text-base font-semibold text-gray-800">部门管理员</h2>

                  {/* 公司Tab */}
                  <div className="mb-4 flex gap-2 border-b border-gray-200">
                    <button
                      onClick={() => setDeptAdminCompany("")}
                      className={`pb-2 text-sm font-medium ${deptAdminCompany === "" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      全部
                    </button>
                    <button
                      onClick={() => setDeptAdminCompany("丰华制药")}
                      className={`pb-2 text-sm font-medium ${deptAdminCompany === "丰华制药" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      丰华制药
                    </button>
                    <button
                      onClick={() => setDeptAdminCompany("丰华生物")}
                      className={`pb-2 text-sm font-medium ${deptAdminCompany === "丰华生物" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      丰华生物
                    </button>
                  </div>

                  <div className="space-y-3">
                    {departments
                      .filter((d) => !deptAdminCompany || d.company === deptAdminCompany)
                      .map((dept) => {
                        const admins = deptAdmins.filter(
                          (a) => a.dept1 === dept.name && a.company === dept.company
                        );
                        return (
                          <div key={`${dept.company}|${dept.name}`} className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
                            <div className="min-w-[120px] pt-0.5">
                              <div className="text-sm font-medium text-gray-800">{dept.name}</div>
                              <div className="text-xs text-gray-400">{dept.company || "-"}</div>
                            </div>
                            <div className="flex flex-1 flex-wrap items-center gap-2">
                              {admins.map((a) => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                >
                                  {a.user.name}
                                  <button
                                    onClick={() =>
                                      setConfirmModal({
                                        open: true,
                                        title: "移除确认",
                                        message: `确定移除 ${a.user.name} 在「${dept.name}」的管理员权限？`,
                                        onConfirm: () => {
                                          removeDeptAdmin(a.id);
                                          setConfirmModal((prev) => ({ ...prev, open: false }));
                                        },
                                      })
                                    }
                                    className="ml-1 text-emerald-500 hover:text-emerald-800"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              {admins.length === 0 && (
                                <span className="text-xs text-gray-400">暂无管理员</span>
                              )}
                            </div>
                            <div className="relative">
                              {addingDeptAdmin?.name === dept.name && addingDeptAdmin?.company === dept.company ? (
                                <div className="relative w-48">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={deptAdminSearchQuery}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDeptAdminSearchQuery(val);
                                      if (deptAdminSearchTimer) clearTimeout(deptAdminSearchTimer);
                                      const timer = setTimeout(() => searchDeptAdmins(val), 300);
                                      setDeptAdminSearchTimer(timer);
                                    }}
                                    placeholder="输入姓名搜索..."
                                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
                                  />
                                  {deptAdminSearchResults.length > 0 && (
                                    <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border bg-white shadow-lg">
                                      {deptAdminSearchResults.map((emp) => (
                                        <div
                                          key={emp.rowId}
                                          onClick={() => { if (emp.userId) addDeptAdmin(dept.name, dept.company, emp.userId); }}
                                          className={`px-3 py-2 text-sm text-gray-800 ${emp.userId ? "cursor-pointer hover:bg-gray-50" : "pointer-events-none opacity-50"}`}
                                        >
                                          {emp.name}-{emp.dept1 || "未知部门"}-{emp.position || "未知职务"}
                                          {!emp.userId && <span className="text-gray-400"> (未关联用户)</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      setAddingDeptAdmin(null);
                                      setDeptAdminSearchQuery("");
                                      setDeptAdminSearchResults([]);
                                    }}
                                    className="absolute top-1 right-1 text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddingDeptAdmin({ name: dept.name, company: dept.company })}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                  添加管理员
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 确认框 */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">{confirmModal.title}</h3>
            <p className="mb-6 text-sm text-gray-600">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
              toast.type === "error" ? "bg-red-500" : "bg-emerald-600"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
