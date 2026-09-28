"use client";

import { ArrowUpDown, Filter, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, Panel, StatusBadge } from "@/components/asset-ui";
import { InspectionCorrectionForm } from "@/components/inspection-correction-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { WorkOrderCorrectionForm } from "@/components/work-order-correction-form";
import { WorkflowDecision } from "@/components/workflow-decision";

export interface OperationalQueueRow {
  id: string;
  assetId: string;
  assetName: string;
  assetCode: string;
  department: string;
  date: string | null;
  due?: string | null;
  status: string;
  condition?: string | null;
  description?: string | null;
  version: number;
  canWrite?: boolean;
  canReview?: boolean;
  canAccept?: boolean;
  canEvidence?: boolean;
  createdBy?: string;
  assignee?: string | null;
}

interface OperationalQueueClientProps {
  kind: "inspection" | "work";
  actorId: string;
  rows: OperationalQueueRow[];
  total: number;
  page: number;
  pageSize?: number;
  department?: string;
}

export function OperationalQueueClient({
  kind,
  actorId,
  rows,
  total,
  page,
  department,
}: OperationalQueueClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const base = kind === "inspection" ? "/app/inspections" : "/app/maintenance";

  function pageLink(next: number) {
    const params = new URLSearchParams({ page: String(next) });
    if (department) params.set("department", department);
    return `${base}?${params}`;
  }

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // Filter by text search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.assetName.toLowerCase().includes(q) ||
          r.assetCode.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false) ||
          (r.condition?.toLowerCase().includes(q) ?? false),
      );
    }

    // Filter by status
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let valA = "";
      let valB = "";

      if (sortColumn === "asset") {
        valA = a.assetName;
        valB = b.assetName;
      } else if (sortColumn === "department") {
        valA = a.department;
        valB = b.department;
      } else if (sortColumn === "status") {
        valA = a.status;
        valB = b.status;
      } else if (sortColumn === "date") {
        valA = a.date ?? "";
        valB = b.date ?? "";
      }

      const cmp = valA.localeCompare(valB);
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rows, search, statusFilter, sortColumn, sortDirection]);

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getPresetButtonClass = (isActive: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
      isActive
        ? "bg-slate-900 text-white shadow-xs"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
    }`;

  return (
    <div className="space-y-4">
      {/* Preset Views Bar */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={getPresetButtonClass(statusFilter === "")}
        >
          All Items ({rows.length})
        </button>

        {kind === "inspection" ? (
          <>
            <button
              type="button"
              onClick={() => setStatusFilter("submitted")}
              className={getPresetButtonClass(statusFilter === "submitted")}
            >
              Awaiting Review (
              {rows.filter((r) => r.status === "submitted").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("draft")}
              className={getPresetButtonClass(statusFilter === "draft")}
            >
              My Drafts ({rows.filter((r) => r.status === "draft").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("approved")}
              className={getPresetButtonClass(statusFilter === "approved")}
            >
              Approved Findings (
              {rows.filter((r) => r.status === "approved").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("correction_required")}
              className={getPresetButtonClass(
                statusFilter === "correction_required",
              )}
            >
              Corrections Needed (
              {rows.filter((r) => r.status === "correction_required").length})
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStatusFilter("proposed")}
              className={getPresetButtonClass(statusFilter === "proposed")}
            >
              Awaiting Approval (
              {rows.filter((r) => r.status === "proposed").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={getPresetButtonClass(statusFilter === "in_progress")}
            >
              In Progress (
              {rows.filter((r) => r.status === "in_progress").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("completion_submitted")}
              className={getPresetButtonClass(
                statusFilter === "completion_submitted",
              )}
            >
              Completion Submitted (
              {rows.filter((r) => r.status === "completion_submitted").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("accepted")}
              className={getPresetButtonClass(statusFilter === "accepted")}
            >
              Accepted & Completed (
              {rows.filter((r) => r.status === "accepted").length})
            </button>
          </>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-white p-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              kind === "inspection"
                ? "Filter by asset name, code, condition..."
                : "Filter by asset, scope description, department..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-200 pl-9 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="">All Statuses</option>
              {kind === "inspection" ? (
                <>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="correction_required">
                    Correction Required
                  </option>
                </>
              ) : (
                <>
                  <option value="proposed">Proposed</option>
                  <option value="approved">Approved</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completion_submitted">
                    Completion Submitted
                  </option>
                  <option value="accepted">Accepted</option>
                  <option value="correction_required">
                    Correction Required
                  </option>
                </>
              )}
            </select>
          </div>

          {(search || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
              }}
              className="h-8 gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <Panel
        title={`${total.toLocaleString("en-IN")} Total Records (${filteredAndSortedRows.length} displayed)`}
        description="Showing records within your current authorised statutory department scope."
      >
        {!filteredAndSortedRows.length ? (
          <EmptyState>
            {rows.length === 0
              ? `No ${kind === "inspection" ? "inspections" : "restoration records"} in this scope.`
              : "No records match your active filters. Try resetting the search or status."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground bg-slate-50/50">
                <tr>
                  <th
                    onClick={() => toggleSort("asset")}
                    className="cursor-pointer select-none px-3 py-3 font-medium hover:text-slate-900"
                  >
                    <span className="flex items-center gap-1">
                      Asset
                      <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort("department")}
                    className="cursor-pointer select-none px-3 py-3 font-medium hover:text-slate-900"
                  >
                    <span className="flex items-center gap-1">
                      Department
                      <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort("date")}
                    className="cursor-pointer select-none px-3 py-3 font-medium hover:text-slate-900"
                  >
                    <span className="flex items-center gap-1">
                      {kind === "inspection" ? "Observed / Due" : "Target Date"}
                      <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort("status")}
                    className="cursor-pointer select-none px-3 py-3 font-medium hover:text-slate-900"
                  >
                    <span className="flex items-center gap-1">
                      Status
                      <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    </span>
                  </th>
                  <th className="px-3 py-3 font-medium">
                    {kind === "inspection" ? "Condition" : "Scope"}
                  </th>
                  <th className="min-w-56 px-3 py-3 font-medium">
                    Statutory Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedRows.map((row) => {
                  const options: { action: string; label: string }[] = [];
                  if (kind === "inspection") {
                    if (
                      ["draft", "correction_required"].includes(row.status) &&
                      row.canWrite &&
                      row.createdBy === actorId
                    )
                      options.push({ action: "submit", label: "Submit" });
                    if (
                      row.status === "submitted" &&
                      row.canReview &&
                      row.createdBy !== actorId
                    )
                      options.push(
                        { action: "approve", label: "Approve" },
                        { action: "return", label: "Return for correction" },
                      );
                  } else {
                    if (
                      ["proposed", "correction_required"].includes(
                        row.status,
                      ) &&
                      row.canReview &&
                      row.createdBy !== actorId
                    )
                      options.push({
                        action: "approve",
                        label: "Approve proposal",
                      });
                    if (
                      row.status === "approved" &&
                      row.canWrite &&
                      row.assignee === actorId
                    )
                      options.push({ action: "start", label: "Start work" });
                    if (
                      row.status === "in_progress" &&
                      row.canWrite &&
                      row.assignee === actorId
                    )
                      options.push({
                        action: "submit_completion",
                        label: "Submit completion",
                      });
                    if (
                      row.status === "completion_submitted" &&
                      row.canAccept &&
                      row.assignee !== actorId
                    )
                      options.push({
                        action: "accept",
                        label: "Accept completion",
                      });
                    if (
                      ["proposed", "completion_submitted"].includes(
                        row.status,
                      ) &&
                      row.canReview &&
                      row.createdBy !== actorId
                    )
                      options.push({
                        action: "return",
                        label: "Return for correction",
                      });
                  }

                  return (
                    <tr
                      key={row.id}
                      className="align-top hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <Link
                          className="font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                          href={`/app/assets/${row.assetId}`}
                        >
                          {row.assetName}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {row.assetCode}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        {row.department}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="font-medium text-slate-800">
                          {row.date ?? "Not recorded"}
                        </span>
                        {kind === "inspection" && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Due: {row.due ?? "Unknown"}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="max-w-xs px-3 py-3">
                        {kind === "inspection" ? (
                          row.condition ? (
                            <StatusBadge value={row.condition} />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              None
                            </span>
                          )
                        ) : (
                          <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
                            {row.description}
                          </p>
                        )}
                      </td>
                      <td className="space-y-2 px-3 py-3">
                        {row.canWrite &&
                          row.createdBy === actorId &&
                          (kind === "inspection" &&
                          ["draft", "correction_required"].includes(
                            row.status,
                          ) ? (
                            <InspectionCorrectionForm id={row.id} />
                          ) : kind === "work" &&
                            ["proposed", "correction_required"].includes(
                              row.status,
                            ) ? (
                            <WorkOrderCorrectionForm id={row.id} />
                          ) : null)}
                        <WorkflowDecision
                          kind={kind}
                          id={row.id}
                          assetId={row.assetId}
                          canUploadEvidence={
                            Boolean(row.canEvidence) &&
                            (kind === "inspection"
                              ? ["draft", "correction_required"].includes(
                                  row.status,
                                ) && row.createdBy === actorId
                              : [
                                  "proposed",
                                  "correction_required",
                                  "approved",
                                  "in_progress",
                                ].includes(row.status) &&
                                (row.assignee === actorId ||
                                  Boolean(row.canReview)))
                          }
                          canCreateEstimate={
                            kind === "work" &&
                            Boolean(row.canWrite) &&
                            ["proposed", "correction_required"].includes(
                              row.status,
                            )
                          }
                          version={row.version}
                          actions={options}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 20))}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={pageLink(page - 1)}
              >
                Previous
              </Link>
            )}
            {page * 20 < total && (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={pageLink(page + 1)}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
