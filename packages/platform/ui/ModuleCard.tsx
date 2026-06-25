"use client";

import Link from "next/link";
import { ModuleCard as CoreModuleCard, type ModuleCardProps } from "@workspace/core/ui";

export type { ModuleCardProps };

export default function ModuleCard(props: ModuleCardProps) {
  return (
    <CoreModuleCard
      {...props}
      renderLink={({ href, className, children }) => (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
    />
  );
}
