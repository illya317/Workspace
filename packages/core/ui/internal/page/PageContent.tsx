import type { ReactNode } from "react";

export interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export default function PageContent({ children, className = "" }: PageContentProps) {
  return (
    <main className={`mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 ${className}`}>
      {children}
    </main>
  );
}
