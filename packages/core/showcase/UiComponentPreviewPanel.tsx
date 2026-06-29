import { type ReactNode } from "react";
import { ActionGlyph } from "@workspace/core/ui";
import { PanelCard } from "./internal-ui";
import {
  type CoreUiComponentRegistration,
} from "../ui/registry/component-registry";
import {
  formatNestDepth,
  nestDepthBadgeClasses,
} from "../ui/registry/component-nest-depth";
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

function exposureLabel(component: CoreUiComponentRegistration) {
  if (component.role === "surface") return "声明接口";
  if (component.role === "host") return "宿主入口";
  if (component.role === "helper") return "声明助手";
  if (component.role === "service") return "服务接口";
  return "内部实现";
}

function exposureTitle(component: CoreUiComponentRegistration) {
  const exposure = component.exposure;
  if (component.role === "surface" && exposure?.mode === "spec") {
    return `通过 ${exposure.entry}.${exposure.path} 声明`;
  }
  if (component.role === "surface") {
    return "Surface 声明接口";
  }
  if (component.role === "host") {
    return "执行 Surface 声明的宿主入口";
  }
  if (component.role === "helper") {
    return "构造 Surface 声明的 helper";
  }
  if (component.role === "service") {
    return "非视觉服务接口";
  }
  return "内部实现";
}

function exposureBadgeClasses(component: CoreUiComponentRegistration) {
  if (component.role === "surface") return "bg-emerald-50 text-emerald-700";
  if (component.role === "host") return "bg-sky-50 text-sky-700";
  if (component.role === "helper") return "bg-cyan-50 text-cyan-700";
  if (component.role === "service") return "bg-violet-50 text-violet-700";
  return "bg-slate-50 text-slate-500";
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
  const isFoundation = component.subcategory === "common.foundation";

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
          <span
            className={joinClassNames(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              exposureBadgeClasses(component),
            )}
            title={exposureTitle(component)}
          >
            {exposureLabel(component)}
          </span>
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
