"use client";

import type { FC } from "react";
import { Badge } from "../internal-ui";

function BadgePreview() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge label="灰" tone="gray" />
        <Badge label="绿" tone="green" />
        <Badge label="蓝" tone="blue" />
        <Badge label="红" tone="red" />
        <Badge label="黄" tone="yellow" />
        <Badge label="橙" tone="orange" />
        <Badge label="翠绿" tone="emerald" />
        <Badge label="天蓝" tone="sky" />
        <Badge label="石板" tone="slate" />
        <Badge label="琥珀" tone="amber" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge level={1} />
        <Badge level={2} />
        <Badge level={3} />
        <Badge level={4} />
        <Badge label="自定义" tone="emerald" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge label="这是一个超长文本徽标，用于测试扩展样式" tone="blue" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge label="扩展样式" tone="emerald" className="px-3 py-1 text-sm font-semibold uppercase tracking-wide" />
      </div>
    </div>
  );
}

export const statusPreviewByName: Record<string, FC> = {
  Badge: BadgePreview,
};
