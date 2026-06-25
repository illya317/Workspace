"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabasePageFrame, EmptyStateCard, getToolbarActionClassName } from "@workspace/core/ui";
import { PositionDescriptionReadOnlyView, type PositionDescriptionReadOnlyData } from "@workspace/platform/ui/position-description/PositionDescriptionReadOnlyView";
export default function GmpDetailClient({
  code
}: {
  code: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<PositionDescriptionReadOnlyData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    fetch(workspacePath(`/api/modules/hr/roster/position-descriptions?code=${encodeURIComponent(code)}`)).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
      setPos(d.positionDescription);
      setLoading(false);
    }).catch(() => {
      setError("获取失败");
      setLoading(false);
    });
  }, [code]);
  if (loading) {
    return <DatabasePageFrame contentClassName="py-8">
        <EmptyStateCard compact={false}>加载中...</EmptyStateCard>
      </DatabasePageFrame>;
  }
  if (error || !pos) {
    return <DatabasePageFrame contentClassName="py-8">
        <EmptyStateCard compact={false}>
          <div className="space-y-4">
            <div>{error || "未找到"}</div>
            <button type="button" onClick={() => router.push("/docs/positions")} className={[getToolbarActionClassName(), "mt-4"].filter(Boolean).join(" ")}>
              返回列表
            </button>
          </div>
        </EmptyStateCard>
      </DatabasePageFrame>;
  }
  return <DatabasePageFrame contentClassName="py-8">
      <PositionDescriptionReadOnlyView data={pos} />
      <div className="mt-8 flex justify-end">
        <button type="button" onClick={() => router.push("/docs/positions")} className={getToolbarActionClassName()}>返回列表</button>
      </div>
    </DatabasePageFrame>;
}
