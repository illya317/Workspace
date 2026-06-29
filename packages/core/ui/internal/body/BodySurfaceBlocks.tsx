"use client";

import { Children } from "react";
import { EmptyStateCard, ModuleCard } from "../common/Card";
import { joinClassNames } from "../common/card-utils";
import type { ModuleCardColor } from "../common/Card";
import type { ReactNode } from "react";

type BodySurfaceEmptyLike = {
  presentation?: "card" | "plain";
  content: ReactNode;
  compact?: boolean;
};

type BodySurfaceMessageLike = {
  content: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
};

type BodySurfaceStatusLike = {
  kind: "empty" | "loading" | "error";
  content: ReactNode;
  compact?: boolean;
};

type BodySurfaceBadgeLike = {
  key: string;
  label: ReactNode;
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
};

type BodySurfaceModuleGridLike = {
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  afterGrid?: ReactNode;
  centered?: boolean;
  fullScreen?: boolean;
  items: Array<{
    key: string;
    title: string;
    description?: ReactNode;
    icon?: ReactNode;
    color?: ModuleCardColor;
    href?: string;
    onClick?: () => void;
    badge?: string;
  }>;
};

function renderContent(content: ReactNode) {
  return Array.isArray(content) ? Children.toArray(content) : content;
}

export function renderBodyEmpty(empty?: BodySurfaceEmptyLike) {
  if (!empty) return null;
  if (empty.presentation === "plain") {
    return <div key="empty" className="text-sm text-slate-500">{renderContent(empty.content)}</div>;
  }
  return <EmptyStateCard key="empty" compact={empty.compact}>{renderContent(empty.content)}</EmptyStateCard>;
}

export function renderBodyMessage(message?: BodySurfaceMessageLike) {
  if (!message) return null;
  const toneClass =
    message.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : message.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : message.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : message.tone === "muted"
            ? "border-slate-100 bg-slate-50 text-slate-500"
            : "border-slate-200 bg-white text-slate-600";
  return <div key="message" className={joinClassNames("rounded-md border px-3 py-2 text-sm", toneClass)}>{renderContent(message.content)}</div>;
}

export function renderBodyStatus(status?: BodySurfaceStatusLike) {
  if (!status) return null;
  const toneClass =
    status.kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : status.kind === "loading"
        ? "border-slate-200 bg-slate-50 text-slate-500"
        : "border-dashed border-slate-200 text-slate-400";
  return <EmptyStateCard key="status" compact={status.compact} className={toneClass}>{renderContent(status.content)}</EmptyStateCard>;
}

export function renderModuleGrid(moduleGrid?: BodySurfaceModuleGridLike) {
  if (!moduleGrid) return null;
  return (
    <div key="module-grid" className={joinClassNames(
      "flex w-full flex-col items-center",
      moduleGrid.fullScreen ? "min-h-screen justify-center" : "",
      moduleGrid.centered ? "justify-center" : "",
    )}>
      {(moduleGrid.leading || moduleGrid.title || moduleGrid.summary) && (
        <div className="mb-8 flex flex-col items-center">
          {moduleGrid.leading}
          {moduleGrid.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{moduleGrid.title}</h1> : null}
          {moduleGrid.summary ? <p className="mt-1 text-center text-sm text-gray-500">{moduleGrid.summary}</p> : null}
        </div>
      )}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleGrid.items.map((item) => {
          const { key, ...props } = item;
          return <ModuleCard key={key} {...props} />;
        })}
      </div>
      {moduleGrid.afterGrid ? <div className="mt-8 w-full max-w-4xl">{moduleGrid.afterGrid}</div> : null}
    </div>
  );
}

function badgeClassName(tone: BodySurfaceBadgeLike["tone"] = "default") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  if (tone === "danger") return "bg-rose-50 text-rose-600";
  if (tone === "info") return "bg-sky-50 text-sky-700";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-700";
}

export function renderSectionBadges(badges?: BodySurfaceBadgeLike[]) {
  if (!badges?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span key={badge.key} className={`rounded px-2 py-1 text-xs font-medium ${badgeClassName(badge.tone)}`}>{badge.label}</span>
      ))}
    </div>
  );
}
