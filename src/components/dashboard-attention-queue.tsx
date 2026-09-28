"use client";

import { ArrowUpRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/asset-ui";

interface AttentionItem {
  assetId: string | null;
  reason: string | null;
  sourceId: string | null;
  sourceAt: string | Date | null;
}

export function DashboardAttentionQueue({
  items,
  department,
}: {
  items: AttentionItem[];
  department?: string;
}) {
  const [filterTab, setFilterTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by tab
    if (filterTab === "critical") {
      result = result.filter((i) =>
        (i.reason ?? "").toLowerCase().includes("critical"),
      );
    } else if (filterTab === "poor") {
      result = result.filter((i) =>
        (i.reason ?? "").toLowerCase().includes("poor"),
      );
    } else if (filterTab === "inspection") {
      result = result.filter(
        (i) =>
          (i.reason ?? "").toLowerCase().includes("inspection") ||
          (i.reason ?? "").toLowerCase().includes("due") ||
          (i.reason ?? "").toLowerCase().includes("review") ||
          (i.reason ?? "").toLowerCase().includes("stale"),
      );
    } else if (filterTab === "complaint") {
      result = result.filter(
        (i) =>
          (i.reason ?? "").toLowerCase().includes("complaint") ||
          (i.reason ?? "").toLowerCase().includes("grievance") ||
          !i.assetId,
      );
    } else if (filterTab === "restoration") {
      result = result.filter(
        (i) =>
          (i.reason ?? "").toLowerCase().includes("work") ||
          (i.reason ?? "").toLowerCase().includes("restoration") ||
          (i.reason ?? "").toLowerCase().includes("estimate"),
      );
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (i) =>
          (i.assetId?.toLowerCase().includes(q) ?? false) ||
          (i.reason?.toLowerCase().includes(q) ?? false) ||
          (i.sourceId?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [items, filterTab, search]);

  const criticalCount = items.filter((i) =>
    (i.reason ?? "").toLowerCase().includes("critical"),
  ).length;
  const poorCount = items.filter((i) =>
    (i.reason ?? "").toLowerCase().includes("poor"),
  ).length;
  const inspectionCount = items.filter(
    (i) =>
      (i.reason ?? "").toLowerCase().includes("inspection") ||
      (i.reason ?? "").toLowerCase().includes("due") ||
      (i.reason ?? "").toLowerCase().includes("review") ||
      (i.reason ?? "").toLowerCase().includes("stale"),
  ).length;
  const complaintCount = items.filter(
    (i) =>
      (i.reason ?? "").toLowerCase().includes("complaint") ||
      (i.reason ?? "").toLowerCase().includes("grievance") ||
      !i.assetId,
  ).length;
  const restorationCount = items.filter(
    (i) =>
      (i.reason ?? "").toLowerCase().includes("work") ||
      (i.reason ?? "").toLowerCase().includes("restoration") ||
      (i.reason ?? "").toLowerCase().includes("estimate"),
  ).length;

  return (
    <div className="space-y-4">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterTab("all")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            filterTab === "all"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          All Signals ({items.length})
        </button>

        {criticalCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterTab("critical")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterTab === "critical"
                ? "bg-rose-900 text-white shadow-xs"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200"
            }`}
          >
            Critical Condition ({criticalCount})
          </button>
        )}

        {poorCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterTab("poor")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterTab === "poor"
                ? "bg-amber-900 text-white shadow-xs"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
            }`}
          >
            Poor Condition ({poorCount})
          </button>
        )}

        <button
          type="button"
          onClick={() => setFilterTab("inspection")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            filterTab === "inspection"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Inspections & Reviews ({inspectionCount})
        </button>

        <button
          type="button"
          onClick={() => setFilterTab("complaint")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            filterTab === "complaint"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Complaints & Grievances ({complaintCount})
        </button>

        <button
          type="button"
          onClick={() => setFilterTab("restoration")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            filterTab === "restoration"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Restoration Works ({restorationCount})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Filter attention signals by asset ID or reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-200 pl-8.5 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No attention signals match your active filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground bg-slate-50/50">
              <tr>
                <th className="px-3 py-3 font-medium">Asset ID</th>
                <th className="px-3 py-3 font-medium">Attention Signal</th>
                <th className="px-3 py-3 font-medium">Source Document</th>
                <th className="px-3 py-3 font-medium">Reported Date</th>
                <th className="px-3 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item, index) => (
                <tr
                  key={`${item.assetId}-${item.reason}-${index}`}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-3 py-3 font-mono text-xs">
                    {item.assetId ? (
                      <span className="font-semibold text-slate-900">
                        {item.assetId.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                        Unlinked Grievance
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge value={item.reason ?? "unknown"} />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {item.sourceId ? `${item.sourceId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {item.sourceAt
                      ? new Date(item.sourceAt).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })
                      : "Unknown"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {item.assetId ? (
                      <Link
                        href={`/app/assets/${item.assetId}`}
                        className="inline-flex items-center gap-1 font-semibold text-xs text-emerald-800 hover:text-emerald-950 hover:underline"
                      >
                        Inspect
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/app/complaints${department ? `?department=${department}` : ""}`}
                        className="inline-flex items-center gap-1 font-semibold text-xs text-amber-800 hover:text-amber-950 hover:underline"
                      >
                        Triage
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
