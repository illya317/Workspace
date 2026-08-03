"use client";

import type { ReactNode } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider, type ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";

const workspaceTheme: ThemeConfig = {
  token: {
    colorPrimary: "#0f766e",
    colorInfo: "#0f766e",
    colorSuccess: "#15803d",
    colorWarning: "#b45309",
    colorError: "#b91c1c",
    colorText: "#172033",
    colorTextSecondary: "#64748b",
    colorBorderSecondary: "#e2e8f0",
    colorBgContainer: "#ffffff",
    borderRadius: 10,
    borderRadiusLG: 14,
    fontSize: 14,
  },
  components: {
    // Workspace 视觉语言是扁平化;antd v6 默认给按钮加底部投影,置 none 保持平面。
    Button: { defaultShadow: "none", primaryShadow: "none", dangerShadow: "none" },
    Card: { headerBg: "#ffffff" },
    Table: { headerBg: "#f8fafc", headerColor: "#475569", rowHoverBg: "#f0fdfa" },
    Tabs: { itemSelectedColor: "#0f766e", inkBarColor: "#0f766e" },
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
