import type { ReactNode } from "react";

export interface CodeBlockProps {
  children: ReactNode;
  className?: string;
}

export default function CodeBlock({ children, className = "" }: CodeBlockProps) {
  return (
    <div className={`rounded-md bg-emerald-50 p-4 font-mono text-sm text-emerald-800 ${className}`}>
      {children}
    </div>
  );
}
