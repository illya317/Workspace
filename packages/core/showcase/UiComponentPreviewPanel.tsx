import { type ReactNode } from "react";
import { ActionGlyph, PanelCard } from "@workspace/core/ui";
import {
  coreUiComponentAccessLayerMeta,
  coreUiComponentKindMeta,
  coreUiFrameMaturityMeta,
  type CoreUiComponentRegistration,
} from "@workspace/core/ui/component-registry";
import {
  formatNestDepth,
  nestDepthBadgeClasses,
} from "@workspace/core/ui/component-nest-depth";
import { ComponentPreview } from "./ComponentPreview";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function PreviewBlock({
  name,
  isFoundation,
  children,
}: {
  name: string;
  isFoundation: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-slate-400">
        {isFoundation ? "Recipe 提示" : "实时预览"}
      </p>
      {isFoundation ? (
        <div
          data-ui-preview-canvas={name}
          className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
        >
          {children}
        </div>
      ) : (
        <div data-ui-preview-canvas={name} className="overflow-visible">
          {children}
        </div>
      )}
    </div>
  );
}

export function UiComponentPreviewPanel({
  component,
  nestDepth,
  verified,
  canWrite,
  onToggleVerified,
}: {
  component: CoreUiComponentRegistration;
  nestDepth: number;
  verified: boolean;
  canWrite: boolean;
  onToggleVerified: () => void;
}) {
  const isFoundation = component.accessLayer === "foundation";
  const isPageFrame = component.accessLayer === "page-frame";

  return (
    <PanelCard
      title={(
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-900">
            {component.name}
          </code>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${nestDepthBadgeClasses(nestDepth)}`}
            title={`向下组合最大嵌套 ${nestDepth} 层`}
          >
            {formatNestDepth(nestDepth)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {coreUiComponentAccessLayerMeta[component.accessLayer].label}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {coreUiComponentKindMeta[component.kind].label}
          </span>
          {isPageFrame && component.frameMaturity && (
            <span
              className={joinClassNames(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                component.frameMaturity === "stable" && "bg-emerald-100 text-emerald-700",
                component.frameMaturity === "tbc" && "bg-orange-100 text-orange-700",
                component.frameMaturity === "internal-only" && "bg-slate-200 text-slate-700",
              )}
              title={coreUiFrameMaturityMeta[component.frameMaturity].description}
            >
              {coreUiFrameMaturityMeta[component.frameMaturity].label}
            </span>
          )}
          <span className={joinClassNames(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
          )}>
            {verified ? "无需改造" : "待改造"}
          </span>
        </span>
      )}
      actions={(
        <button
          type="button"
          disabled={!canWrite}
          onClick={onToggleVerified}
          className={`transition ${verified ? "text-emerald-600" : "text-amber-500 hover:text-amber-600"} disabled:cursor-not-allowed disabled:opacity-50`}
          title={canWrite ? (verified ? "无需改造" : "待改造") : "无权限修改"}
          aria-label={`${component.name} ${verified ? "无需改造" : "待改造"}`}
        >
          <ActionGlyph kind="verified" className="h-5 w-5" />
        </button>
      )}
      bodyClassName="p-4"
    >
      <p className="text-sm text-slate-700">{component.description}</p>
      <PreviewBlock name={component.name} isFoundation={isFoundation}>
        {isFoundation
          ? "Foundation 是样式 recipe / token，不作为可渲染 UI。"
          : <ComponentPreview name={component.name} />}
      </PreviewBlock>
    </PanelCard>
  );
}
