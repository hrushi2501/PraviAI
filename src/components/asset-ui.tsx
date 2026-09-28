import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  in_progress: "In progress",
  completion_submitted: "Completion submitted",
  in_service: "In service",
  correction_required: "Corrections required",
};
export function StatusBadge({ value }: { value: string }) {
  const tone = ["critical", "closed"].includes(value)
    ? "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-200"
    : [
          "poor",
          "stale",
          "restricted",
          "proposed",
          "submitted",
          "pending",
          "correction_required",
          "completion_submitted",
        ].includes(value)
      ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
      : [
            "good",
            "verified",
            "approved",
            "published",
            "accepted",
            "current",
          ].includes(value)
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200"
        : "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        tone,
      )}
    >
      {labels[value] ?? value.replaceAll("_", " ")}
    </span>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
