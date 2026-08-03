"use client";

import type { ReactNode } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider, type ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import { workspaceColors } from "../internal/common/workspace-colors";

export const workspaceTheme: ThemeConfig = {
  token: {
    colorPrimary: workspaceColors.primary.main,
    colorPrimaryBg: workspaceColors.primary.bg,
    colorPrimaryBgHover: workspaceColors.primary.bgHover,
    colorPrimaryBorder: workspaceColors.primary.border,
    colorPrimaryBorderHover: workspaceColors.primary.borderHover,
    colorPrimaryHover: workspaceColors.primary.hover,
    colorPrimaryActive: workspaceColors.primary.active,
    colorPrimaryText: workspaceColors.primary.main,
    colorPrimaryTextHover: workspaceColors.primary.hover,
    colorPrimaryTextActive: workspaceColors.primary.active,
    colorInfo: workspaceColors.info.main,
    colorInfoBg: workspaceColors.info.bg,
    colorInfoBgHover: workspaceColors.info.bgHover,
    colorInfoBorder: workspaceColors.info.border,
    colorInfoBorderHover: workspaceColors.info.borderHover,
    colorInfoHover: workspaceColors.info.hover,
    colorInfoActive: workspaceColors.info.active,
    colorInfoText: workspaceColors.info.main,
    colorInfoTextHover: workspaceColors.info.hover,
    colorInfoTextActive: workspaceColors.info.active,
    colorSuccess: workspaceColors.success.main,
    colorSuccessBg: workspaceColors.success.bg,
    colorSuccessBgHover: workspaceColors.success.bgHover,
    colorSuccessBorder: workspaceColors.success.border,
    colorSuccessBorderHover: workspaceColors.success.borderHover,
    colorSuccessHover: workspaceColors.success.hover,
    colorSuccessActive: workspaceColors.success.active,
    colorSuccessText: workspaceColors.success.main,
    colorSuccessTextHover: workspaceColors.success.hover,
    colorSuccessTextActive: workspaceColors.success.active,
    colorWarning: workspaceColors.warning.main,
    colorWarningBg: workspaceColors.warning.bg,
    colorWarningBgHover: workspaceColors.warning.bgHover,
    colorWarningBorder: workspaceColors.warning.border,
    colorWarningBorderHover: workspaceColors.warning.borderHover,
    colorWarningHover: workspaceColors.warning.hover,
    colorWarningActive: workspaceColors.warning.active,
    colorWarningText: workspaceColors.warning.main,
    colorWarningTextHover: workspaceColors.warning.hover,
    colorWarningTextActive: workspaceColors.warning.active,
    colorError: workspaceColors.danger.main,
    colorErrorBg: workspaceColors.danger.bg,
    colorErrorBgHover: workspaceColors.danger.bgHover,
    colorErrorBorder: workspaceColors.danger.border,
    colorErrorBorderHover: workspaceColors.danger.borderHover,
    colorErrorHover: workspaceColors.danger.hover,
    colorErrorActive: workspaceColors.danger.active,
    colorErrorText: workspaceColors.danger.main,
    colorErrorTextHover: workspaceColors.danger.hover,
    colorErrorTextActive: workspaceColors.danger.active,
    colorText: workspaceColors.text,
    colorTextSecondary: workspaceColors.textSecondary,
    colorTextTertiary: workspaceColors.textMuted,
    colorTextQuaternary: workspaceColors.textQuiet,
    colorBorder: workspaceColors.border,
    colorBorderSecondary: workspaceColors.borderSubtle,
    colorFill: workspaceColors.fill,
    colorFillSecondary: workspaceColors.fillSecondary,
    colorFillTertiary: workspaceColors.fillTertiary,
    colorFillQuaternary: workspaceColors.fillQuaternary,
    colorBgLayout: workspaceColors.canvas,
    colorBgContainer: workspaceColors.surface,
    colorBgElevated: workspaceColors.surface,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontSize: 14,
  },
  components: {
    // Workspace 视觉语言是扁平化;antd v6 默认给按钮加底部投影,置 none 保持平面。
    Button: {
      defaultShadow: "none", primaryShadow: "none", dangerShadow: "none",
      defaultColor: workspaceColors.textStrong, defaultBg: workspaceColors.surface,
      defaultBorderColor: workspaceColors.border, defaultHoverBg: workspaceColors.primary.bg,
      defaultHoverColor: workspaceColors.primary.main, defaultHoverBorderColor: workspaceColors.primary.hover,
      defaultActiveBg: workspaceColors.primary.bgHover, defaultActiveColor: workspaceColors.primary.active,
      defaultActiveBorderColor: workspaceColors.primary.active, textTextColor: workspaceColors.textSecondary,
      textTextHoverColor: workspaceColors.primary.main, textTextActiveColor: workspaceColors.primary.active,
      textHoverBg: workspaceColors.primary.bg, dangerColor: workspaceColors.danger.main,
    },
    Card: { headerBg: workspaceColors.surface, extraColor: workspaceColors.textSecondary },
    Input: {
      hoverBorderColor: workspaceColors.primary.hover, activeBorderColor: workspaceColors.primary.main,
      activeShadow: `0 0 0 2px ${workspaceColors.primary.bgHover}`,
      errorActiveShadow: `0 0 0 2px ${workspaceColors.danger.bgHover}`,
      warningActiveShadow: `0 0 0 2px ${workspaceColors.warning.bgHover}`,
    },
    Segmented: {
      itemColor: workspaceColors.textMuted, itemHoverColor: workspaceColors.textStrong,
      itemHoverBg: workspaceColors.fillTertiary, itemActiveBg: workspaceColors.primary.bg,
      itemSelectedBg: workspaceColors.surface, itemSelectedColor: workspaceColors.primary.hover,
      trackBg: workspaceColors.fillQuaternary,
    },
    Select: {
      hoverBorderColor: workspaceColors.primary.hover, activeBorderColor: workspaceColors.primary.main,
      activeOutlineColor: workspaceColors.primary.bgHover, optionSelectedColor: workspaceColors.primary.main,
      optionSelectedBg: workspaceColors.primary.bg, optionActiveBg: workspaceColors.fillTertiary,
      multipleItemBg: workspaceColors.fillTertiary, multipleItemBorderColor: workspaceColors.borderSubtle,
    },
    Table: {
      headerBg: workspaceColors.canvas, headerColor: workspaceColors.textSecondary,
      headerSortActiveBg: workspaceColors.fillTertiary, headerSortHoverBg: workspaceColors.fillSecondary,
      rowHoverBg: workspaceColors.primary.bg, rowSelectedBg: workspaceColors.primary.bgHover,
      rowSelectedHoverBg: workspaceColors.primary.border, rowExpandedBg: workspaceColors.canvas,
      borderColor: workspaceColors.borderSubtle, headerSplitColor: workspaceColors.border,
    },
    Tabs: {
      itemColor: workspaceColors.textMuted, itemHoverColor: workspaceColors.primary.hover,
      itemActiveColor: workspaceColors.primary.active, itemSelectedColor: workspaceColors.primary.main,
      inkBarColor: workspaceColors.primary.main,
    },
    Tag: { defaultBg: workspaceColors.fillTertiary, defaultColor: workspaceColors.textSecondary },
  },
};

export default function UiProvider({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider button={{ autoInsertSpace: false }} locale={zhCN} theme={workspaceTheme}>
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
