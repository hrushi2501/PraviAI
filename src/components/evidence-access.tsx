"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestAuditedEvidenceUrlAction } from "@/server/actions/evidence.actions";

export function EvidenceAccess({ evidenceId }: { evidenceId: string }) {
  const id = useId();
  const [purpose, setPurpose] = useState("");
  const access = useMutation({
    mutationFn: async () => {
      const result = await requestAuditedEvidenceUrlAction({
        evidenceId,
        purpose: purpose.trim(),
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        access.mutate();
      }}
    >
      <label htmlFor={id} className="block text-xs">
        Purpose for accessing this file
      </label>
      <Input
        id={id}
        value={purpose}
        required
        maxLength={500}
        disabled={access.isPending}
        onChange={(event) => {
          setPurpose(event.target.value);
          access.reset();
        }}
        placeholder="For example: review inspection findings"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={access.isPending || !purpose.trim()}
      >
        {access.isPending ? "Authorizing…" : "Request file access"}
      </Button>
      {access.isError && (
        <p role="alert" className="text-xs text-red-700">
          {access.error.message}
        </p>
      )}
      {access.data && (
        <a
          href={access.data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-3 text-sm text-primary underline"
        >
          Open authorized file (expires in 60 seconds)
        </a>
      )}
    </form>
  );
}
