"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportClientErrorAction } from "@/server/actions/client-error.actions";

export default function RootError({
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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div
        role="alert"
        aria-live="assertive"
        className="w-full max-w-lg rounded-xl border border-destructive/20 bg-card p-8 shadow-xs text-center space-y-6"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" />
        </div>

        <div className="space-y-2">
          <span className="inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-mono font-medium text-destructive">
            Application Error
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            An Unexpected System Error Occurred
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The application encountered an issue while processing this request.
            Your session remains secure, and transaction boundaries have rolled
            back.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground/80">
              Audit Reference Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} size="default">
            <RotateCcw className="size-4" />
            Retry Request
          </Button>
          <Link
            href="/app/dashboard"
            className={buttonVariants({ variant: "outline", size: "default" })}
          >
            <Home className="size-4" />
            Return to Dashboard
          </Link>
        </div>

        <div className="border-t pt-4 text-xs text-muted-foreground">
          If repeated attempts fail, verify your database connectivity and
          department membership grants with your administrator.
        </div>
      </div>
    </main>
  );
}
