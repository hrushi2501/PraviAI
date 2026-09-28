import { ShieldAlert } from "lucide-react";

export interface AssetExecutiveSummaryProps {
  asset: {
    id: string;
    name: string;
    assetCode: string;
    regionId?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    registrationStatus: string;
    lifecycleStage: string;
    createdBy: string;
  };
  condition?: {
    currentCondition?: string | null;
    assessmentFreshness?: string | null;
    observedOn?: string | null;
    nextReviewOn?: string | null;
  } | null;
  independent: boolean;
}

export function AssetExecutiveSummary({
  asset,
  condition,
  independent,
}: AssetExecutiveSummaryProps) {
  const currentCondition = condition?.currentCondition ?? "unknown";
  const freshness = condition?.assessmentFreshness ?? "never assessed";

  const conditionColor =
    currentCondition === "good"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
      : currentCondition === "fair"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
        : currentCondition === "poor"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          : currentCondition === "critical"
            ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
            : "bg-muted text-muted-foreground";

  const nextAction =
    asset.registrationStatus === "submitted"
      ? "Awaiting Independent Four-Eyes Review"
      : currentCondition === "poor" || currentCondition === "critical"
        ? "Restoration Work Order Required"
        : freshness === "stale"
          ? "Periodic Condition Re-Inspection Overdue"
          : "Routine Asset Surveillance & Maintenance";

  return (
    <div className="space-y-4">
      {/* Top Executive Summary Tile */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Tile 1: What & Where */}
          <div className="space-y-2 border-b pb-4 md:border-b-0 md:border-r md:pr-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What & Where
            </span>
            <h2 className="text-lg font-bold text-foreground">{asset.name}</h2>
            <p className="font-mono text-xs font-medium text-primary">
              {asset.assetCode}
            </p>
            <p className="text-xs text-muted-foreground">
              Region: {asset.regionId ? `${asset.regionId}` : "Unspecified"}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              GIS:{" "}
              {asset.latitude && asset.longitude
                ? `${asset.latitude}, ${asset.longitude}`
                : "Unmapped Coordinates"}
            </p>
          </div>

          {/* Tile 2: Verified Condition & Freshness */}
          <div className="space-y-2 border-b pb-4 md:border-b-0 md:border-r md:pr-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Verified Condition & Freshness
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${conditionColor}`}
              >
                {currentCondition.toUpperCase()}
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                ({freshness})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last observation:{" "}
              {condition?.observedOn ?? "No approved observation"}
            </p>
            <p className="text-xs text-muted-foreground">
              Next scheduled review:{" "}
              {condition?.nextReviewOn ?? "Not scheduled"}
            </p>
          </div>

          {/* Tile 3: Next Statutory Action */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Next Statutory Action
            </span>
            <p className="text-sm font-semibold text-foreground">
              {nextAction}
            </p>
            <p className="text-xs text-muted-foreground">
              Registration:{" "}
              <span className="font-medium capitalize text-foreground">
                {asset.registrationStatus}
              </span>{" "}
              · Lifecycle:{" "}
              <span className="font-medium capitalize text-foreground">
                {asset.lifecycleStage}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Four-Eyes Self-Verification Restriction Alert */}
      {!independent && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              Statutory Four-Eyes Separation Restriction
            </p>
            <p className="leading-relaxed">
              As the recording/submitting officer ({asset.createdBy}), you are
              statutorily prohibited from verifying this asset record. Under
              GIGW 3.0 governance rules and public register accountability
              protocols, an independent reviewer must conduct verification to
              ensure tamper-proof segregation of duties.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
