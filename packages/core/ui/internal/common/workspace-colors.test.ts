import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceBadgeTagClassName,
  workspaceButtonToneClassName,
  workspaceColors,
  workspaceLevelTagClassName,
  workspaceSemanticTagClassName,
} from "./workspace-colors";
import { workspaceTheme } from "../../services/ui-provider";

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  assert.ok(channels);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

test("semantic status text keeps normal-text contrast on its tinted background", () => {
  assert.ok(contrastRatio("#ffffff", workspaceColors.primary.main) >= 4.5, "primary button text must reach WCAG AA");
  assert.ok(contrastRatio("#ffffff", workspaceColors.primary.hover) >= 4.5, "primary hover button text must reach WCAG AA");
  assert.ok(contrastRatio(workspaceColors.primary.hover, workspaceColors.primary.bg) >= 4.5, "primary hover text must reach WCAG AA");
  for (const tone of [workspaceColors.info, workspaceColors.success, workspaceColors.warning, workspaceColors.danger]) {
    assert.ok(contrastRatio(tone.main, tone.bg) >= 4.5, `${tone.main} on ${tone.bg} must reach WCAG AA`);
  }
});

test("all semantic and badge tags use explicit Workspace foreground, background, and border classes", () => {
  for (const tone of ["default", "muted", "info", "success", "warning", "danger"] as const) {
    const className = workspaceSemanticTagClassName(tone);
    assert.match(className, /!border-/);
    assert.match(className, /!bg-/);
    assert.match(className, /!text-/);
  }
  for (const tone of ["gray", "green", "blue", "red", "yellow", "orange", "emerald", "sky", "slate", "amber"] as const) {
    assert.match(workspaceBadgeTagClassName(tone), /!text-/);
  }
  assert.match(workspaceLevelTagClassName(1), /sky/);
  assert.match(workspaceLevelTagClassName(2), /emerald/);
  assert.match(workspaceLevelTagClassName(3), /amber/);
  assert.match(workspaceButtonToneClassName("amber"), /disabled:!text-slate-400/);
});

test("Ant theme aliases stay bound to the Workspace semantic palette", () => {
  assert.equal(workspaceColors.primary.main, "#047857", "primary actions preserve the Workspace emerald family at AA contrast");
  assert.equal(workspaceTheme.token?.colorPrimary, workspaceColors.primary.main);
  assert.equal(workspaceTheme.token?.colorInfo, workspaceColors.info.main);
  assert.equal(workspaceTheme.token?.colorSuccessText, workspaceColors.success.main);
  assert.equal(workspaceTheme.token?.colorWarningText, workspaceColors.warning.main);
  assert.equal(workspaceTheme.token?.colorErrorText, workspaceColors.danger.main);
  assert.equal(workspaceTheme.token?.colorBorder, workspaceColors.border);
  assert.equal(workspaceTheme.components?.Button?.controlHeightSM, 32);
  assert.equal(workspaceTheme.components?.Button?.controlHeight, 36);
  assert.equal(workspaceTheme.components?.Button?.controlHeightLG, 40);
  assert.equal(workspaceTheme.components?.Button?.dangerColor, workspaceColors.surface);
  assert.ok(contrastRatio(workspaceTheme.components?.Button?.dangerColor ?? "#000000", workspaceColors.danger.main) >= 4.5);
  assert.equal(workspaceTheme.components?.Segmented?.trackBg, workspaceColors.fillQuaternary);
  assert.equal(workspaceTheme.components?.Segmented?.itemHoverBg, workspaceColors.fillTertiary);
  assert.equal(workspaceTheme.components?.Segmented?.itemSelectedColor, workspaceColors.primary.hover);
});
