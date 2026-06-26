"use client";

import { AnalysisBlock, EmptyStateCard, MetricCard, ModuleCard, PanelCard, SectionCard } from "./Card";
import CommandButton from "./CommandButton";
import DataSurface from "./DataSurface";
import DetailModal from "./DetailModal";
import FormSurface from "./FormSurface";
import NavigationSurface from "./NavigationSurface";
import { Toolbar } from "./Toolbar";
import { joinClassNames } from "./card-utils";
import type {
  PageSurfaceBlockSpec,
  PageSurfaceCommandSpec,
  PageSurfaceEmptySpec,
  PageSurfaceMessageSpec,
  PageSurfaceMetricSpec,
  PageSurfaceModuleGridSpec,
  PageSurfaceToolbarSpec,
} from "./PageSurface.types";

export function renderCommands(commands?: PageSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => (
        <CommandButton
          key={command.key}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          onClick={command.onClick}
        >
          {command.label}
        </CommandButton>
      ))}
    </div>
  );
}

export function renderToolbar(toolbar?: PageSurfaceToolbarSpec) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} />;
}

export function renderEmpty(empty?: PageSurfaceEmptySpec) {
  if (!empty) return null;
  if (empty.presentation === "plain") {
    return <div className={joinClassNames("text-sm text-slate-500", empty.className)}>{empty.content}</div>;
  }
  return <EmptyStateCard compact={empty.compact} className={empty.className}>{empty.content}</EmptyStateCard>;
}

function renderMessage(message: PageSurfaceMessageSpec) {
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
  return <div className={joinClassNames("rounded-md border px-3 py-2 text-sm", toneClass, message.className)}>{message.content}</div>;
}

function renderMetrics(metrics?: PageSurfaceMetricSpec[], className?: string) {
  if (!metrics?.length) return null;
  return (
    <div className={joinClassNames("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {metrics.map((metric) => <MetricCard key={metric.key} label={metric.label} value={metric.value} className={metric.className} />)}
    </div>
  );
}

function renderModuleGrid(block: PageSurfaceModuleGridSpec) {
  const content = (
    <div className={joinClassNames("flex w-full flex-col items-center", block.fullScreen ? "min-h-screen justify-center" : "", block.centered ? "justify-center" : "", block.className)}>
      {(block.leading || block.title || block.summary) && (
        <div className="mb-8 flex flex-col items-center">
          {block.leading}
          {block.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{block.title}</h1> : null}
          {block.summary ? <p className="mt-1 text-center text-sm text-gray-500">{block.summary}</p> : null}
        </div>
      )}
      <div className={joinClassNames("grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", block.gridClassName)}>
        {block.items.map((item) => (
          <ModuleCard key={item.key} title={item.title} description={item.description} icon={item.icon} color={item.color} href={item.href} onClick={item.onClick} badge={item.badge} className={item.className} />
        ))}
      </div>
      {block.afterGrid ? <div className="mt-8 w-full max-w-4xl">{block.afterGrid}</div> : null}
    </div>
  );
  return block.contentClassName ? <div key={block.key} className={block.contentClassName}>{content}</div> : <div key={block.key}>{content}</div>;
}

export function renderBlocks(blocks?: PageSurfaceBlockSpec[]) {
  if (!blocks?.length) return null;
  return blocks.map((block) => {
    if (block.kind === "empty") return <div key={block.key}>{renderEmpty(block)}</div>;
    if (block.kind === "message") return <div key={block.key}>{renderMessage(block)}</div>;
    if (block.kind === "metrics") return <div key={block.key}>{renderMetrics(block.metrics, block.className)}</div>;
    if (block.kind === "moduleGrid") return renderModuleGrid(block);
    if (block.kind === "data") return <DataSurface key={block.key} {...block.surface} />;
    if (block.kind === "form") return <FormSurface key={block.key} {...block.surface} />;
    if (block.kind === "navigation") return <NavigationSurface key={block.key} {...block.surface} />;
    if (block.kind === "moduleView") return <div key={block.key} className={joinClassNames("min-w-0", block.className)}>{block.view}</div>;
    if (block.kind === "modal") {
      return (
        <DetailModal key={block.key} open={block.open} title={block.title} onClose={block.onClose} maxWidth={block.maxWidth}>
          <div className={joinClassNames("space-y-4", block.className, block.bodyClassName)}>{renderBlocks(block.blocks)}</div>
        </DetailModal>
      );
    }
    if (block.kind === "surfaceGroup") {
      return (
        <div key={block.key} className={joinClassNames(block.layout === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4", block.className)}>
          {renderBlocks(block.blocks)}
        </div>
      );
    }
    if (block.kind === "analysis") {
      return (
        <AnalysisBlock key={block.key} title={block.title} subtitle={block.subtitle} toolbarItems={block.toolbar?.items} className={block.className} bodyClassName={block.bodyClassName}>
          <div className="space-y-4">{renderCommands(block.actions)}{renderBlocks(block.blocks)}</div>
        </AnalysisBlock>
      );
    }
    if (block.kind === "panel") {
      return (
        <PanelCard key={block.key} title={block.title} subtitle={block.subtitle} actions={renderCommands(block.actions)} className={block.className} bodyClassName={joinClassNames("p-4", block.bodyClassName)}>
          {renderBlocks(block.blocks)}
        </PanelCard>
      );
    }
    return (
      <SectionCard key={block.key} title={block.title} subtitle={block.subtitle} actions={renderCommands(block.actions)} className={block.className} bodyClassName={block.bodyClassName}>
        {renderBlocks(block.blocks)}
      </SectionCard>
    );
  });
}
