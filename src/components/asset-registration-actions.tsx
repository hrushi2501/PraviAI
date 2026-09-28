"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { transitionAssetAction } from "@/server/actions/asset.actions";

export function AssetRegistrationActions({
  assetId,
  version,
  status,
  canSubmit,
  canReview,
}: {
  assetId: string;
  version: number;
  status: string;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function act(action: string) {
    if (!reason.trim()) {
      setFailed(true);
      setMessage("Enter a reason before continuing.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await transitionAssetAction({
        assetId,
        expectedVersion: version,
        action,
        reason: reason.trim(),
      });
      setFailed(!result.success);
      if (result.success) {
        setMessage("Registration updated.");
        setReason("");
        router.refresh();
      } else
        setMessage(
          result.code === "VERSION_CONFLICT"
            ? `${result.error} Refresh before reviewing again.`
            : result.error,
        );
    } catch {
      setFailed(true);
      setMessage("The update could not be completed. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  const submit = canSubmit && ["draft", "correction_required"].includes(status);
  const review = canReview && status === "submitted";
  if (!submit && !review) return null;
  return (
    <section className="rounded-lg border bg-white p-5 space-y-3">
      <h2 className="font-semibold">Registration review</h2>
      <p className="text-sm text-muted-foreground">
        Changes use record version {version}. Submission requires a canonical
        region and documentary source; the server validates your current
        permissions.
      </p>
      <label className="block text-sm" htmlFor="registration-reason">
        Reason
      </label>
      <textarea
        id="registration-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={busy}
        className="w-full rounded-md border px-3 py-2 text-sm"
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        {submit && (
          <Button disabled={busy} onClick={() => act("submit")}>
            Submit for verification
          </Button>
        )}
        {review && (
          <>
            <Button disabled={busy} onClick={() => act("verify")}>
              Verify registration
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act("return")}
            >
              Return for correction
            </Button>
          </>
        )}
      </div>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "text-sm text-red-700" : "text-sm text-green-700"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
