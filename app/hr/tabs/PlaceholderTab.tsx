"use client";

import { EmptyStateCard } from "@workspace/core/ui";

export default function PlaceholderTab({ label, desc }: { label: string; desc: string }) {
  return (
    <EmptyStateCard>
      <span className="block font-medium text-slate-600">{label}</span>
      <span className="mt-2 block">{desc} - 功能建设中</span>
    </EmptyStateCard>
  );
}
