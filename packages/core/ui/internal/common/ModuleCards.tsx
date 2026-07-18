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
  emerald: { icon: "bg-emerald-100 text-emerald-600", ring: "sm:hover:ring-emerald-400" },
  blue: { icon: "bg-blue-100 text-blue-600", ring: "sm:hover:ring-blue-400" },
  indigo: { icon: "bg-indigo-100 text-indigo-600", ring: "sm:hover:ring-indigo-400" },
  purple: { icon: "bg-purple-100 text-purple-600", ring: "sm:hover:ring-purple-400" },
  amber: { icon: "bg-amber-100 text-amber-600", ring: "sm:hover:ring-amber-400" },
  cyan: { icon: "bg-cyan-100 text-cyan-600", ring: "sm:hover:ring-cyan-400" },
  orange: { icon: "bg-orange-100 text-orange-600", ring: "sm:hover:ring-orange-400" },
};

export function getModuleCardClassName(color: ModuleCardColor = "emerald", className = "") {
  const colorClass = moduleCardColorClasses[color] || moduleCardColorClasses.emerald;
  return joinClassNames(
    "group relative flex min-h-24 min-w-0 flex-col items-center justify-start rounded-2xl bg-transparent px-1 py-1 text-center transition active:scale-[0.98] sm:min-h-40 sm:justify-center sm:rounded-lg sm:bg-white sm:p-5 sm:shadow-sm sm:hover:shadow-md sm:hover:ring-2",
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
    <div className="flex w-full min-w-0 flex-col items-center justify-center text-center">
      <div className={joinClassNames("relative mb-2 flex h-13 w-13 items-center justify-center rounded-2xl shadow-sm ring-1 ring-white/80 [&>svg]:h-6 [&>svg]:w-6 sm:mb-3 sm:h-12 sm:w-12 sm:rounded-full sm:shadow-none sm:ring-0", colorClass.icon)}>
        {icon}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h3 className="line-clamp-2 min-h-10 text-[13px] font-medium leading-5 text-slate-800 sm:min-h-0 sm:text-base sm:font-semibold sm:text-gray-800">{title}</h3>
        {badge && (
          <span className="hidden rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 sm:inline-flex">
            {badge}
          </span>
        )}
      </div>
      {description && <p className="mt-1.5 hidden text-center text-xs leading-5 text-gray-500 sm:block">{description}</p>}
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
    <div className={joinClassNames("flex w-full flex-col items-start sm:items-center", className)}>
      {(leading || title || summary) && (
        <div className="mb-5 flex w-full flex-col items-start sm:mb-8 sm:items-center">
          {leading}
          {title && <h1 className="mt-3 text-xl font-bold tracking-tight text-gray-800 sm:mt-4 sm:text-2xl">{title}</h1>}
          {summary && <p className="mt-1 text-left text-sm text-gray-500 sm:text-center">{summary}</p>}
        </div>
      )}
      <div className={joinClassNames("grid w-full max-w-4xl grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3", gridClassName)}>
        {children}
      </div>
      {afterGrid && <div className="mt-6 w-full max-w-4xl sm:mt-8">{afterGrid}</div>}
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
    <PageContent className={joinClassNames("py-5 sm:py-10", contentClassName)}>
      {content}
    </PageContent>
  );
}
