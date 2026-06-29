"use client";

import type { ReactNode, Ref } from "react";
import { AnalysisBlock, EmptyStateCard, ModuleCard, PanelCard, SectionCard } from "./internal/common/Card";
import type { ModuleCardColor } from "./internal/common/Card";
import CommandButton from "./internal/common/CommandButton";
import type { CommandButtonProps } from "./internal/common/CommandButton";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";
import { joinClassNames } from "./internal/common/card-utils";

export type BlockSurfaceKind =
  | "content"
  | "message"
  | "heading"
  | "empty"
  | "actions"
  | "analysis"
  | "group"
  | "panel"
  | "section"
  | "moduleGrid";

export interface BlockSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: CommandButtonProps["size"];
  truncate?: boolean;
}

export interface BlockSurfaceModuleGridItemSpec {
  key: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

interface BlockSurfaceBaseProps {
  kind: BlockSurfaceKind;
  key?: string;
}

export interface BlockSurfaceContentProps extends BlockSurfaceBaseProps {
  kind: "content";
  content: ReactNode;
}

export interface BlockSurfaceMessageProps extends BlockSurfaceBaseProps {
  kind: "message";
  content: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
}

export interface BlockSurfaceHeadingProps extends BlockSurfaceBaseProps {
  kind: "heading";
  title: ReactNode;
  subtitle?: ReactNode;
  level?: 1 | 2 | 3;
}

export interface BlockSurfaceEmptyProps extends BlockSurfaceBaseProps {
  kind: "empty";
  content: ReactNode;
  presentation?: "card" | "plain";
  compact?: boolean;
}

export interface BlockSurfaceActionsProps extends BlockSurfaceBaseProps {
  kind: "actions";
  actions: BlockSurfaceCommandSpec[];
}

export interface BlockSurfaceAnalysisProps extends BlockSurfaceBaseProps {
  kind: "analysis";
  title: ReactNode;
  subtitle?: ReactNode;
  toolbarItems?: SurfaceToolbarItems;
  actions?: BlockSurfaceCommandSpec[];
  content?: ReactNode;
}

export interface BlockSurfaceGroupProps extends BlockSurfaceBaseProps {
  kind: "group";
  blocks: BlockSurfaceProps[];
  layout?: "stack" | "grid";
}

export interface BlockSurfacePanelProps extends BlockSurfaceBaseProps {
  kind: "panel" | "section";
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: BlockSurfaceCommandSpec[];
  content?: ReactNode;
  blocks?: BlockSurfaceProps[];
  itemRef?: Ref<HTMLDivElement>;
}

export interface BlockSurfaceModuleGridProps extends BlockSurfaceBaseProps {
  kind: "moduleGrid";
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  items: BlockSurfaceModuleGridItemSpec[];
}

export type BlockSurfaceProps =
  | BlockSurfaceContentProps
  | BlockSurfaceMessageProps
  | BlockSurfaceHeadingProps
  | BlockSurfaceEmptyProps
  | BlockSurfaceActionsProps
  | BlockSurfaceAnalysisProps
  | BlockSurfaceGroupProps
  | BlockSurfacePanelProps
  | BlockSurfaceModuleGridProps;

export function renderBlockSurfaceCommands(commands?: BlockSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => (
        <CommandButton
          key={command.key}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          size={command.size}
          truncate={command.truncate}
          onClick={command.onClick}
        >
          {command.label}
        </CommandButton>
      ))}
    </div>
  );
}

function renderMessage(message: BlockSurfaceMessageProps) {
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
  return <div className={joinClassNames("rounded-md border px-3 py-2 text-sm", toneClass)}>{message.content}</div>;
}

function renderHeading(heading: BlockSurfaceHeadingProps) {
  const titleClassName = joinClassNames(
    heading.level === 1 ? "text-xl" : heading.level === 3 ? "text-sm" : "text-base",
    "font-semibold text-slate-900",
  );
  const subtitle = heading.subtitle ? (
    <p className="mt-1 text-sm text-slate-500">{heading.subtitle}</p>
  ) : null;
  const content = heading.level === 1
    ? <h1 className={titleClassName}>{heading.title}</h1>
    : heading.level === 3
      ? <h3 className={titleClassName}>{heading.title}</h3>
      : <h2 className={titleClassName}>{heading.title}</h2>;
  return <div>{content}{subtitle}</div>;
}

function renderEmpty(empty: BlockSurfaceEmptyProps) {
  if (empty.presentation === "plain") {
    return <div className="text-sm text-slate-500">{empty.content}</div>;
  }
  return <EmptyStateCard compact={empty.compact}>{empty.content}</EmptyStateCard>;
}

function renderNestedBlockSurface(block: BlockSurfaceProps, fallbackKey: string) {
  const { key, ...props } = block;
  return <BlockSurface key={key ?? fallbackKey} {...props} />;
}

function renderGroup(group: BlockSurfaceGroupProps) {
  if (group.layout === "grid") {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {group.blocks.map((block, index) => (
          <div key={block.key ?? String(index)} className={index === 0 ? "min-w-0 max-lg:order-last" : "min-w-0"}>
            {renderNestedBlockSurface(block, String(index))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {group.blocks.map((block, index) => renderNestedBlockSurface(block, String(index)))}
    </div>
  );
}

function renderAnalysis(analysis: BlockSurfaceAnalysisProps) {
  return (
    <AnalysisBlock
      title={analysis.title}
      subtitle={analysis.subtitle}
      toolbarItems={analysis.toolbarItems}
    >
      <div className="space-y-4">
        {renderBlockSurfaceCommands(analysis.actions)}
        {analysis.content}
      </div>
    </AnalysisBlock>
  );
}

function renderPanel(panel: BlockSurfacePanelProps) {
  const body = (
    <>
      {panel.content}
      {panel.blocks?.length ? (
        <div className={panel.content ? "mt-4 space-y-4" : "space-y-4"}>
          {panel.blocks.map((block, index) => renderNestedBlockSurface(block, String(index)))}
        </div>
      ) : null}
    </>
  );
  const card = panel.kind === "section" ? (
    <SectionCard title={panel.title} subtitle={panel.subtitle} actions={renderBlockSurfaceCommands(panel.actions)}>
      {body}
    </SectionCard>
  ) : (
    <PanelCard title={panel.title} subtitle={panel.subtitle} actions={renderBlockSurfaceCommands(panel.actions)} bodyClassName="p-4">
      {body}
    </PanelCard>
  );
  return panel.itemRef ? <div ref={panel.itemRef}>{card}</div> : card;
}

function renderModuleGrid(block: BlockSurfaceModuleGridProps) {
  const content = (
    <div className={joinClassNames("flex w-full flex-col items-center", block.fullScreen ? "min-h-screen justify-center" : "", block.centered ? "justify-center" : "")}>
      {(block.leading || block.title || block.summary) && (
        <div className="mb-8 flex flex-col items-center">
          {block.leading}
          {block.title ? <h1 className="mt-4 text-2xl font-bold text-gray-800">{block.title}</h1> : null}
          {block.summary ? <p className="mt-1 text-center text-sm text-gray-500">{block.summary}</p> : null}
        </div>
      )}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {block.items.map((item) => {
          const { key, ...props } = item;
          return <ModuleCard key={key} {...props} />;
        })}
      </div>
      {block.afterGrid ? <div className="mt-8 w-full max-w-4xl">{block.afterGrid}</div> : null}
    </div>
  );
  return content;
}

export default function BlockSurface(props: BlockSurfaceProps) {
  if (props.kind === "content") return <div className="min-w-0">{props.content}</div>;
  if (props.kind === "message") return renderMessage(props);
  if (props.kind === "heading") return renderHeading(props);
  if (props.kind === "empty") return renderEmpty(props);
  if (props.kind === "actions") return <div>{renderBlockSurfaceCommands(props.actions)}</div>;
  if (props.kind === "analysis") return renderAnalysis(props);
  if (props.kind === "group") return renderGroup(props);
  if (props.kind === "moduleGrid") return renderModuleGrid(props);
  return renderPanel(props);
}
