import { cn } from "@/lib/utils";
import type React from "react";

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "animate-skeleton rounded-sm [--skeleton-highlight:hsl(var(--foreground)/0.06)] [background:linear-gradient(120deg,transparent_40%,var(--skeleton-highlight),transparent_60%)_hsl(var(--muted)/0.4)_0_0/200%_100%_fixed]",
        className,
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}
