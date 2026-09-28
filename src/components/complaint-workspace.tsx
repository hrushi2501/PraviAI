"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  Link as LinkIcon,
  Plus,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader, Panel, StatusBadge } from "@/components/asset-ui";
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
import { listRegisteredAssets } from "@/server/actions/asset-register.actions";
import {
  getComplaintsAction,
  getUnlinkedComplaintsAction,
  linkComplaintToAssetAction,
  logComplaintAction,
  resolveComplaintAction,
} from "@/server/actions/complaint.actions";
import type {
  ComplaintChannel,
  ComplaintSeverity,
  ComplaintStatus,
} from "@/server/domain/entities/complaint.entity";

interface ComplaintItem {
  id: string;
  departmentId: string;
  channel: ComplaintChannel;
  narrative: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  assetId: string | null;
  resolutionNotes: string | null;
  version: number;
  createdAt: string | Date;
}

const selectStyle = "h-9 rounded-md border bg-background px-3 text-sm";

export function ComplaintWorkspace({
  departments,
}: {
  departments: { id: string; name: string; active: boolean }[];
}) {
  const params = useSearchParams();
  const initialDept = params.get("department") ?? departments[0]?.id ?? "";
  const [selectedDept, setSelectedDept] = useState(initialDept);
  const [activeTab, setActiveTab] = useState<"all" | "unlinked" | "new">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Modal states
  const [linkTarget, setLinkTarget] = useState<ComplaintItem | null>(null);
  const [linkAssetId, setLinkAssetId] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [resolveTarget, setResolveTarget] = useState<ComplaintItem | null>(
    null,
  );
  const [resolutionText, setResolutionText] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedNarratives, setExpandedNarratives] = useState<
    Record<string, boolean>
  >({});

  const toggleNarrative = (id: string) => {
    setExpandedNarratives((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ["department-assets-picker", selectedDept],
    queryFn: async () => {
      const res = await listRegisteredAssets({
        departmentId: selectedDept || undefined,
        search: "",
        page: 1,
        pageSize: 50,
      });
      return res.success ? res.data.rows : [];
    },
    enabled: Boolean(linkTarget && selectedDept),
  });

  const complaintsQuery = useQuery({
    queryKey: [
      "complaints",
      selectedDept,
      statusFilter,
      severityFilter,
      activeTab,
    ],
    queryFn: async () => {
      if (!selectedDept && activeTab !== "unlinked") return [];
      if (activeTab === "unlinked") {
        const res = await getUnlinkedComplaintsAction(
          selectedDept || undefined,
        );
        if (!res.success) throw new Error(res.error);
        return res.data as ComplaintItem[];
      }
      const filter = {
        status:
          statusFilter !== "all"
            ? (statusFilter as ComplaintStatus)
            : undefined,
        severity:
          severityFilter !== "all"
            ? (severityFilter as ComplaintSeverity)
            : undefined,
      };
      const res = await getComplaintsAction(selectedDept, filter);
      if (!res.success) throw new Error(res.error);
      return res.data as ComplaintItem[];
    },
    enabled: Boolean(selectedDept) || activeTab === "unlinked",
  });

  // Log Form
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { isSubmitting },
  } = useForm<{
    departmentId: string;
    channel: ComplaintChannel;
    severity: ComplaintSeverity;
    narrative: string;
    assetId?: string;
    externalReference?: string;
  }>({
    defaultValues: {
      departmentId: selectedDept,
      channel: "phone",
      severity: "medium",
      narrative: "",
      externalReference: "",
    },
  });

  const logMutation = useMutation({
    mutationFn: async (values: {
      departmentId: string;
      channel: ComplaintChannel;
      severity: ComplaintSeverity;
      narrative: string;
      assetId?: string;
      externalReference?: string;
    }) => {
      const res = await logComplaintAction({
        departmentId: values.departmentId,
        channel: values.channel,
        severity: values.severity,
        narrative: values.narrative.trim(),
        assetId: values.assetId?.trim() || undefined,
        externalReference: values.externalReference?.trim() || undefined,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setNotice(
        "Citizen grievance recorded successfully in departmental queue.",
      );
      resetForm();
      setActiveTab("all");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err: Error) => setNotice(`Error: ${err.message}`),
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!linkTarget || !linkAssetId.trim()) return;
      const res = await linkComplaintToAssetAction({
        complaintId: linkTarget.id,
        expectedVersion: linkTarget.version,
        assetId: linkAssetId.trim(),
        reason:
          linkReason.trim() ||
          "Triaged and linked to confirmed infrastructure asset",
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setNotice("Grievance linked to asset successfully.");
      setLinkTarget(null);
      setLinkAssetId("");
      setLinkReason("");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err: Error) => setNotice(`Error: ${err.message}`),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!resolveTarget || !resolutionText.trim()) return;
      const res = await resolveComplaintAction({
        complaintId: resolveTarget.id,
        expectedVersion: resolveTarget.version,
        resolution: resolutionText.trim(),
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      setNotice("Grievance marked resolved under statutory audit record.");
      setResolveTarget(null);
      setResolutionText("");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err: Error) => setNotice(`Error: ${err.message}`),
  });

  const rows = complaintsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Citizen Grievances & Complaints"
        description="Capture public reports, triage unlinked hazards, and link concerns to fixed infrastructure assets."
        action={
          <div className="flex gap-2">
            <Button
              variant={activeTab === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(activeTab === "new" ? "all" : "new")}
            >
              <Plus className="size-4 mr-1" />
              {activeTab === "new" ? "View Queues" : "Log New Grievance"}
            </Button>
          </div>
        }
      />

      {notice && (
        <output className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="text-xs text-muted-foreground hover:underline"
          >
            Dismiss
          </button>
        </output>
      )}

      {activeTab === "new" ? (
        <Panel
          title="Log Citizen Grievance"
          description="Record an internal or citizen-reported fault. Grievances may be linked to an asset immediately or left unlinked for field survey triage."
        >
          <form
            onSubmit={handleSubmit((data) => logMutation.mutate(data))}
            className="space-y-4 max-w-2xl"
          >
            <div>
              <label
                htmlFor="complaint-dept"
                className="block text-xs font-medium text-muted-foreground"
              >
                Department *
              </label>
              <select
                id="complaint-dept"
                {...register("departmentId", { required: true })}
                className={selectStyle}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="complaint-channel"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Reporting Channel *
                </label>
                <select
                  id="complaint-channel"
                  {...register("channel")}
                  className={selectStyle}
                >
                  <option value="phone">
                    Telephone Helpline (CM / District)
                  </option>
                  <option value="email">Official Email Dispatch</option>
                  <option value="internal">Field Staff Observation</option>
                  <option value="other">
                    Public Portal / Written Petition
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="complaint-severity"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Reported Severity *
                </label>
                <select
                  id="complaint-severity"
                  {...register("severity")}
                  className={selectStyle}
                >
                  <option value="low">Low (Cosmetic / Routine Notice)</option>
                  <option value="medium">
                    Medium (Impaired Functionality)
                  </option>
                  <option value="high">
                    High (Active Hazard / Traffic Risk)
                  </option>
                  <option value="critical">
                    Critical (Imminent Collapse / Emergency)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="complaint-narrative"
                className="block text-xs font-medium text-muted-foreground"
              >
                Grievance Narrative / Description *
              </label>
              <textarea
                id="complaint-narrative"
                rows={4}
                {...register("narrative", { required: true })}
                placeholder="Describe the defect, location landmarks, citizen contact, and observable distress..."
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="complaint-asset-id"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Target Asset UUID (Optional)
                </label>
                <Input
                  id="complaint-asset-id"
                  {...register("assetId")}
                  placeholder="Paste asset UUID if already verified"
                />
              </div>

              <div>
                <label
                  htmlFor="complaint-ext-ref"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  External Grievance Tracking ID (Optional)
                </label>
                <Input
                  id="complaint-ext-ref"
                  {...register("externalReference")}
                  placeholder="e.g. CPGRAMS/2026/049102"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || logMutation.isPending}
              >
                {logMutation.isPending
                  ? "Recording…"
                  : "Save Grievance to Queue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("all")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Department Queue
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("unlinked")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "unlinked"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Unlinked Grievances (Needs Matching)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTab === "all" && (
                <>
                  <label htmlFor="filter-dept" className="sr-only">
                    Department
                  </label>
                  <select
                    id="filter-dept"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className={selectStyle}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="filter-status" className="sr-only">
                    Status
                  </label>
                  <select
                    id="filter-status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={selectStyle}
                  >
                    <option value="all">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>

                  <label htmlFor="filter-severity" className="sr-only">
                    Severity
                  </label>
                  <select
                    id="filter-severity"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className={selectStyle}
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["complaints"] })
                }
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          </div>

          <Panel
            title={
              activeTab === "unlinked"
                ? `Unlinked Public Grievances (${rows.length})`
                : `Department Grievance Register (${rows.length})`
            }
            description="Reports requiring review, field verification, or resolution under official record."
          >
            {complaintsQuery.isPending ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Loading grievance queue…
              </div>
            ) : complaintsQuery.isError ? (
              <div
                role="alert"
                className="py-6 text-center text-sm text-destructive"
              >
                Failed to load grievances: {complaintsQuery.error.message}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No citizen grievances found matching your active filter scope.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-medium">Ref / ID</th>
                      <th className="px-3 py-3 font-medium">Channel</th>
                      <th className="px-3 py-3 font-medium">Severity</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium max-w-md">
                        Narrative
                      </th>
                      <th className="px-3 py-3 font-medium">Asset Link</th>
                      <th className="px-3 py-3 font-medium text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3 font-mono text-xs">
                          {row.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-3 text-xs capitalize">
                          {row.channel}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={row.severity} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={row.status} />
                        </td>
                        <td className="px-3 py-3 text-xs max-w-md leading-relaxed">
                          <p
                            className={
                              expandedNarratives[row.id] ? "" : "line-clamp-2"
                            }
                          >
                            {row.narrative}
                          </p>
                          {row.narrative.length > 100 && (
                            <button
                              type="button"
                              onClick={() => toggleNarrative(row.id)}
                              className="mt-1 text-[11px] font-medium text-emerald-800 underline hover:text-emerald-950"
                            >
                              {expandedNarratives[row.id]
                                ? "Show less"
                                : "Read full narrative"}
                            </button>
                          )}
                          {row.resolutionNotes && (
                            <p className="mt-1 text-xs text-green-700 dark:text-green-400 font-medium">
                              Resolution: {row.resolutionNotes}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {row.assetId ? (
                            <Link
                              href={`/app/assets/${row.assetId}`}
                              className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                            >
                              {row.assetId.slice(0, 8)}
                              <ArrowUpRight className="size-3" />
                            </Link>
                          ) : (
                            <span className="rounded bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                              Unlinked
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {!row.assetId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLinkTarget(row)}
                              >
                                <LinkIcon className="size-3 mr-1" />
                                Link Asset
                              </Button>
                            )}
                            {row.status !== "resolved" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setResolveTarget(row)}
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* Link to Asset Modal */}
      {linkTarget && (
        <Dialog
          open={Boolean(linkTarget)}
          onOpenChange={() => setLinkTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link Grievance to Fixed Asset</DialogTitle>
              <DialogDescription>
                Assign this citizen grievance to an infrastructure asset in your
                department register.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Grievance: {linkTarget.narrative}
              </p>

              <div>
                <label
                  htmlFor="link-asset-select"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Select Asset from Register *
                </label>
                <select
                  id="link-asset-select"
                  value={linkAssetId}
                  onChange={(e) => setLinkAssetId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800"
                >
                  <option value="">-- Choose an asset from register --</option>
                  {assetsQuery.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name} ({a.registration})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Or paste a specific UUID manually:
                </p>
                <Input
                  id="link-target-id"
                  value={linkAssetId}
                  onChange={(e) => setLinkAssetId(e.target.value)}
                  placeholder="Paste verified asset UUID"
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="link-reason"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Official Triaging Reason *
                </label>
                <Input
                  id="link-reason"
                  value={linkReason}
                  onChange={(e) => setLinkReason(e.target.value)}
                  placeholder="e.g. Field inspection confirmed spalling at chainage Km 4+200"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={!linkAssetId.trim() || linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
              >
                {linkMutation.isPending ? "Linking…" : "Confirm Linkage"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Resolve Modal */}
      {resolveTarget && (
        <Dialog
          open={Boolean(resolveTarget)}
          onOpenChange={() => setResolveTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Statutory Grievance Resolution</DialogTitle>
              <DialogDescription>
                Close this citizen report with an official justification. The
                audit trail will record your identity.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Grievance: {resolveTarget.narrative}
              </p>

              <div>
                <label
                  htmlFor="resolve-notes"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Resolution Explanation / Work Reference *
                </label>
                <textarea
                  id="resolve-notes"
                  rows={3}
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder="e.g. Restored under emergency pothole repair work order #48102, inspected and accepted."
                  className="w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={!resolutionText.trim() || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate()}
              >
                {resolveMutation.isPending
                  ? "Resolving…"
                  : "Submit Official Resolution"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
