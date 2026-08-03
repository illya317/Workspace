"use client";

import {
  Button,
  Dropdown,
  Segmented,
} from "antd";
import type { BodySurfaceProps } from "../../BodySurface.types";
import type { PageSurfaceTabBarSpec } from "../../PageSurface.types";
import { assertNoSurfaceExplanatoryText } from "../body/BodySurfaceGuardParts";
import { AntdBodySurface } from "../body/antd-body";

export function buildAntdPageMobileSelections(tabbar: PageSurfaceTabBarSpec) {
  return tabbar.items.flatMap((item, itemIndex) => [
    {
      key: `parent-${itemIndex}`,
      label: item.compactLabel ?? item.label,
      parentKey: item.key,
      childKey: undefined as string | undefined,
    },
    ...(item.children ?? []).map((child, childIndex) => ({
      key: `child-${itemIndex}-${childIndex}`,
      label: `${item.compactLabel ?? item.label} · ${child.compactLabel ?? child.label}`,
      parentKey: item.key,
      childKey: child.key,
    })),
  ]);
}

export function AntdPageTabBar({ tabbar }: { tabbar: PageSurfaceTabBarSpec }) {
  const activeItem = tabbar.items.find((item) => item.key === tabbar.active);
  const childItems = activeItem?.children ?? [];
  const activeChild = childItems.find((item) => item.key === tabbar.activeChild);
  const activeLabel = [activeItem?.compactLabel ?? activeItem?.label, activeChild?.compactLabel ?? activeChild?.label]
    .filter(Boolean)
    .join(" · ") || "选择栏目";
  const compactMobileNavigation = tabbar.items.length > 3 || tabbar.items.some((item) => item.children?.length);
  const mobileSelections = buildAntdPageMobileSelections(tabbar);
  const mobileMenu = {
    items: mobileSelections.map((selection) => ({ key: selection.key, label: selection.label })),
    onClick: ({ key }: { key: string }) => {
      const selection = mobileSelections.find((item) => item.key === key);
      if (!selection) return;
      if (selection.parentKey !== tabbar.active || selection.childKey === undefined) {
        tabbar.onChange(selection.parentKey);
      }
      if (selection.childKey !== undefined) tabbar.onChildChange?.(selection.childKey);
    },
  };
  return (
    <div className="px-1" data-ui-renderer="antd">
      <div className="hidden sm:block">
        <div
          aria-label={tabbar.ariaLabel ?? tabbar.label}
          className="flex w-full flex-wrap items-center gap-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
          role="tablist"
        >
          {tabbar.items.map((item) => {
            const selected = item.key === tabbar.active;
            return (
              <div className="flex min-w-max items-center gap-2" key={item.key}>
                <Button
                  aria-selected={selected}
                  className="min-w-28 font-semibold"
                  onClick={() => tabbar.onChange(item.key)}
                  role="tab"
                  size={tabbar.variant === "small" ? "middle" : "large"}
                  type={selected ? "primary" : "text"}
                >
                  {item.label}
                </Button>
                {selected && childItems.length > 0 ? (
                  <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-1">
                    <Segmented
                      aria-label={`${item.label}子栏目`}
                      onChange={(key) => tabbar.onChildChange?.(String(key))}
                      options={childItems.map((child) => ({ label: child.label, value: child.key }))}
                      size={tabbar.variant === "small" ? "middle" : "large"}
                      value={tabbar.activeChild}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="sm:hidden">
        {compactMobileNavigation ? (
          <Dropdown menu={mobileMenu} trigger={["click"]}>
            <Button aria-label={tabbar.ariaLabel ?? tabbar.label ?? "切换栏目"} block size="large">
              <span className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{activeLabel}</span>
                <span className="shrink-0 text-xs text-teal-700">切换</span>
              </span>
            </Button>
          </Dropdown>
        ) : (
          <Segmented
            aria-label={tabbar.ariaLabel ?? tabbar.label}
            block
            onChange={(key) => tabbar.onChange(String(key))}
            options={tabbar.items.map((item) => ({ label: item.compactLabel ?? item.label, value: item.key }))}
            size={tabbar.variant === "small" ? "middle" : "large"}
            value={tabbar.active}
          />
        )}
      </div>
    </div>
  );
}

export function AntdPageBody({ body }: { body: BodySurfaceProps }) {
  assertNoSurfaceExplanatoryText(body);
  return <div className="contents text-slate-900" data-ui-renderer="antd"><AntdBodySurface body={body} /></div>;
}
