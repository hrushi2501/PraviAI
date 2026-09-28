"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function SignInPanel() {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setDelayed(true), 20000);
    return () => clearTimeout(timeout);
  }, []);
  const retry = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.location.reload()}
    >
      Retry
    </Button>
  );
  return (
    <>
      <ClerkLoading>
        <output className="w-full max-w-sm rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {delayed ? (
            <div className="space-y-3">
              <p>
                Sign-in is taking longer than expected. Check your connection
                and try again.
              </p>
              {retry}
            </div>
          ) : (
            "Loading secure sign-in…"
          )}
        </output>
      </ClerkLoading>
      <ClerkFailed>
        <div
          role="alert"
          className="space-y-3 rounded-lg border bg-card p-6 text-center text-sm"
        >
          <p>Sign-in could not be loaded.</p>
          {retry}
        </div>
      </ClerkFailed>
      <ClerkLoaded>
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl="/app/dashboard"
        />
      </ClerkLoaded>
    </>
  );
}
