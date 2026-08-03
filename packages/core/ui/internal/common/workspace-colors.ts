export type BadgeTone =
  | "gray" | "green" | "blue" | "red" | "yellow" | "orange"
  | "emerald" | "sky" | "slate" | "amber";

/** Workspace's single semantic palette for Ant tokens and Core private renderers. */
export const workspaceColors = {
  canvas: "#f8fafc",
  surface: "#ffffff",
  text: "#172033",
  textStrong: "#334155",
  textSecondary: "#475569",
  textMuted: "#64748b",
  textQuiet: "#94a3b8",
  border: "#cbd5e1",
  borderSubtle: "#e2e8f0",
  fill: "#cbd5e1",
  fillSecondary: "#e2e8f0",
  fillTertiary: "#f1f5f9",
  fillQuaternary: "#f8fafc",
  primary: {
    bg: "#ecfdf5", bgHover: "#d1fae5", border: "#a7f3d0", borderHover: "#6ee7b7",
    hover: "#065f46", main: "#047857", active: "#064e3b", strong: "#052e16",
  },
  info: {
    bg: "#f0f9ff", bgHover: "#e0f2fe", border: "#bae6fd", borderHover: "#7dd3fc",
    hover: "#0284c7", main: "#0369a1", active: "#075985",
  },
  success: {
    bg: "#ecfdf5", bgHover: "#d1fae5", border: "#a7f3d0", borderHover: "#6ee7b7",
    hover: "#059669", main: "#047857", active: "#065f46",
  },
  warning: {
    bg: "#fffbeb", bgHover: "#fef3c7", border: "#fde68a", borderHover: "#fcd34d",
    hover: "#d97706", main: "#b45309", active: "#92400e",
  },
  danger: {
    bg: "#fef2f2", bgHover: "#fee2e2", border: "#fecaca", borderHover: "#fca5a5",
    hover: "#dc2626", main: "#b91c1c", active: "#991b1b",
  },
} as const;

export type WorkspaceSemanticTone = "default" | "muted" | "info" | "success" | "warning" | "danger";

const SEMANTIC_TAG_CLASS: Record<WorkspaceSemanticTone, string> = {
  default: "!border-slate-200 !bg-slate-100 !text-slate-700",
  muted: "!border-slate-200 !bg-slate-100 !text-slate-600",
  info: "!border-sky-200 !bg-sky-50 !text-sky-700",
  success: "!border-emerald-200 !bg-emerald-50 !text-emerald-700",
  warning: "!border-amber-200 !bg-amber-50 !text-amber-700",
  danger: "!border-red-200 !bg-red-50 !text-red-700",
};

const BADGE_TAG_CLASS: Record<BadgeTone, string> = {
  gray: SEMANTIC_TAG_CLASS.default,
  green: SEMANTIC_TAG_CLASS.success,
  blue: SEMANTIC_TAG_CLASS.info,
  red: SEMANTIC_TAG_CLASS.danger,
  yellow: "!border-yellow-200 !bg-yellow-50 !text-yellow-700",
  orange: "!border-orange-200 !bg-orange-50 !text-orange-700",
  emerald: "!border-emerald-200 !bg-emerald-100 !text-emerald-700",
  sky: "!border-sky-200 !bg-sky-100 !text-sky-700",
  slate: SEMANTIC_TAG_CLASS.default,
  amber: "!border-amber-200 !bg-amber-100 !text-amber-700",
};

const OUTLINED_BUTTON_TONE_CLASS: Record<BadgeTone, string> = {
  gray: "!border-slate-300 !text-slate-700 hover:!border-slate-400 hover:!bg-slate-50 hover:!text-slate-900",
  green: "!border-emerald-300 !text-emerald-700 hover:!border-emerald-500 hover:!bg-emerald-50 hover:!text-emerald-800",
  blue: "!border-sky-300 !text-sky-700 hover:!border-sky-500 hover:!bg-sky-50 hover:!text-sky-800",
  red: "!border-red-300 !text-red-700 hover:!border-red-500 hover:!bg-red-50 hover:!text-red-800",
  yellow: "!border-yellow-300 !text-yellow-700 hover:!border-yellow-500 hover:!bg-yellow-50 hover:!text-yellow-800",
  orange: "!border-orange-300 !text-orange-700 hover:!border-orange-500 hover:!bg-orange-50 hover:!text-orange-800",
  emerald: "!border-emerald-300 !text-emerald-700 hover:!border-emerald-500 hover:!bg-emerald-50 hover:!text-emerald-800",
  sky: "!border-sky-300 !text-sky-700 hover:!border-sky-500 hover:!bg-sky-50 hover:!text-sky-800",
  slate: "!border-slate-300 !text-slate-700 hover:!border-slate-400 hover:!bg-slate-50 hover:!text-slate-900",
  amber: "!border-amber-300 !text-amber-700 hover:!border-amber-500 hover:!bg-amber-50 hover:!text-amber-800",
};

const INTERACTIVE_BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  gray: "hover:!bg-slate-200", green: "hover:!bg-emerald-100", blue: "hover:!bg-sky-100",
  red: "hover:!bg-red-100", yellow: "hover:!bg-yellow-100", orange: "hover:!bg-orange-100",
  emerald: "hover:!bg-emerald-200", sky: "hover:!bg-sky-200", slate: "hover:!bg-slate-200",
  amber: "hover:!bg-amber-200",
};

export function workspaceSemanticTagClassName(tone: WorkspaceSemanticTone = "default") {
  return SEMANTIC_TAG_CLASS[tone];
}

export function workspaceBadgeTagClassName(tone: BadgeTone = "gray") {
  return BADGE_TAG_CLASS[tone];
}

export function workspaceBadgeClassName(tone: BadgeTone = "gray", interactive = false) {
  return `${BADGE_TAG_CLASS[tone]}${interactive ? ` ${INTERACTIVE_BADGE_TONE_CLASS[tone]}` : ""}`;
}

export function workspaceLevelTagClassName(level: number) {
  if (level === 1) return BADGE_TAG_CLASS.blue;
  if (level === 2) return BADGE_TAG_CLASS.emerald;
  if (level === 3) return BADGE_TAG_CLASS.amber;
  return BADGE_TAG_CLASS.slate;
}

export function workspaceButtonToneClassName(tone: BadgeTone) {
  return `${OUTLINED_BUTTON_TONE_CLASS[tone]} disabled:!border-slate-200 disabled:!bg-transparent disabled:!text-slate-400`;
}
