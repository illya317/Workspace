import type { ReactNode } from "react";

export interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export default function PageContent({ children, className = "" }: PageContentProps) {
  return (
    <main className={`mx-auto max-w-7xl px-4 py-6 ${className}`}>
      {children}
    </main>
  );
}
