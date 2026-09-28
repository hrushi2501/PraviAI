import { AlertCircle, Boxes, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";

export interface SummaryStats {
  totalRegistered: number;
  verified: number;
  currentAssessed: number;
  goodOrFair: number;
  stale: number;
  neverAssessed: number;
}

type RestorationRow = {
  departmentId: string | null;
  regionId: string | null;
  status: string | null;
  baseCategory: string | null;
  outstandingWorkCount: number | null;
  unreviewedOrUnpricedCount: number | null;
  reviewedEstimatePaise: string | null;
};
type PairRow = {
  assetId: string | null;
  templateCode: string | null;
  templateVersion: number | null;
  firstInspectionId: string | null;
  firstObservedOn: string | null;
  firstCondition: string | null;
  latestInspectionId: string | null;
  latestObservedOn: string | null;
  latestCondition: string | null;
};
function rupees(paise: bigint) {
  return `₹${(paise / BigInt(100)).toLocaleString("en-IN")}.${(paise % BigInt(100)).toString().padStart(2, "0")}`;
}

/** Reporting must receive authorized database aggregates; absent data is unavailable. */
export function DashboardStatutoryMetrics({
  summary,
  restoration = null,
  pairs = null,
  department,
}: {
  summary: SummaryStats | null;
  restoration?: RestorationRow[] | null;
  pairs?: PairRow[] | null;
  department?: string;
}) {
  const coverage =
    summary && summary.verified > 0
      ? Math.round((summary.currentAssessed / summary.verified) * 100)
      : null;
  const poorOrCritical = summary
    ? Math.max(summary.currentAssessed - summary.goodOrFair, 0)
    : null;
  const poorShare =
    summary && summary.currentAssessed > 0 && poorOrCritical !== null
      ? Math.round((poorOrCritical / summary.currentAssessed) * 100)
      : null;
  const backlogWorks = restoration?.reduce(
    (total, row) => total + Number(row.outstandingWorkCount ?? 0),
    0,
  );
  const unpriced = restoration?.reduce(
    (total, row) => total + Number(row.unreviewedOrUnpricedCount ?? 0),
    0,
  );
  const reviewedPaise = restoration?.reduce(
    (total, row) => total + BigInt(row.reviewedEstimatePaise ?? "0"),
    BigInt(0),
  );
  const workLink = `/app/maintenance${department ? `?department=${encodeURIComponent(department)}` : ""}`;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href={`/app/assets?registration=verified${department ? `&department=${encodeURIComponent(department)}` : ""}`}
          className="group block rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-xs font-semibold uppercase tracking-wider group-hover:text-emerald-800 transition-colors">
              Verified inventory
            </h2>
            <Boxes className="size-4 text-primary group-hover:text-emerald-700 transition-colors" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {summary?.verified ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              / {summary?.totalRegistered ?? "—"} registered
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {summary
              ? `${summary.totalRegistered - summary.verified} awaiting verification.`
              : "Inventory data is unavailable."}{" "}
            Registration review does not certify structural safety.
          </p>
          <span className="mt-3 inline-block text-[11px] font-medium text-emerald-800 group-hover:underline">
            View verified assets →
          </span>
        </Link>

        <Link
          href={`/app/inspections${department ? `?department=${encodeURIComponent(department)}` : ""}`}
          className="group block rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-xs font-semibold uppercase tracking-wider group-hover:text-emerald-800 transition-colors">
              Current inspection coverage
            </h2>
            <ShieldCheck className="size-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {coverage === null ? "—" : `${coverage}%`}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary
                ? `${summary.currentAssessed}/${summary.verified} verified assets`
                : "Unavailable"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {summary
              ? `${summary.stale} stale · ${summary.neverAssessed} never assessed.`
              : "Inspection data is unavailable."}{" "}
            Only current approved findings enter the numerator.
          </p>
          <span className="mt-3 inline-block text-[11px] font-medium text-emerald-800 group-hover:underline">
            View inspection queue →
          </span>
        </Link>

        <Link
          href={`/app/assets?registration=verified${department ? `&department=${encodeURIComponent(department)}` : ""}`}
          className="group block rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-amber-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-xs font-semibold uppercase tracking-wider group-hover:text-amber-800 transition-colors">
              Poor or critical findings
            </h2>
            <AlertCircle className="size-4 text-amber-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {poorShare === null ? "—" : `${poorShare}%`}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary
                ? `${poorOrCritical}/${summary.currentAssessed} currently assessed`
                : "Unavailable"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {summary?.currentAssessed === 0
              ? "No current assessment. A missing inspection is not a good finding."
              : "Observed condition supports professional review; it does not prescribe an engineering treatment."}
          </p>
          <span className="mt-3 inline-block text-[11px] font-medium text-amber-800 group-hover:underline">
            Filter sub-standard assets →
          </span>
        </Link>

        <Link
          href={workLink}
          className="group block rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-blue-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-xs font-semibold uppercase tracking-wider group-hover:text-blue-800 transition-colors">
              Reviewed restoration backlog
            </h2>
            <Wrench className="size-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {backlogWorks ?? "—"}
          </p>
          <p className="mt-2 text-sm font-medium">
            {reviewedPaise === undefined
              ? "Reviewed estimates unavailable"
              : `${rupees(reviewedPaise)} reviewed estimates`}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {restoration
              ? `${unpriced} unpriced or unreviewed work records. Latest reviewed estimate per outstanding work.`
              : "Restoration data is unavailable. Missing prices are not zero."}
          </p>
          <span className="mt-3 inline-block text-[11px] font-medium text-blue-800 group-hover:underline">
            Open scoped restoration records →
          </span>
        </Link>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-xs">
        <h2 className="text-base font-semibold">
          Paired condition observations
        </h2>
        {pairs === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Comparable observation data is unavailable. No trend is reported.
          </p>
        ) : pairs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Insufficient comparable approved history. No paired trend is
            available.
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {pairs.length} paired assets, capped at 20. Each pair uses
              first/latest approved observations of the same asset and pinned
              definition. Assets with unknown condition, no repeat observation,
              or inactive/archived registration are excluded by the reporting
              view. This is not a portfolio-wide deterioration rate.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Asset</th>
                    <th className="p-2">Definition</th>
                    <th className="p-2">First approved</th>
                    <th className="p-2">Latest approved</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pairs.map((pair) => (
                    <tr
                      key={`${pair.assetId}-${pair.firstInspectionId}-${pair.latestInspectionId}`}
                    >
                      <td className="p-2">
                        {pair.assetId ? (
                          <Link
                            href={`/app/assets/${pair.assetId}`}
                            className="text-primary underline"
                          >
                            {pair.assetId.slice(0, 8)}
                          </Link>
                        ) : (
                          "Unavailable"
                        )}
                      </td>
                      <td className="p-2">
                        {pair.templateCode} v{pair.templateVersion}
                      </td>
                      <td className="p-2">
                        {pair.firstObservedOn} · {pair.firstCondition}
                      </td>
                      <td className="p-2">
                        {pair.latestObservedOn} · {pair.latestCondition}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {restoration && restoration.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Restoration estimate breakdown</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Department / region</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Work status</th>
                  <th className="p-2">Outstanding works</th>
                  <th className="p-2">Unpriced / unreviewed</th>
                  <th className="p-2">Latest reviewed estimates</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {restoration.map((row, index) => (
                  <tr key={`${row.baseCategory}-${row.status}-${index}`}>
                    <td className="p-2 text-xs">
                      {row.departmentId?.slice(0, 8) ?? "Unknown"} /{" "}
                      {row.regionId?.slice(0, 8) ?? "Unattributed"}
                    </td>
                    <td className="p-2">{row.baseCategory ?? "Unknown"}</td>
                    <td className="p-2">{row.status ?? "Unknown"}</td>
                    <td className="p-2">{row.outstandingWorkCount}</td>
                    <td className="p-2">{row.unreviewedOrUnpricedCount}</td>
                    <td className="p-2">
                      {rupees(BigInt(row.reviewedEstimatePaise ?? "0"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Amounts are exact INR estimates, not sanctioned funding or actual
            expenditure. Each row remains grouped by
            department/region/category/status from the authorized reporting
            view.
          </p>
        </section>
      )}
      <div className="rounded-xl border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        Coverage uses verified, non-archived assets as its denominator. Poor or
        critical share uses current approved assessments. Unknown and stale
        evidence stay separate. These prototype figures are not an engineering
        safety score, sanctioned budget or statutory certification.
      </div>
    </div>
  );
}
