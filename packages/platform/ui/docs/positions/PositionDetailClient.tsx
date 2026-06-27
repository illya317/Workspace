"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageSurface } from "@workspace/core/ui";
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
  if (loading || error || !pos) {
    return (
      <PageSurface
        kind="detail"
        contentClassName="py-8"
        empty={{ content: loading ? "加载中..." : error || "未找到" }}
        actions={loading ? undefined : [{ key: "back", label: "返回列表", onClick: () => router.push("/docs/positions") }]}
      />
    );
  }
  return (
    <PositionDescriptionReadOnlyView
      data={pos}
      actions={[{ key: "back", label: "返回列表", onClick: () => router.push("/docs/positions") }]}
    />
  );
}
