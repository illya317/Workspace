"use client";

import { useLayoutEffect, useRef } from "react";

export default function AutoResizeTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [props.value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`resize-none overflow-hidden text-gray-900 ${className || ""}`}
      {...props}
    />
  );
}
