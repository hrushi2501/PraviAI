"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans text-zinc-900 antialiased">
        <div
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-xs space-y-6"
        >
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="size-7" />
          </div>

          <div className="space-y-2">
            <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-mono font-medium text-red-700">
              System Critical
            </span>
            <h1 className="text-xl font-bold tracking-tight">
              Root Layout Failure
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              A critical error prevented the interface from mounting. Please
              retry the connection or reload the application.
            </p>
            {error.digest && (
              <p className="font-mono text-xs text-zinc-500">
                Digest: {error.digest}
              </p>
            )}
          </div>

          <div className="pt-2">
            <Button
              onClick={() => {
                reset();
                window.location.reload();
              }}
              className="w-full"
            >
              <RotateCcw className="size-4" />
              Reload Application
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
