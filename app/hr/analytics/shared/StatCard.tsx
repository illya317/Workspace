"use client";

export default function StatCard({ label, value, sub, color = "emerald" }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const cm: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg p-4 ${cm[color] || cm.emerald}`}>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-70">{sub}</div>}
      <div className="mt-0.5 text-xs opacity-80">{label}</div>
    </div>
  );
}
