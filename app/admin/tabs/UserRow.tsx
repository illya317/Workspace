import { summarizeResourcePermissions, formatSummaryTooltip, ROLE_COLORS } from "../lib/permission-summary";
import type { ResourceItem } from "../types";
import type { PermissionGrantLike } from "../lib/permission-summary";

interface UserItem {
  id: number;
  name: string;
  username: string | null;
  employeeId: string | null;
  canLogin: boolean;
  isWorkListAdmin: boolean;
  resourceRoles: Array<{ resourceKey: string; roleKey: string; scopeId?: string | null }>;
}

const ROLE_BG: Record<string, string> = {
  purple: "bg-purple-50 text-purple-700",
  red: "bg-red-50 text-red-700",
  emerald: "bg-emerald-50 text-emerald-700",
  gray: "bg-gray-100 text-gray-600",
};

interface Props {
  user: UserItem;
  resources: ResourceItem[];
  onToggleLogin: (id: number, current: boolean) => void;
  onResetPassword: (user: UserItem) => void;
}

export default function UserRow({ user: u, resources, onToggleLogin, onResetPassword }: Props) {
  const summaries = summarizeResourcePermissions(resources, u.resourceRoles as PermissionGrantLike[]);
  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-3 py-2 font-medium text-gray-800">
        {u.name}{u.employeeId && <span className="text-gray-400 ml-1 text-[11px] font-normal">/ {u.employeeId}</span>}
      </td>
      <td className="px-3 py-2 text-gray-500 font-mono">{u.username || "-"}</td>
      <td className="px-3 py-2">
        <button onClick={() => onToggleLogin(u.id, u.canLogin)}
          className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer border ${u.canLogin ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
        >
          {u.canLogin ? "启用" : "停用"}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {u.isWorkListAdmin && (
            <span className="rounded bg-purple-50 px-1 py-0.5 text-[10px] text-purple-600">管理员</span>
          )}
          {summaries.map((s) => (
            <span
              key={s.key}
              className={`rounded px-1 py-0.5 text-[10px] ${ROLE_BG[ROLE_COLORS[s.roleKey] || "gray"]}`}
              title={formatSummaryTooltip(s)}
            >
              {s.label}
              {s.totalChildren > 0 && s.coveredChildren < s.totalChildren && ` ${s.coveredChildren}/${s.totalChildren}`}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <button onClick={() => onResetPassword(u)} className="text-xs text-blue-500 hover:text-blue-700">重置密码</button>
      </td>
    </tr>
  );
}
