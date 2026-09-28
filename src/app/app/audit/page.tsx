import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listAuthorityAuditAction } from "@/server/actions/audit.actions";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ authority?: string; page?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listAuthorityAuditAction({
    authorityId: params.authority || undefined,
    page,
    entityType: params.entity || undefined,
  });
  function pageLink(next: number) {
    const query = new URLSearchParams({ page: String(next) });
    if (params.authority) query.set("authority", params.authority);
    if (params.entity) query.set("entity", params.entity);
    return `/app/audit?${query}`;
  }
  if (!result.success)
    return (
      <section role="alert" className="rounded-lg border bg-card p-5">
        <h1 className="text-xl font-semibold">Audit unavailable</h1>
        <p className="mt-2 text-sm">{result.error}</p>
        <Link
          href="/app/audit"
          className="mt-3 inline-block text-primary underline"
        >
          Reset audit filters
        </Link>
      </section>
    );
  const data = result.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Authority audit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Recorded changes in your current authority administrator scope.
          Asset-specific history is also available on each asset.
        </p>
      </header>
      {data.denied ? (
        <section className="rounded-lg border bg-card p-5">
          <p>
            Authority-wide audit requires an active authority administrator
            grant.
          </p>
          <Link
            href="/app/assets"
            className="mt-3 inline-block text-primary underline"
          >
            Open authorized asset history
          </Link>
        </section>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4"
            method="get"
          >
            <label className="text-sm">
              Authority
              <select
                name="authority"
                defaultValue={params.authority ?? ""}
                className="mt-1 block rounded-md border bg-background p-2"
              >
                <option value="">All authorized authorities</option>
                {data.authorities.map((authority) => (
                  <option key={authority.id} value={authority.id}>
                    {authority.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Record type
              <select
                name="entity"
                defaultValue={params.entity ?? ""}
                className="mt-1 block rounded-md border bg-background p-2"
              >
                <option value="">All types</option>
                {[
                  "assets",
                  "inspections",
                  "complaints",
                  "work_orders",
                  "work_estimates",
                  "departments",
                  "regions",
                  "role_definitions",
                  "department_memberships",
                  "authority_memberships",
                  "governance_requests",
                  "department_templates",
                  "approval_requests",
                ].map((entity) => (
                  <option key={entity}>{entity}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={buttonVariants({ variant: "outline" })}
            >
              Apply filters
            </button>
          </form>
          <section className="rounded-lg border bg-card p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              {data.total.toLocaleString("en-IN")} entries · 25 per page · Page{" "}
              {data.page}
            </p>
            {data.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Recorded at</th>
                      <th className="p-2">Actor</th>
                      <th className="p-2">Record / action</th>
                      <th className="p-2">Reason</th>
                      <th className="p-2">Asset history</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.rows.map((event) => (
                      <tr key={event.id}>
                        <td className="p-2 text-xs">
                          {event.occurredAt.toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })}
                        </td>
                        <td className="p-2 text-xs">
                          {event.actorId ?? "System"}
                        </td>
                        <td className="p-2">
                          <p>
                            {event.entityType} · {event.operation}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.entityId}
                          </p>
                        </td>
                        <td className="max-w-sm whitespace-pre-wrap break-words p-2">
                          {event.reason ?? "Not recorded"}
                        </td>
                        <td className="p-2">
                          {event.assetId ? (
                            <Link
                              href={`/app/assets/${event.assetId}`}
                              className="text-primary underline"
                            >
                              View asset
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No audit entries match these filters.
              </p>
            )}
            <nav aria-label="Audit pagination" className="mt-5 flex gap-3">
              {page > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={pageLink(page - 1)}
                >
                  Previous
                </Link>
              )}
              {page * 25 < data.total && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={pageLink(page + 1)}
                >
                  Next
                </Link>
              )}
            </nav>
          </section>
          <p className="text-xs text-muted-foreground">
            Only change summary metadata is listed; raw before/after payloads
            are omitted. Application runtime cannot edit audit history; database
            owners retain administrative privileges.
          </p>
        </>
      )}
    </div>
  );
}
