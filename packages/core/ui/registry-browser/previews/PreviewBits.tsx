import type { ReactNode } from "react";
import SearchInput from "../../SearchInput";

export function PreviewNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs leading-5 text-slate-500">{children}</div>
    </div>
  );
}

export function MiniButton({
  children,
  primary = false,
  danger = false,
}: {
  children: ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-600"
    : primary
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-slate-300 bg-white text-slate-600";

  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm ${className}`}
    >
      {children}
    </button>
  );
}

export function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export function EntitySearchPreview({ mode }: { mode: "single" | "multiple" }) {
  return (
    <div className="space-y-2">
      <SearchInput value="示例" onChange={() => {}} placeholder="搜索名称、编码、拼音" />
      <div className="space-y-1.5 rounded-md border border-slate-200 p-2">
        {[
          ["示例记录 A", "目标 · A-1024"],
          ["示例记录 B", "关联方 · A-1186"],
        ].map(([name, meta], index) => (
          <div
            key={name}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
              index === 0 ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"
            }`}
          >
            <span className="font-semibold">{name}</span>
            <span>{meta}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-400">
        {mode === "single" ? "用于 FK：搜索后选择一个目标记录。" : "用于字段检索：保留关键词并匹配多条记录。"}
      </div>
    </div>
  );
}

export function ConfirmPreview({ title = "确认停用这条记录？" }: { title?: string }) {
  return (
    <div className="mx-auto max-w-xs rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        操作会写入审计记录，仍被引用时应由业务守卫阻断。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <MiniButton>取消</MiniButton>
        <MiniButton danger>确认</MiniButton>
      </div>
    </div>
  );
}

export function DetailPreview() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="text-sm font-semibold text-slate-900">记录详情</div>
        <span className="text-xs text-slate-400">关闭</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniField label="状态" value="现用" />
        <MiniField label="负责人" value="示例人员" />
      </div>
    </div>
  );
}
