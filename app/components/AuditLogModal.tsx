"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditChange { field: string; from?: string; to: string }
interface AuditEntry {
  id: number;
  entityId: string;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: string;
  tag: string | null;
  isFirst: boolean;
  changes: AuditChange[];
}

interface AuditLogModalProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
  onRestored?: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: "名称", alias: "别名", code: "编码", employeeId: "员工姓名",
  idNumber: "身份证号", otherId: "其他证件号", gender: "性别",
  birthDate: "出生年月", ethnicity: "民族", hometown: "籍贯",
  politics: "政治面貌", education: "学历", title: "职称",
  school: "毕业院校", major: "专业", phone: "电话",
  workStartDate: "参加工作时间", fullName: "全称",
  registeredCapital: "注册资本", unifiedCode: "统一社会信用代码",
  bankName: "开户行", registeredAddress: "办公地址",
  registeredDate: "注册时间", legalPerson: "法定代表人",
  currentCompany: "当前公司", joinDate: "入职日期", leaveDate: "离职日期",
  leaveReason: "离职原因", officeLocation: "办公地点", attendanceType: "考勤类型",
  isActive: "在职", isPrimary: "主岗", startDate: "开始日期", endDate: "结束日期",
  personnelType: "人员类型", rank: "职级", reportTo: "直接上级", reportTo2: "第二汇报线",
  workPercent: "工作占比", isResearch: "研发", description: "说明", type: "类型",
  departmentName: "所属部门", positionPurpose: "岗位目的", summary: "职责概要",
  headcount: "编制人数", effectiveDate: "生效日期", sourceFile: "源文件",
  shareRatio: "持股比例", isConsolidated: "并表", sortOrder: "排序",
  queryGroup: "查询分组", level: "层级", parentId: "上级", managerUserId: "负责人",
  departmentId: "所属部门", positionId: "岗位", positionDescriptionId: "岗位说明书",
  projectId: "项目", childId: "下级",
  targetType: "目标类型", date: "日期", taskName: "任务名称", notes: "备注",
  category: "分类", plan: "计划", completion: "完成情况", nextGoal: "下周目标",
  content: "内容", importance: "重要度", urgency: "紧急度",
};

function label(f: string) { return FIELD_LABELS[f] || f; }
function formatVal(v: string) {
  if (v === "true") return "是"; if (v === "false") return "否";
  return v.length > 40 ? v.slice(0, 40) + "..." : v;
}

export default function AuditLogModal({ open, onClose, entityType, onRestored }: AuditLogModalProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const pageSize = 100;

  const [restoring, setRestoring] = useState<number | null>(null);

  const loadDates = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/audit-log?entityType=${entityType}&dates=1`);
      if (res.ok) { const d = await res.json(); setDates(d.dates || []); }
    } catch {}
  }, [entityType]);

  const load = useCallback(async (p: number, d: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType, page: String(p), pageSize: String(pageSize) });
      if (d) params.set("date", d);
      const res = await fetch(`/api/admin/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } finally { setLoading(false); }
  }, [entityType]);

  const restore = useCallback(async (historyId: number) => {
    setRestoring(historyId);
    try {
      const res = await fetch("/api/admin/audit-log/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId }),
      });
      if (res.ok) {
        load(1, selectedDate); loadDates();
        onRestored?.();
      }
    } finally { setRestoring(null); }
  }, [load, loadDates, selectedDate, onRestored]);

  useEffect(() => {
    if (open) { setPage(1); setSelectedDate(""); load(1, ""); loadDates(); }
  }, [open, load, loadDates]);

  useEffect(() => {
    if (open) load(page, selectedDate);
  }, [page, selectedDate]); // eslint-disable-line

  if (!open) return null;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[max(92vw,900px)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            编辑历史 · {entityType}
            {selectedDate && <span className="text-sm text-gray-400 ml-2">({selectedDate})</span>}
          </h2>
          <div className="flex items-center gap-3">
            {dates.length > 0 && (
              <select
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
              >
                <option value="">全部日期</option>
                {dates.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-2">
          {loading ? (
            <div className="py-16 text-center text-gray-400">加载中...</div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-gray-400">暂无编辑记录</div>
          ) : (
            <div className="space-y-2 py-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="border rounded-lg hover:border-gray-300 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                >
                  <div className="flex items-center gap-4 px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {e.tag ? (
                        <span className="inline-block bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 text-[11px] font-medium">
                          {e.tag.replace("V0:", "基线 ")}
                        </span>
                      ) : (
                        <span className="inline-block bg-gray-100 rounded px-1.5 py-0.5 text-xs font-mono">
                          V{e.version}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500 w-36 shrink-0">
                      {new Date(e.createdAt).toLocaleString("zh-CN")}
                    </span>
                    <span className="text-xs text-gray-700 w-16 shrink-0">{e.editorName}</span>
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {e.entityName}
                    </span>
                    <div className="flex flex-wrap gap-1 ml-auto">
                      {e.changes.slice(0, 4).map((c) => (
                        <span key={c.field} className="inline-block bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 text-[11px]">
                          {label(c.field)}: <span className="font-medium">{formatVal(c.to)}</span>
                        </span>
                      ))}
                      {e.changes.length > 4 && (
                        <span className="text-[11px] text-gray-400">+{e.changes.length - 4}</span>
                      )}
                      {e.changes.length === 0 && (
                        <span className="text-[11px] text-gray-300">无变更</span>
                      )}
                    </div>
                    <span className="text-gray-300 text-xs">{expandedId === e.id ? "▲" : "▼"}</span>
                  </div>

                  {expandedId === e.id && (
                    <div className="border-t bg-gray-50 rounded-b-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">变更详情</span>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); restore(e.id); }}
                          disabled={restoring === e.id}
                          className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {restoring === e.id ? "还原中..." : "还原到此版本"}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {e.changes.map((c) => (
                          <div key={c.field} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500 w-24 shrink-0">{label(c.field)}</span>
                            {c.from !== undefined ? (
                              <>
                                <span className="text-red-500 bg-red-50 rounded px-1.5 py-0.5 line-through font-mono">
                                  {formatVal(c.from)}
                                </span>
                                <span className="text-gray-300">→</span>
                              </>
                            ) : (
                              <span className="text-gray-300 italic text-[11px]">(无)</span>
                            )}
                            <span className="text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 font-mono">
                              {formatVal(c.to)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm text-gray-500 shrink-0">
            <span>共 {total} 条记录</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border disabled:opacity-30">上一页</button>
              <span className="px-2 py-1">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
