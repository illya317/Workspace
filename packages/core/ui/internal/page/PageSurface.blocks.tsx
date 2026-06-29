"use client";

import { EmptyStateCard } from "../common/Card";
import BlockSurface from "../../BlockSurface";
import CommandButton from "../common/CommandButton";
import DataSurface from "../../DataSurface";
import DetailModal from "../common/DetailModal";
import DocumentSurface from "../../DocumentSurface";
import FormSurface from "../../FormSurface";
import NavigationSurface from "../../NavigationSurface";
import { Toolbar } from "../../Toolbar";
import VisualizationSurface from "../../VisualizationSurface";
import { joinClassNames } from "../common/card-utils";
import type {
  PageSurfaceBlockSpec,
  PageSurfaceCommandSpec,
  PageSurfaceEmptySpec,
  PageSurfaceToolbarSpec,
} from "../../PageSurface.types";

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
          size={command.size}
          className={command.className}
          truncate={command.truncate}
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

export function renderBlockStack(
  blocks?: PageSurfaceBlockSpec[],
  className?: string,
  spacingClassName = "space-y-4",
) {
  if (!blocks?.length) return null;
  return <div className={joinClassNames(spacingClassName, className)}>{renderBlocks(blocks)}</div>;
}

export function PageSurfaceBlockStack({
  blocks,
  className,
  spacingClassName = "space-y-4",
}: {
  blocks?: PageSurfaceBlockSpec[];
  className?: string;
  spacingClassName?: string;
}) {
  return renderBlockStack(blocks, className, spacingClassName);
}

export function PageSurfaceBlockGroupStack({
  blocks,
  layout,
  className,
}: {
  blocks?: PageSurfaceBlockSpec[];
  layout?: "stack" | "grid";
  className?: string;
}) {
  if (!blocks?.length) return null;
  if (layout === "grid") {
    return (
      <div className={joinClassNames("grid gap-4 lg:grid-cols-2", className)}>
        {blocks.map((block, index) => (
          <div key={block.key} className={index === 0 ? "min-w-0 max-lg:order-last" : "min-w-0"}>
            {renderBlocks([block])}
          </div>
        ))}
      </div>
    );
  }
  return <PageSurfaceBlockStack blocks={blocks} className={className} />;
}

export function renderBlocks(blocks?: PageSurfaceBlockSpec[]) {
  if (!blocks?.length) return null;
  return blocks.map((block) => {
    if (block.kind === "data") return <DataSurface key={block.key} {...block.surface} />;
    if (block.kind === "document") return <DocumentSurface key={block.key} {...block.surface} />;
    if (block.kind === "form") return <FormSurface key={block.key} {...block.surface} />;
    if (block.kind === "visualization") return <VisualizationSurface key={block.key} {...block.surface} />;
    if (block.kind === "block") return <BlockSurface key={block.key} {...block.surface} />;
    if (block.kind === "navigation") return <NavigationSurface key={block.key} {...block.surface} />;
    if (block.kind === "modal") {
      return (
        <DetailModal key={block.key} open={block.open} title={block.title} onClose={block.onClose} maxWidth={block.maxWidth}>
          {renderBlockStack(block.blocks, joinClassNames(block.className, block.bodyClassName))}
        </DetailModal>
      );
    }
    return null;
  });
}
