import { auth } from "@clerk/nextjs/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ensureActorIdentityAction } from "@/server/actions/identity.actions";
import { getWorkspaceAction } from "@/server/actions/workspace.actions";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  await ensureActorIdentityAction();
  const workspace = await getWorkspaceAction();
  if (!workspace.success)
    return (
      <WorkspaceShell departments={[]}>
        <div role="alert" className="rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your verified identity or database access could not be loaded.
            Contact your administrator or refresh to retry.
          </p>
        </div>
      </WorkspaceShell>
    );
  if (!workspace.data.departments.length && !workspace.data.authorities.length)
    return (
      <WorkspaceShell departments={[]} name={workspace.data.identity?.name}>
        <div className="rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Department access pending</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in. An administrator must assign department access
            before you can view assets.
          </p>
        </div>
      </WorkspaceShell>
    );
  return (
    <WorkspaceShell
      isAdmin={workspace.data.authorities.some(
        (authority) => authority.isAdmin,
      )}
      departments={workspace.data.departments}
      name={workspace.data.identity?.name}
    >
      {children}
    </WorkspaceShell>
  );
}
