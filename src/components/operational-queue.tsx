import Link from "next/link";
import { PageHeader } from "@/components/asset-ui";
import { OperationalQueueClient } from "@/components/operational-queue-client";
import { getOperationalQueueAction } from "@/server/actions/workspace.actions";

export async function OperationalQueue({
  kind,
  department,
  page = 1,
}: {
  kind: "inspection" | "work";
  department?: string;
  page?: number;
}) {
  const result = await getOperationalQueueAction({
    kind,
    departmentId: department,
    page,
  });
  const base = kind === "inspection" ? "/app/inspections" : "/app/maintenance";
  function pageLink(next: number) {
    const params = new URLSearchParams({ page: String(next) });
    if (department) params.set("department", department);
    return `${base}?${params}`;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={kind === "inspection" ? "Inspections" : "Restoration"}
        description={
          kind === "inspection"
            ? "Field observations and independent review. Only approved assessments inform condition reporting."
            : "Work proposals, execution and completion reviews. Accepted work needs a separate approved reinspection."
        }
      />
      <div className="rounded-lg border bg-card p-4 text-sm">
        <p>
          To{" "}
          {kind === "inspection"
            ? "record a new inspection draft"
            : "propose restoration"}
          , open a verified asset in your department. Its pinned definition and
          current permissions determine the available actions.
        </p>
        <Link
          href={`/app/assets${department ? `?department=${encodeURIComponent(department)}` : ""}`}
          className="mt-2 inline-block text-primary underline"
        >
          Choose an asset
        </Link>
      </div>
      {!result.success ? (
        <div role="alert" className="rounded-lg border bg-card p-6">
          <p className="text-sm">
            The queue could not be loaded. Check your department access and try
            again.
          </p>
          <Link
            href={pageLink(page)}
            className="mt-3 inline-block text-sm text-primary underline"
          >
            Retry
          </Link>
        </div>
      ) : (
        <OperationalQueueClient
          kind={kind}
          actorId={result.data.actorId}
          rows={result.data.rows}
          total={result.data.total}
          page={page}
          department={department}
        />
      )}
    </div>
  );
}
