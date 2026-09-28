import Link from "next/link";
import { PageHeader, Panel } from "@/components/asset-ui";
import { getWorkspaceAction } from "@/server/actions/workspace.actions";

export default async function SettingsPage() {
  const result = await getWorkspaceAction();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account and current department access."
      />
      {!result.success ? (
        <p role="alert" className="text-sm">
          Account details are unavailable. Refresh to retry.
        </p>
      ) : (
        <>
          <Panel title="Account">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd>{result.data.identity?.name ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{result.data.identity?.email ?? "Not recorded"}</dd>
              </div>
            </dl>
            <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
              Use the account menu at the top right to manage your sign-in
              details.
            </p>
          </Panel>
          {result.data.authorities.some((authority) => authority.isAdmin) && (
            <Panel
              title="Authority administration"
              description="Set up the departments and permissions needed to start using the register."
            >
              <Link
                href="/app/administration"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Manage departments, regions, roles and approvals
              </Link>
            </Panel>
          )}
          <Panel title="Authority access">
            {result.data.authorities.length ? (
              <ul className="divide-y text-sm">
                {result.data.authorities.map((authority) => (
                  <li key={authority.id} className="flex justify-between py-3">
                    <span>{authority.name}</span>
                    <span className="font-medium">
                      {authority.isAdmin
                        ? "Authority Administrator"
                        : authority.role.replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No authority-level role assigned.
              </p>
            )}
          </Panel>
          <Panel title="Department access">
            <ul className="divide-y text-sm">
              {result.data.departments.map((department) => (
                <li key={department.id} className="flex justify-between py-3">
                  <span>{department.name}</span>
                  <span className="text-muted-foreground">
                    {department.active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Access is governed by your authority. Contact an administrator for
              membership changes.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
