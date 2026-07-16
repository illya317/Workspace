import type { Metadata } from "next";
import "./globals.css";
import AppVersionGuard from "@workspace/platform/ui/AppVersionGuard";
import WorkspacePageAssistantProvider from "@workspace/platform/ui/PageAssistantProvider";
import { FeedbackProvider } from "@workspace/core/ui";
import { getAppVersion } from "@workspace/platform/server/app-version";
import { getCurrentUser } from "@workspace/platform/server/auth";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
  description: `${process.env.NEXT_PUBLIC_COMPANY_NAME || ""}企业内部工作管理平台`,
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appVersion = getAppVersion();
  const user = await getCurrentUser();
  const canUseAgentAssistant = user?.visibleSubmitResourceKeys?.includes("agent.assistant") ?? false;

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <FeedbackProvider>
          <WorkspacePageAssistantProvider enabled={canUseAgentAssistant}>
            <AppVersionGuard version={appVersion} />
            {children}
          </WorkspacePageAssistantProvider>
        </FeedbackProvider>
      </body>
    </html>
  );
}
