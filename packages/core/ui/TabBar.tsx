"use client";

export interface TabDef {
  key: string;
  label: string;
}

export interface TabBarProps {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function TabBar({ tabs, active, onChange, className = "" }: TabBarProps) {
  return (
    <div className={`mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            active === t.key
              ? "border-b-2 border-emerald-500 text-emerald-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
