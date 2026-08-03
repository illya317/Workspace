"use client";

import {
  createMasterDetailBody,
  createPageTabBar,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type BodySurfaceSplitSectionProps,
  type NavigationSurfaceSelectorSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";

export type SpaceWorkbenchKindOption = {
  key: string;
  label: string;
  disabled?: boolean;
};

export type StandardBusinessSpaceTargetType = "personal" | "department" | "project" | "committee" | "company";

export type StandardBusinessSpaceNavigationSection = "personal" | "departments" | "projects" | "committee" | "company";

export type StandardBusinessSpaceNavigationTarget = {
  targetType: StandardBusinessSpaceTargetType;
  targetId: number;
  name?: string | null;
  title?: string | null;
};

const DEFAULT_STANDARD_BUSINESS_SPACE_NAVIGATION_ORDER = ["personal", "departments", "projects", "committee", "company"] as const satisfies readonly StandardBusinessSpaceNavigationSection[];

export function standardBusinessSpaceNavigationKey(target: Pick<StandardBusinessSpaceNavigationTarget, "targetType" | "targetId">) {
  return `${target.targetType}:${target.targetId}`;
}

function defaultStandardBusinessSpaceLabel(space: StandardBusinessSpaceNavigationTarget) {
  if (space.targetType === "personal") return "个人";
  if (space.targetType === "committee") return "委员会";
  if (space.targetType === "company") return "公司";
  if (space.targetType === "project") return space.name || space.title || "项目";
  return space.name || space.title || "部门";
}

function preferredDepartmentSpaces<TSpace extends StandardBusinessSpaceNavigationTarget>(
  spaces: readonly TSpace[],
  preferredDepartmentIds: readonly number[],
  maxDepartmentCount: number,
) {
  const departments = spaces.filter((space) => space.targetType === "department");
  const byTargetId = new Map(departments.map((space) => [space.targetId, space]));
  return preferredDepartmentIds
    .map((id) => byTargetId.get(id))
    .filter((space): space is TSpace => Boolean(space))
    .slice(0, maxDepartmentCount);
}

function preferredProjectSpaces<TSpace extends StandardBusinessSpaceNavigationTarget>(
  spaces: readonly TSpace[],
  preferredProjectIds: readonly number[],
  maxProjectCount: number,
) {
  const projects = spaces.filter((space) => space.targetType === "project");
  if (preferredProjectIds.length === 0) return projects;
  const byTargetId = new Map(projects.map((space) => [space.targetId, space]));
  return preferredProjectIds
    .map((id) => byTargetId.get(id))
    .filter((space): space is TSpace => Boolean(space))
    .slice(0, maxProjectCount);
}

export function createStandardBusinessSpaceNavigationItems<TSpace extends StandardBusinessSpaceNavigationTarget>({
  spaces,
  preferredDepartmentIds,
  preferredProjectIds = [],
  order = DEFAULT_STANDARD_BUSINESS_SPACE_NAVIGATION_ORDER,
  maxDepartmentCount = 3,
  maxProjectCount = 3,
  labels,
  getDepartmentLabel,
}: {
  spaces: readonly TSpace[];
  preferredDepartmentIds: readonly number[];
  preferredProjectIds?: readonly number[];
  order?: readonly StandardBusinessSpaceNavigationSection[];
  maxDepartmentCount?: number;
  maxProjectCount?: number;
  labels?: Partial<Record<Exclude<StandardBusinessSpaceTargetType, "department">, string>>;
  getDepartmentLabel?: (space: TSpace) => string;
}): SpaceWorkbenchKindOption[] {
  const personal = spaces.find((space) => space.targetType === "personal");
  const committee = spaces.find((space) => space.targetType === "committee");
  const company = spaces.find((space) => space.targetType === "company");
  const departments = preferredDepartmentSpaces(spaces, preferredDepartmentIds, maxDepartmentCount);
  const projects = preferredProjectSpaces(spaces, preferredProjectIds, maxProjectCount);
  const spaceItem = (space: TSpace | undefined, label?: string): SpaceWorkbenchKindOption[] => {
    if (!space) return [];
    return [{
      key: standardBusinessSpaceNavigationKey(space),
      label: label ?? defaultStandardBusinessSpaceLabel(space),
    }];
  };

  return order.flatMap((section) => {
    if (section === "personal") return spaceItem(personal, labels?.personal);
    if (section === "departments") {
      return departments.flatMap((space) => (
        spaceItem(space, getDepartmentLabel?.(space) ?? defaultStandardBusinessSpaceLabel(space))
      ));
    }
    if (section === "projects") return projects.flatMap((space) => spaceItem(space));
    if (section === "committee") return spaceItem(committee, labels?.committee);
    if (section === "company") return spaceItem(company, labels?.company);
    return [];
  });
}

export function activeStandardBusinessSpaceNavigationKey<TTarget extends Pick<StandardBusinessSpaceNavigationTarget, "targetType" | "targetId">>(
  target: TTarget | null,
  items: readonly SpaceWorkbenchKindOption[],
) {
  if (!target) return items[0]?.key ?? null;
  const exactKey = standardBusinessSpaceNavigationKey(target);
  return items.some((item) => item.key === exactKey) ? exactKey : items[0]?.key ?? null;
}

export function filterStandardBusinessSpacesByNavigation<TSpace extends StandardBusinessSpaceNavigationTarget>(
  spaces: readonly TSpace[],
  key: string | null,
) {
  if (!key) return [...spaces];
  return spaces.filter((space) => standardBusinessSpaceNavigationKey(space) === key);
}

export function standardBusinessSpaceNavigationTarget<TSpace extends StandardBusinessSpaceNavigationTarget>(
  spaces: readonly TSpace[],
  key: string,
) {
  return spaces.find((space) => standardBusinessSpaceNavigationKey(space) === key) ?? null;
}

export function createSpaceKindNavigation({
  items,
  active,
  onChange,
  ariaLabel = "空间类型",
}: {
  items: SpaceWorkbenchKindOption[];
  active: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}): PageSurfaceTabBarSpec {
  return createPageTabBar({
    items: items.map((item) => ({ key: item.key, label: item.label })),
    active,
    onChange,
    variant: "large",
    ariaLabel,
  });
}

type StandardBusinessSpaceSelectorOptions<TSpace extends StandardBusinessSpaceNavigationTarget> = {
  spaces: readonly TSpace[];
  preferredDepartmentIds: readonly number[];
  preferredProjectIds?: readonly number[];
  active: Pick<StandardBusinessSpaceNavigationTarget, "targetType" | "targetId"> | null;
  onChange: (space: TSpace, key: string) => void;
  label?: string;
  order?: readonly StandardBusinessSpaceNavigationSection[];
  maxDepartmentCount?: number;
  maxProjectCount?: number;
  labels?: Partial<Record<Exclude<StandardBusinessSpaceTargetType, "department">, string>>;
  getDepartmentLabel?: (space: TSpace) => string;
};

function standardBusinessSpaceSelectorModel<TSpace extends StandardBusinessSpaceNavigationTarget>({
  spaces,
  preferredDepartmentIds,
  preferredProjectIds,
  active,
  onChange,
  order,
  maxDepartmentCount,
  maxProjectCount,
  labels,
  getDepartmentLabel,
}: StandardBusinessSpaceSelectorOptions<TSpace>) {
  const options = createStandardBusinessSpaceNavigationItems({
    spaces,
    preferredDepartmentIds,
    preferredProjectIds,
    order,
    maxDepartmentCount,
    maxProjectCount,
    labels,
    getDepartmentLabel,
  });
  if (options.length === 0) return null;
  const value = activeStandardBusinessSpaceNavigationKey(active, options) ?? options[0].key;
  return {
    value,
    options,
    onChange: (nextKey: string) => {
      const nextSpace = standardBusinessSpaceNavigationTarget(spaces, nextKey);
      if (nextSpace) onChange(nextSpace, nextKey);
    },
  };
}

export function createStandardBusinessSpaceNavigationSelector<TSpace extends StandardBusinessSpaceNavigationTarget>(
  input: StandardBusinessSpaceSelectorOptions<TSpace>,
): NavigationSurfaceSelectorSpec | null {
  const model = standardBusinessSpaceSelectorModel(input);
  if (!model) return null;
  return {
    value: model.value,
    options: model.options.map((option) => ({
      value: option.key,
      label: option.label,
      disabled: option.disabled,
    })),
    onChange: model.onChange,
    label: input.label,
    visibleCount: 8,
  };
}

export function createSpaceViewToolbarItem({
  key = "space-view",
  value,
  options,
  onChange,
  ariaLabel = "当前视图",
}: {
  key?: string;
  value: string;
  options: SpaceWorkbenchKindOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}): SurfaceToolbarItem {
  return {
    kind: "option-group",
    key,
    value,
    options: options.map((option) => ({
      value: option.key,
      label: option.label,
      disabled: option.disabled,
    })),
    presentation: "segmented",
    onChange,
    ariaLabel,
  };
}

export function createSpaceWorkbenchBody({
  left,
  right,
  label,
  ratio = [0.28, 0.72],
  mobileDetailActive,
  onMobileNavigateToList,
}: {
  left: BodySurfaceSelectorProps;
  right: BodySurfaceProps;
  label: string;
  ratio?: [number, number];
  mobileDetailActive?: boolean;
  onMobileNavigateToList?: () => void;
}): BodySurfaceSplitSectionProps {
  return createMasterDetailBody({
    master: { label, presentation: "compact", body: left },
    detail: right,
    desktop: { ratio },
    mobile: { detailActive: mobileDetailActive, onNavigateToList: onMobileNavigateToList },
  });
}
