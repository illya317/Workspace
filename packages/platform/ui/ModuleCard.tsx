"use client";

import Link from "next/link";
import {
  ModuleCardBody,
  getModuleCardClassName,
  type ModuleCardAction,
  type ModuleCardColor,
  type ModuleCardProps,
} from "@workspace/core/ui";

export type { ModuleCardAction, ModuleCardColor, ModuleCardProps };

export default function ModuleCard({ href, onClick, className = "", ...props }: ModuleCardProps) {
  const mergedClassName = getModuleCardClassName(props.color, className);
  const body = (
    <ModuleCardBody
      {...props}
      renderActionLink={(action: ModuleCardAction, actionClassName: string) => (
        <Link href={action.href || "#"} className={actionClassName}>
          {action.label}
        </Link>
      )}
    />
  );

  if (href && !props.actions?.length) {
    return (
      <Link href={href} className={mergedClassName}>
        {body}
      </Link>
    );
  }

  if (onClick && !props.actions?.length) {
    return (
      <button type="button" onClick={onClick} className={mergedClassName}>
        {body}
      </button>
    );
  }

  return <section className={mergedClassName}>{body}</section>;
}
