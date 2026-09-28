"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  linkWorkVerificationAction,
  reviewWorkEstimateAction,
} from "@/server/actions/work-order.actions";

export function EstimateReview({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const field = useId();
  const router = useRouter();
  const review = useMutation({
    mutationFn: async (approve: boolean) => {
      const result = await reviewWorkEstimateAction({ id, approve, reason });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => router.refresh(),
  });
  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={field} className="block text-xs">
        Estimate review reason
      </label>
      <Input
        id={field}
        value={reason}
        maxLength={1000}
        disabled={review.isPending}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!reason.trim() || review.isPending}
          onClick={() => review.mutate(true)}
        >
          Approve estimate
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!reason.trim() || review.isPending}
          onClick={() => review.mutate(false)}
        >
          Reject estimate
        </Button>
      </div>
      {review.isError && (
        <p role="alert" className="text-xs text-red-700">
          {review.error.message}
        </p>
      )}
      {review.isSuccess && (
        <output className="block text-xs">Review recorded.</output>
      )}
    </div>
  );
}

export function WorkVerification({
  workId,
  version,
  inspections,
}: {
  workId: string;
  version: number;
  inspections: { id: string; observedOn: string; condition: string }[];
}) {
  const [inspectionId, setInspectionId] = useState("");
  const [reason, setReason] = useState("");
  const id = useId();
  const router = useRouter();
  const link = useMutation({
    mutationFn: async () => {
      const result = await linkWorkVerificationAction({
        workId,
        expectedVersion: version,
        inspectionId,
        reason,
      });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => router.refresh(),
  });
  return (
    <form
      className="mt-3 space-y-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        link.mutate();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Link an independently approved reinspection created after completion
        acceptance. The server verifies dates and independence.
      </p>
      <label htmlFor={`${id}-inspection`} className="block text-xs">
        Approved reinspection
      </label>
      <select
        id={`${id}-inspection`}
        className="w-full rounded-md border bg-white p-2 text-sm"
        required
        value={inspectionId}
        onChange={(event) => setInspectionId(event.target.value)}
        disabled={link.isPending}
      >
        <option value="">Choose an inspection</option>
        {inspections.map((item) => (
          <option key={item.id} value={item.id}>
            {item.observedOn} · {item.condition}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-reason`} className="block text-xs">
        Reason for linking
      </label>
      <Input
        id={`${id}-reason`}
        required
        maxLength={1000}
        value={reason}
        disabled={link.isPending}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        size="sm"
        disabled={!inspectionId || !reason.trim() || link.isPending}
      >
        Link reinspection
      </Button>
      {link.isError && (
        <p role="alert" className="text-xs text-red-700">
          {link.error.message}
        </p>
      )}
      {link.isSuccess && (
        <output className="block text-xs">Reinspection linked.</output>
      )}
    </form>
  );
}
