"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportClientErrorAction } from "@/server/actions/client-error.actions";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientErrorAction({
      errorType: /^[a-z\d_$]{1,80}$/i.test(error.name) ? error.name : "Error",
      digest:
        error.digest && /^[a-z\d_-]{1,100}$/i.test(error.digest)
          ? error.digest
          : undefined,
    });
  }, [error]);

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="mx-auto my-12 max-w-lg rounded-xl border border-destructive/20 bg-card p-6 text-center shadow-xs space-y-4"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          This Section Could Not Be Loaded
        </h1>
        <p className="text-sm text-muted-foreground">
          An error occurred while loading departmental data or applying your
          current permissions.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground/70">
            Digest: {error.digest}
          </p>
        )}
      </div>
      <div className="flex justify-center gap-2 pt-2">
        <Button onClick={reset} size="sm">
          <RotateCcw className="size-3.5" />
          Try Again
        </Button>
        <Link
          href="/app/dashboard"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Home className="size-3.5" />
          Dashboard
        </Link>
      </div>
    </section>
  );
}
