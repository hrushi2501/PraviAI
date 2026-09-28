import { Boxes, Wrench } from "lucide-react";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/asset-ui";
import { DashboardAttentionQueue } from "@/components/dashboard-attention-queue";
import { DashboardStatutoryMetrics } from "@/components/dashboard-statutory-metrics";
import { ServerSnapshotPanel } from "@/components/server-snapshot-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  getAttentionQueueAction,
  getConditionObservationPairsAction,
  getDashboardSummaryAction,
  getRegionalRestorationSummaryAction,
} from "@/server/actions/dashboard.actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const { department } = await searchParams;
  const [attentionResult, summaryResult, restorationResult, pairsResult] =
    await Promise.all([
      getAttentionQueueAction(department),
      getDashboardSummaryAction(department),
      getRegionalRestorationSummaryAction(department),
      getConditionObservationPairsAction(department),
    ]);
  const summary = summaryResult.success ? summaryResult.data : null;
  const attentionItems = attentionResult.success ? attentionResult.data : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Inventory and inspection coverage across your authorised departments."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/maintenance"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Wrench className="size-4" />
              Restoration
            </Link>
            <Link href="/app/assets" className={buttonVariants({ size: "sm" })}>
              <Boxes className="size-4" />
              Asset register
            </Link>
          </div>
        }
      />
      {summary && summary.totalRegistered === 0 && (
        <Panel
          title="Set up your department inventory"
          description="Complete these prerequisites before assessments and restoration."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              <Link
                href="/app/administration"
                className="text-primary underline"
              >
                Set up departments, members and regions
              </Link>{" "}
              with your authority administrator.
            </li>
            <li>
              <Link href="/app/asset-types" className="text-primary underline">
                Check published asset definitions
              </Link>
              . A department expert drafts the definition; a different
              authorized reviewer publishes it.
            </li>
            <li>
              <Link
                href={`/app/assets${department ? `?department=${encodeURIComponent(department)}` : ""}`}
                className="text-primary underline"
              >
                Register an asset
              </Link>{" "}
              with its source reference, submit it and ask an independent
              verifier to review it.
            </li>
            <li>
              Open the verified asset to record an inspection draft or propose
              restoration.
            </li>
          </ol>
        </Panel>
      )}
      {!summaryResult.success && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Inventory data is unavailable. Your department access or database
          connection may need attention. Refresh to retry.
        </div>
      )}
      <DashboardStatutoryMetrics
        summary={summary}
        department={department}
        restoration={restorationResult.success ? restorationResult.data : null}
        pairs={pairsResult.success ? pairsResult.data : null}
      />
      <Panel
        title="Needs attention"
        description="Up to 50 inspection, complaint and restoration signals. Multiple signals may refer to the same asset."
      >
        {!attentionResult.success ? (
          <p role="alert" className="py-6 text-sm text-muted-foreground">
            The attention queue could not be loaded. Refresh to retry.
          </p>
        ) : attentionItems.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No attention signals were returned for your authorised scope.
          </p>
        ) : (
          <DashboardAttentionQueue
            items={attentionItems}
            department={department}
          />
        )}
      </Panel>
      <ServerSnapshotPanel department={department} />
      <Panel title="Reporting notes">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Condition counts use verified assets with current approved
          inspections. Stale and missing assessments remain separate. Completed
          restoration work does not establish improved condition.
        </p>
      </Panel>
    </div>
  );
}
