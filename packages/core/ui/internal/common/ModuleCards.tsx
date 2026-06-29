import type { ReactNode } from "react";
import PageContent from "../page/PageContent";
import { joinClassNames } from "./card-utils";
import { getToolbarActionClassName } from "../toolbar/toolbar-styles";

export type ModuleCardColor = "emerald" | "blue" | "indigo" | "purple" | "amber" | "cyan" | "orange" | string;

export type ModuleCardRenderLink = (props: {
  href: string;
  className: string;
  children: ReactNode;
}) => ReactNode;

export interface ModuleCardProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
  className?: string;
  renderLink?: ModuleCardRenderLink;
}

export const moduleCardColorClasses: Record<string, { icon: string; ring: string }> = {
  emerald: { icon: "bg-emerald-100 text-emerald-600", ring: "hover:ring-emerald-400" },
  blue: { icon: "bg-blue-100 text-blue-600", ring: "hover:ring-blue-400" },
  indigo: { icon: "bg-indigo-100 text-indigo-600", ring: "hover:ring-indigo-400" },
  purple: { icon: "bg-purple-100 text-purple-600", ring: "hover:ring-purple-400" },
  amber: { icon: "bg-amber-100 text-amber-600", ring: "hover:ring-amber-400" },
  cyan: { icon: "bg-cyan-100 text-cyan-600", ring: "hover:ring-cyan-400" },
  orange: { icon: "bg-orange-100 text-orange-600", ring: "hover:ring-orange-400" },
};

export function getModuleCardClassName(color: ModuleCardColor = "emerald", className = "") {
  const colorClass = moduleCardColorClasses[color] || moduleCardColorClasses.emerald;
  return joinClassNames(
    "group flex min-h-40 flex-col items-center justify-center rounded-lg bg-white p-5 text-center shadow-sm transition-all hover:shadow-md hover:ring-2",
    colorClass.ring,
    className,
  );
}

export type ModuleCardBodyProps = Omit<ModuleCardProps, "href" | "onClick" | "className" | "renderLink">;

export function ModuleCardBody({
  title,
  description,
  icon,
  color = "emerald",
  badge,
}: ModuleCardBodyProps) {
  const colorClass = moduleCardColorClasses[color] || moduleCardColorClasses.emerald;

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className={joinClassNames("mb-3 flex h-12 w-12 items-center justify-center rounded-full [&>svg]:h-6 [&>svg]:w-6", colorClass.icon)}>
        {icon}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        {badge && (
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
            {badge}
          </span>
        )}
      </div>
      {description && <p className="mt-1.5 text-center text-xs leading-5 text-gray-500">{description}</p>}
    </div>
  );
}

export interface ModuleGridPageProps {
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  className?: string;
  contentClassName?: string;
  gridClassName?: string;
}

export function ModuleCard({
  title,
  description,
  icon,
  color = "emerald",
  href,
  onClick,
  badge,
  className = "",
  renderLink,
}: ModuleCardProps) {
  const mergedClassName = getModuleCardClassName(color, className);
  const body = <ModuleCardBody title={title} description={description} icon={icon} color={color} badge={badge} />;

  if (href) {
    if (renderLink) {
      return renderLink({ href, className: mergedClassName, children: body });
    }
    return (
      <a href={href} className={mergedClassName}>
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[getToolbarActionClassName(), `${mergedClassName} border-0 text-inherit`].filter(Boolean).join(" ")}
      >
        {body}
      </button>
    );
  }

  return <section className={mergedClassName}>{body}</section>;
}

export function ModuleGridPage({
  title,
  summary,
  leading,
  children,
  afterGrid,
  fullScreen = false,
  className = "",
  contentClassName = "",
  gridClassName = "",
}: ModuleGridPageProps) {
  const content = (
    <div className={joinClassNames("flex w-full flex-col items-center", className)}>
      {(leading || title || summary) && (
        <div className="mb-8 flex flex-col items-center">
          {leading}
          {title && <h1 className="mt-4 text-2xl font-bold text-gray-800">{title}</h1>}
          {summary && <p className="mt-1 text-center text-sm text-gray-500">{summary}</p>}
        </div>
      )}
      <div className={joinClassNames("grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", gridClassName)}>
        {children}
      </div>
      {afterGrid && <div className="mt-8 w-full max-w-4xl">{afterGrid}</div>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={joinClassNames("flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4", contentClassName)}>
        {content}
      </div>
    );
  }

  return (
    <PageContent className={joinClassNames("py-10", contentClassName)}>
      {content}
    </PageContent>
  );
}
