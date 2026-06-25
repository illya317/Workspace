"use client";

import { useState } from "react";
import TabBar from "./TabBar";
import { DatabasePageFrame } from "./PageFrames";
import { PanelCard } from "./BaseCards";
import ModuleTemplatePreview from "./page-style-preview/ModuleTemplatePreview";
import {
  PageStylePreviewSampleProvider,
  type PageStylePreviewSamples,
} from "./page-style-preview/sample-context";
import type {
  ModuleTemplate,
  PageStyleRouteModule,
  PageViewDefinition,
} from "./page-style-preview/template-data";

export interface PageStyleShowcaseProps {
  modules: ModuleTemplate[];
  routeModules: PageStyleRouteModule[];
  viewDefinitions: PageViewDefinition[];
  samples?: PageStylePreviewSamples;
}

function getFirstRoute(routeModule?: PageStyleRouteModule) {
  return routeModule?.children[0]?.route ?? routeModule?.route ?? "";
}

function getFirstView(definition?: PageViewDefinition) {
  const view = definition?.views[0];
  return {
    viewKey: view?.key ?? "",
    childKey: view?.children?.[0]?.key,
  };
}

export default function PageStyleShowcase({
  modules,
  routeModules,
  viewDefinitions,
  samples,
}: PageStyleShowcaseProps) {
  const firstRouteModule = routeModules[0];
  const firstRoute = getFirstRoute(firstRouteModule);
  const firstView = getFirstView(viewDefinitions.find((definition) => definition.route === firstRoute));
  const [activeModuleKey, setActiveModuleKey] = useState(firstRouteModule?.key ?? "");
  const [activeRoute, setActiveRoute] = useState(firstRoute);
  const [activeView, setActiveView] = useState(firstView.viewKey);
  const [activeChild, setActiveChild] = useState<string | undefined>(firstView.childKey);
  const activeRouteModule = routeModules.find((module) => module.key === activeModuleKey) ?? firstRouteModule;
  const activeModule = modules.find((module) => module.key === activeModuleKey) ?? modules[0];
  const activeViewDefinition = viewDefinitions.find((definition) => definition.route === activeRoute);

  function resetViewState(route: string) {
    const nextView = getFirstView(viewDefinitions.find((definition) => definition.route === route));
    setActiveView(nextView.viewKey);
    setActiveChild(nextView.childKey);
  }

  function changeModule(nextKey: string) {
    const nextModule = routeModules.find((module) => module.key === nextKey);
    const nextRoute = getFirstRoute(nextModule);
    setActiveModuleKey(nextKey);
    setActiveRoute(nextRoute);
    resetViewState(nextRoute);
  }

  function changeRoute(nextRoute: string) {
    setActiveRoute(nextRoute);
    resetViewState(nextRoute);
  }

  function changeView(nextKey: string) {
    const nextView = activeViewDefinition?.views.find((view) => view.key === nextKey);
    setActiveView(nextKey);
    setActiveChild(nextView?.children?.[0]?.key);
  }

  return (
    <PageStylePreviewSampleProvider samples={samples}>
      <DatabasePageFrame contentClassName="py-8">
        <PanelCard
          title="页面样式预览"
          bodyClassName="space-y-4 p-4"
        >
          <TabBar
            variant="large"
            accordion
            tabs={routeModules.map((module) => ({
              key: module.key,
              label: module.label,
              children: module.children.map((child) => ({ key: child.route, label: child.label })),
            }))}
            active={activeModuleKey}
            activeChild={activeRoute}
            onChange={changeModule}
            onChildChange={changeRoute}
          />
          {activeModule && (
            <ModuleTemplatePreview
              module={activeModule}
              route={activeRoute}
              routeLabel={activeRouteModule?.children.find((child) => child.route === activeRoute)?.label}
              viewDefinition={activeViewDefinition}
              activeView={activeView}
              activeChild={activeChild}
              onActiveViewChange={changeView}
              onActiveChildChange={setActiveChild}
            />
          )}
        </PanelCard>
      </DatabasePageFrame>
    </PageStylePreviewSampleProvider>
  );
}
