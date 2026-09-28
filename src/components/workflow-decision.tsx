"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { EvidenceUploader } from "@/components/evidence-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rupeesToPaise } from "@/lib/currency-input";
import { transitionInspectionAction } from "@/server/actions/inspection.actions";
import {
  createWorkEstimateAction,
  transitionWorkOrderAction,
} from "@/server/actions/work-order.actions";

export function WorkflowDecision({
  kind,
  id,
  assetId,
  version,
  actions,
  canUploadEvidence = false,
  canCreateEstimate = false,
}: {
  kind: "inspection" | "work";
  id: string;
  assetId?: string;
  canUploadEvidence?: boolean;
  canCreateEstimate?: boolean;
  version: number;
  actions: { action: string; label: string }[];
}) {
  const router = useRouter();
  const fieldId = useId();
  const estimateRequest = useRef<{ payload: string; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  // Submit completion fields
  const [completedOn, setCompletedOn] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [actualCostInr, setActualCostInr] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  // Estimate fields
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateInr, setEstimateInr] = useState("");
  const [estimateSource, setEstimateSource] = useState("");
  const [estimateBasis, setEstimateBasis] = useState("");
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const compDateId = `${fieldId}-completed-on`;
  const compCostId = `${fieldId}-completed-cost`;
  const compNotesId = `${fieldId}-completed-notes`;
  const estAmountId = `${fieldId}-estimate-amount`;
  const estDateId = `${fieldId}-estimate-date`;
  const estSourceId = `${fieldId}-estimate-source`;
  const estBasisId = `${fieldId}-estimate-basis`;

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      if (kind === "inspection") {
        const result = await transitionInspectionAction({
          id,
          expectedVersion: version,
          action,
          reason: reason.trim(),
        });
        if (!result.success) throw new Error(result.error);
      } else {
        const actualCostPaise = actualCostInr.trim()
          ? rupeesToPaise(actualCostInr)
          : undefined;
        const data =
          action === "submit_completion"
            ? {
                completed_on: completedOn,
                actual_cost_paise: actualCostPaise,
                completion_notes: completionNotes.trim() || reason.trim(),
              }
            : undefined;

        const result = await transitionWorkOrderAction({
          id,
          expectedVersion: version,
          action,
          data,
          reason: reason.trim(),
        });
        if (!result.success) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      setMessage("Workflow decision committed successfully.");
      setReason("");
      setCompletionNotes("");
      setActualCostInr("");
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  const estimateMutation = useMutation({
    mutationFn: async () => {
      const amountPaise = rupeesToPaise(estimateInr);
      if (amountPaise === "0")
        throw new Error("Enter a positive estimate in rupees.");
      const input = {
        workOrderId: id,
        amountPaise,
        source: estimateSource.trim(),
        basis: estimateBasis.trim(),
        date: estimateDate,
      };
      const payload = JSON.stringify(input);
      if (estimateRequest.current?.payload !== payload)
        estimateRequest.current = { payload, id: crypto.randomUUID() };
      const res = await createWorkEstimateAction({
        ...input,
        requestId: estimateRequest.current.id,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setMessage("Work estimate (SoR) recorded. Awaiting senior review.");
      setEstimateOpen(false);
      estimateRequest.current = null;
      setEstimateInr("");
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  if (!actions.length && !canUploadEvidence && !canCreateEstimate) return null;

  const hasSubmitCompletion = actions.some(
    (a) => a.action === "submit_completion",
  );

  return (
    <details className="rounded-md border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium text-primary">
        Review / update
      </summary>
      <div className="mt-3 space-y-3">
        {canUploadEvidence && assetId && (
          <EvidenceUploader
            assetId={assetId}
            inspectionId={kind === "inspection" ? id : undefined}
            workOrderId={kind === "work" ? id : undefined}
          />
        )}
        {hasSubmitCompletion && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
            <p className="font-semibold text-foreground">
              Completion Details (Mandatory for Completion)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor={compDateId}
                  className="block text-muted-foreground mb-1"
                >
                  Actual Completion Date *
                </label>
                <Input
                  id={compDateId}
                  type="date"
                  value={completedOn}
                  onChange={(e) => setCompletedOn(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor={compCostId}
                  className="block text-muted-foreground mb-1"
                >
                  Actual Cost Incurred (₹ INR) *
                </label>
                <Input
                  id={compCostId}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 85000"
                  value={actualCostInr}
                  onChange={(e) => setActualCostInr(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={compNotesId}
                className="block text-muted-foreground mb-1"
              >
                Completion Notes *
              </label>
              <textarea
                id={compNotesId}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Field observations upon completion, contractor clearance..."
                className="w-full rounded border bg-background p-1.5 text-xs"
                rows={2}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor={fieldId} className="block text-xs font-medium">
            Decision Reason *
          </label>
          <textarea
            id={fieldId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Official justification for this workflow step..."
            className="min-h-16 w-full rounded-md border bg-background p-2 text-sm mt-1"
            maxLength={1000}
            disabled={mutation.isPending}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {actions.map((item) => (
            <Button
              key={item.action}
              variant="outline"
              size="sm"
              disabled={
                !reason.trim() ||
                mutation.isPending ||
                (item.action === "submit_completion" && !actualCostInr)
              }
              onClick={() => {
                setMessage("");
                mutation.mutate(item.action);
              }}
            >
              {mutation.isPending ? "Saving…" : item.label}
            </Button>
          ))}

          {kind === "work" && canCreateEstimate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEstimateOpen(!estimateOpen)}
            >
              {estimateOpen ? "Close Estimate" : "+ Sourced Estimate"}
            </Button>
          )}
        </div>

        {/* Expandable Sourced Estimate form */}
        {estimateOpen && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
            <p className="font-semibold text-primary">
              Record Sourced Estimate (Schedule of Rates)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor={estAmountId}
                  className="block text-muted-foreground mb-1"
                >
                  Estimated Amount (₹ INR) *
                </label>
                <Input
                  id={estAmountId}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 250000"
                  value={estimateInr}
                  onChange={(e) => setEstimateInr(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor={estDateId}
                  className="block text-muted-foreground mb-1"
                >
                  Estimate Date *
                </label>
                <Input
                  id={estDateId}
                  type="date"
                  value={estimateDate}
                  onChange={(e) => setEstimateDate(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={estSourceId}
                className="block text-muted-foreground mb-1"
              >
                Source / Schedule of Rates Reference *
              </label>
              <Input
                id={estSourceId}
                value={estimateSource}
                onChange={(e) => setEstimateSource(e.target.value)}
                placeholder="e.g. CPWD DSR 2023 Item 4.12"
                className="h-8 text-xs bg-background"
              />
            </div>
            <div>
              <label
                htmlFor={estBasisId}
                className="block text-muted-foreground mb-1"
              >
                Basis of Estimate *
              </label>
              <Input
                id={estBasisId}
                value={estimateBasis}
                onChange={(e) => setEstimateBasis(e.target.value)}
                placeholder="e.g. Quantity estimate based on 120m chainage survey"
                className="h-8 text-xs bg-background"
              />
            </div>
            <Button
              size="sm"
              disabled={!estimateInr || estimateMutation.isPending}
              onClick={() => estimateMutation.mutate()}
            >
              {estimateMutation.isPending ? "Recording…" : "Save Estimate"}
            </Button>
          </div>
        )}

        {message && (
          <p
            role={
              mutation.isError || estimateMutation.isError ? "alert" : "status"
            }
            className={`text-xs ${
              mutation.isError || estimateMutation.isError
                ? "text-destructive"
                : "text-green-600 dark:text-green-400 font-medium"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
