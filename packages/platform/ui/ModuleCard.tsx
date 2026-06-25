"use client";

import Link from "next/link";
import { ModuleCardBody, getModuleCardClassName, type ModuleCardColor, type ModuleCardProps, getToolbarActionClassName } from "@workspace/core/ui";
export type { ModuleCardColor, ModuleCardProps };
export default function ModuleCard({
  href,
  onClick,
  className = "",
  ...props
}: ModuleCardProps) {
  const mergedClassName = getModuleCardClassName(props.color, className);
  const body = <ModuleCardBody {...props} />;
  if (href) {
    return <Link href={href} className={mergedClassName}>
        {body}
      </Link>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} className={[getToolbarActionClassName(), `${mergedClassName} border-0 text-inherit`].filter(Boolean).join(" ")}>
        {body}
      </button>;
  }
  return <section className={mergedClassName}>{body}</section>;
}
