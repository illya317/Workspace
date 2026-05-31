"use client";

interface StatusToggleTab {
  key: string;
  label: string;
  count: number;
}

interface Props {
  tabs: StatusToggleTab[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * 通用状态切换按钮组（待审核/已通过/全部 或 待配置/已确认/全部）。
 * 不内置业务语义——tab 列表和标签由调用方传入。
 */
export default function StatusToggle({ tabs, active, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            active === t.key
              ? "bg-emerald-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {t.label} {t.count}
        </button>
      ))}
    </div>
  );
}
