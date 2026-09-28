"use client";

import {
  AlertTriangle,
  CheckCircle,
  Copy,
  PlusCircle,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  flagDuplicateAction,
  reviewDuplicateAction,
} from "@/server/actions/asset.actions";
import { logComplaintAction } from "@/server/actions/complaint.actions";
import type {
  ComplaintChannel,
  ComplaintSeverity,
} from "@/server/domain/entities/complaint.entity";

interface DuplicateCandidateItem {
  id: string;
  assetId: string;
  candidateAssetId: string;
  reason: string;
  status: string; // 'pending' | 'confirmed' | 'dismissed'
  flaggedBy: string;
  decisionReason?: string | null;
}

export function AssetGrievanceAndDuplicateTools({
  assetId,
  departmentId,
  duplicateCandidates = [],
  actorId,
  canVerify,
}: {
  assetId: string;
  departmentId: string;
  duplicateCandidates?: DuplicateCandidateItem[];
  actorId?: string;
  canVerify?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Log Grievance Modal
  const [isGrievanceOpen, setIsGrievanceOpen] = useState(false);
  const [channel, setChannel] = useState<ComplaintChannel>("phone");
  const [severity, setSeverity] = useState<ComplaintSeverity>("medium");
  const [narrative, setNarrative] = useState("");
  const [extRef, setExtRef] = useState("");
  const [grievanceError, setGrievanceError] = useState("");

  // Flag Duplicate Modal
  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [flagError, setFlagError] = useState("");

  // Review Duplicate Modal
  const [reviewTarget, setReviewTarget] =
    useState<DuplicateCandidateItem | null>(null);
  const [reviewConfirm, setReviewConfirm] = useState(true);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState("");

  const [notice, setNotice] = useState("");

  const handleLogGrievance = (e: React.FormEvent) => {
    e.preventDefault();
    setGrievanceError("");
    startTransition(async () => {
      const res = await logComplaintAction({
        departmentId,
        assetId,
        channel,
        severity,
        narrative,
        externalReference: extRef.trim() || undefined,
      });

      if (!res.success) {
        setGrievanceError(res.error || "Failed to record citizen grievance.");
        return;
      }

      setNotice("Citizen grievance recorded and linked to asset successfully.");
      setIsGrievanceOpen(false);
      setNarrative("");
      setExtRef("");
      router.refresh();
    });
  };

  const handleFlagDuplicate = (e: React.FormEvent) => {
    e.preventDefault();
    setFlagError("");
    startTransition(async () => {
      const res = await flagDuplicateAction({
        assetId,
        candidateId,
        reason: flagReason,
      });

      if (!res.success) {
        setFlagError(res.error || "Failed to flag duplicate candidate.");
        return;
      }

      setNotice("Asset flagged as duplicate candidate for four-eyes review.");
      setIsFlagOpen(false);
      setCandidateId("");
      setFlagReason("");
      router.refresh();
    });
  };

  const handleReviewDuplicate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewError("");
    startTransition(async () => {
      const res = await reviewDuplicateAction({
        id: reviewTarget.id,
        confirm: reviewConfirm,
        reason: reviewReason,
      });

      if (!res.success) {
        setReviewError(res.error || "Failed to review duplicate candidate.");
        return;
      }

      setNotice(
        reviewConfirm
          ? "Duplicate candidate confirmed. Confirmed duplicate cannot be verified."
          : "Duplicate candidate dismissed as distinct physical asset.",
      );
      setReviewTarget(null);
      setReviewReason("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {notice && (
        <output className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </output>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-primary/20 bg-background text-foreground hover:bg-muted"
          onClick={() => setIsGrievanceOpen(true)}
        >
          <PlusCircle className="mr-1.5 h-4 w-4 text-primary" />
          Log Grievance
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-primary/20 bg-background text-foreground hover:bg-muted"
          onClick={() => setIsFlagOpen(true)}
        >
          <Copy className="mr-1.5 h-4 w-4 text-amber-600" />
          Flag Duplicate Candidate
        </Button>
      </div>

      {/* Duplicate Candidates List */}
      {duplicateCandidates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">
              Duplicate Candidate Records ({duplicateCandidates.length})
            </h3>
          </div>

          <div className="mt-3 space-y-2">
            {duplicateCandidates.map((dup) => {
              const isFlaggedByMe = dup.flaggedBy === actorId;
              const canReviewThis =
                canVerify && !isFlaggedByMe && dup.status === "pending";

              return (
                <div
                  key={dup.id}
                  className="flex flex-col justify-between gap-2 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"
                >
                  <div className="text-xs">
                    <p className="font-medium text-slate-800">
                      Paired with Asset ID:{" "}
                      <span className="font-mono">{dup.candidateAssetId}</span>
                    </p>
                    <p className="mt-0.5 text-slate-600">
                      Reason: {dup.reason}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Status:{" "}
                      <span
                        className={`font-semibold uppercase ${
                          dup.status === "confirmed"
                            ? "text-red-700"
                            : dup.status === "dismissed"
                              ? "text-emerald-700"
                              : "text-amber-700"
                        }`}
                      >
                        {dup.status}
                      </span>{" "}
                      · Flagged by: {dup.flaggedBy}
                      {dup.decisionReason &&
                        ` · Decision: ${dup.decisionReason}`}
                    </p>
                  </div>

                  {canReviewThis && (
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-emerald-600 text-xs text-emerald-800 hover:bg-emerald-50"
                        onClick={() => {
                          setReviewTarget(dup);
                          setReviewConfirm(false);
                          setReviewReason(
                            "Verified as physically distinct infrastructure asset.",
                          );
                        }}
                      >
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                        Dismiss (Distinct)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        onClick={() => {
                          setReviewTarget(dup);
                          setReviewConfirm(true);
                          setReviewReason(
                            "Confirmed identical asset registration; duplicate flagged.",
                          );
                        }}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Confirm Duplicate
                      </Button>
                    </div>
                  )}

                  {!canReviewThis &&
                    dup.status === "pending" &&
                    isFlaggedByMe && (
                      <span className="text-[11px] italic text-amber-700">
                        Independent 4-eyes review required (author cannot review
                        own flag)
                      </span>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Grievance Dialog */}
      <Dialog open={isGrievanceOpen} onOpenChange={setIsGrievanceOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleLogGrievance}>
            <DialogHeader>
              <DialogTitle>Log Citizen Grievance</DialogTitle>
              <DialogDescription>
                Record an incoming complaint or distress observation linked
                directly to this asset.
              </DialogDescription>
            </DialogHeader>

            {grievanceError && (
              <div
                role="alert"
                className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
              >
                {grievanceError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label
                  htmlFor="channel-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Intake Channel
                </label>
                <select
                  id="channel-select"
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as ComplaintChannel)
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="phone">Phone Helpline</option>
                  <option value="email">Email Dispatch</option>
                  <option value="internal">Field Observation / Internal</option>
                  <option value="other">Other Statutory Dispatch</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="severity-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Reported Severity
                </label>
                <select
                  id="severity-select"
                  value={severity}
                  onChange={(e) =>
                    setSeverity(e.target.value as ComplaintSeverity)
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="low">Low (Cosmetic/Minor)</option>
                  <option value="medium">
                    Medium (Traffic/Usage Impediment)
                  </option>
                  <option value="high">
                    High (Hazardous/Rapid Deterioration)
                  </option>
                  <option value="critical">
                    Critical (Imminent Structural Risk)
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="ext-ref-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  External Reference Number (Optional)
                </label>
                <Input
                  id="ext-ref-input"
                  placeholder="e.g. CM-HELPLINE-2026-8910"
                  value={extRef}
                  onChange={(e) => setExtRef(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label
                  htmlFor="narrative-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Narrative & Location Details *
                </label>
                <textarea
                  id="narrative-input"
                  required
                  rows={3}
                  placeholder="Describe the defect, chainage, or public safety hazard..."
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsGrievanceOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !narrative.trim()}>
                {isPending ? "Recording..." : "Record Grievance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Flag Duplicate Dialog */}
      <Dialog open={isFlagOpen} onOpenChange={setIsFlagOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleFlagDuplicate}>
            <DialogHeader>
              <DialogTitle>Flag Potential Duplicate Asset</DialogTitle>
              <DialogDescription>
                Submit another asset record suspected to represent the identical
                physical asset.
              </DialogDescription>
            </DialogHeader>

            {flagError && (
              <div
                role="alert"
                className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
              >
                {flagError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label
                  htmlFor="candidate-uuid-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Candidate Asset UUID *
                </label>
                <Input
                  id="candidate-uuid-input"
                  required
                  placeholder="e.g. a0000000-0000-0000-0000-000000000001"
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="flag-reason-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Reason / Overlap Justification *
                </label>
                <textarea
                  id="flag-reason-input"
                  required
                  rows={3}
                  placeholder="Explain why these two records reference the same physical structure..."
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFlagOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isPending || !candidateId.trim() || !flagReason.trim()
                }
              >
                {isPending ? "Submitting..." : "Flag for 4-Eyes Review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review Duplicate Dialog */}
      <Dialog
        open={!!reviewTarget}
        onOpenChange={(open) => !open && setReviewTarget(null)}
      >
        <DialogContent className="max-w-md">
          <form onSubmit={handleReviewDuplicate}>
            <DialogHeader>
              <DialogTitle>
                {reviewConfirm
                  ? "Confirm Duplicate Asset"
                  : "Dismiss Duplicate Flag"}
              </DialogTitle>
              <DialogDescription>
                {reviewConfirm
                  ? "Confirming marks the asset as a duplicate, preventing verification."
                  : "Dismissing confirms that both records represent distinct physical assets."}
              </DialogDescription>
            </DialogHeader>

            {reviewError && (
              <div
                role="alert"
                className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800"
              >
                {reviewError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label
                  htmlFor="review-reason-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Statutory Decision Reason *
                </label>
                <textarea
                  id="review-reason-input"
                  required
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewConfirm ? "destructive" : "default"}
                disabled={isPending || !reviewReason.trim()}
              >
                {isPending
                  ? "Recording Decision..."
                  : reviewConfirm
                    ? "Confirm Duplicate"
                    : "Dismiss Flag"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
