import type { Metadata } from "next";
import "./globals.css";
import AgentProvider from "@workspace/platform/ui/agent";
import ConfirmProvider from "@workspace/core/ui/ConfirmProvider";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
  description: `${process.env.NEXT_PUBLIC_COMPANY_NAME || ""}企业内部工作管理平台`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ConfirmProvider>
          {children}
          <AgentProvider />
        </ConfirmProvider>
      </body>
    </html>
  );
}
