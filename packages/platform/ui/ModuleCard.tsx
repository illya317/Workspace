"use client";

import Link from "next/link";
import {
  ActionButton,
  ModuleCardBody,
  getModuleCardClassName,
  type ModuleCardColor,
  type ModuleCardProps,
} from "@workspace/core/ui";

export type { ModuleCardColor, ModuleCardProps };

export default function ModuleCard({ href, onClick, className = "", ...props }: ModuleCardProps) {
  const mergedClassName = getModuleCardClassName(props.color, className);
  const body = <ModuleCardBody {...props} />;

  if (href) {
    return (
      <Link href={href} className={mergedClassName}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <ActionButton
        onClick={onClick}
        className={`${mergedClassName} border-0 text-inherit`}
      >
        {body}
      </ActionButton>
    );
  }

  return <section className={mergedClassName}>{body}</section>;
}
