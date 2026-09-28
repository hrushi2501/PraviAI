"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Panel, StatusBadge } from "@/components/asset-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminDirectoryAction } from "@/server/actions/admin-directory.actions";

type User = {
  clerkId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  disabledAt: Date | null;
  locale: string;
  createdAt: Date;
};
type Member = {
  clerkId: string;
  role: string;
  active: boolean;
  expiresAt: Date | null;
  departmentId?: string;
  grantedBy?: string | null;
  updatedAt?: Date;
  departmentName?: string;
};
type Role = {
  code: string;
  name: string;
  scope: string;
  active: boolean;
  version: number;
};
export function AdminUserDirectory({
  authorityId,
  users: initialUsers,
  authorityMembers: initialAuthorityMembers,
  departmentMembers: initialDepartmentMembers,
  departments,
  roles,
  permissions,
  canManage,
  onAssign,
  onEditRole,
}: {
  authorityId: string;
  users: User[];
  authorityMembers: Member[];
  departmentMembers: Member[];
  departments: { id: string; name: string }[];
  roles: Role[];
  permissions: { role: string; permission: string }[];
  canManage: boolean;
  onAssign: (userId: string, departmentId?: string, role?: string) => void;
  onEditRole: (code: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSettledSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const roleName = (code: string) =>
    roles.find((item) => item.code === code)?.name ?? code.replaceAll("_", " ");
  const hasActiveMembership = (item: Member) =>
    item.active &&
    (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
  const query = useQuery({
    queryKey: [
      "authority-directory",
      authorityId,
      page,
      settledSearch,
      department,
      role,
      status,
    ],
    queryFn: () =>
      getAdminDirectoryAction({
        authorityId,
        page,
        search: settledSearch,
        departmentId: department || undefined,
        role: role || undefined,
        status: status || undefined,
      }),
  });
  const result = query.data;
  const directory = result?.success ? result.data : null;
  const users = directory?.users ?? initialUsers;
  const authorityMembers: Member[] =
    directory?.authorityMembers ?? initialAuthorityMembers;
  const departmentMembers: Member[] =
    directory?.departmentMembers ?? initialDepartmentMembers;
  const visible = directory?.users ?? [];
  return (
    <div className="space-y-6">
      <Panel
        title="User directory"
        description="All users visible within this authority, including inactive memberships. Department roles and authority roles grant different permissions."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <label htmlFor="directory-search" className="block text-xs">
            Find user
            <Input
              id="directory-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, email, department or role"
            />
          </label>
          <label className="block text-xs">
            Department
            <select
              className="mt-1 h-10 w-full rounded-md border bg-card px-2 text-sm"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Role
            <select
              className="mt-1 h-10 w-full rounded-md border bg-card px-2 text-sm"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roles.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Status
            <select
              className="mt-1 h-10 w-full rounded-md border bg-card px-2 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active access</option>
              <option value="inactive">No active membership</option>
              <option value="disabled">Identity disabled</option>
            </select>
          </label>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Showing {visible.length} of {directory?.total ?? 0} users.{" "}
          {directory && directory.total > 20
            ? `Page ${directory.page} of ${directory.pageCount}.`
            : ""}
        </p>
        {query.isPending && (
          <output className="block text-sm">Loading users…</output>
        )}
        {(query.isError || (result && !result.success)) && (
          <div role="alert" className="text-sm">
            {result && !result.success
              ? result.error
              : "Users could not be loaded."}
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        <div className="mt-3 divide-y">
          {visible.map((user) => (
            <article key={user.clerkId} className="py-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-medium">{user.displayName}</h3>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <StatusBadge
                  value={
                    user.disabledAt
                      ? "disabled"
                      : user.emailVerified
                        ? "verified"
                        : "unverified"
                  }
                />
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Identity ID</dt>
                  <dd className="break-all">{user.clerkId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Registered</dt>
                  <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preferred language</dt>
                  <dd>{user.locale}</dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-2 text-sm">
                {[...authorityMembers, ...departmentMembers]
                  .filter((item) => item.clerkId === user.clerkId)
                  .map((item) => (
                    <li
                      key={`${item.departmentId ?? "authority"}-${item.clerkId}`}
                      className="rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="font-medium">
                            {item.departmentId
                              ? (item.departmentName ??
                                departments.find(
                                  (d) => d.id === item.departmentId,
                                )?.name ??
                                "Department")
                              : "Authority"}
                          </span>{" "}
                          · {roleName(item.role)}{" "}
                          <StatusBadge
                            value={
                              !item.active
                                ? "inactive"
                                : hasActiveMembership(item)
                                  ? "active"
                                  : "expired"
                            }
                          />
                          {item.expiresAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Expires{" "}
                              {new Date(item.expiresAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onAssign(
                                user.clerkId,
                                item.departmentId,
                                item.role,
                              )
                            }
                          >
                            Change access
                          </Button>
                        )}
                      </div>
                      {item.grantedBy && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Granted by{" "}
                          {users.find((u) => u.clerkId === item.grantedBy)
                            ?.email ?? item.grantedBy}
                          {item.updatedAt
                            ? ` · Updated ${new Date(item.updatedAt).toLocaleDateString()}`
                            : ""}
                        </p>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Assigned role permissions
                        </summary>
                        <p className="mt-2 leading-relaxed">
                          {permissions
                            .filter((p) => p.role === item.role)
                            .map((p) => p.permission.replaceAll("_", " "))
                            .join(", ") || "No permissions assigned."}
                        </p>
                      </details>
                    </li>
                  ))}
              </ul>
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAssign(user.clerkId)}
                  >
                    Assign authority role
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAssign(user.clerkId, "")}
                  >
                    Assign department role
                  </Button>
                </div>
              )}
            </article>
          ))}
          {directory && !visible.length && (
            <p className="py-6 text-sm text-muted-foreground">
              No users match these filters.
            </p>
          )}
        </div>
        {directory && directory.total > 20 && (
          <div className="mt-4 flex justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= directory.pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Panel>
      <Panel
        title="Role catalogue"
        description="Review permissions before assigning a role. Edits and retirement require independent governance approval."
      >
        <div className="divide-y">
          {roles.map((item) => (
            <article key={item.code} className="py-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.code} · {item.scope} · version {item.version} ·{" "}
                    {item.active ? "Active" : "Retired"}
                  </p>
                </div>
                {canManage && item.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditRole(item.code)}
                  >
                    Edit role
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {permissions
                  .filter((p) => p.role === item.code)
                  .map((p) => p.permission.replaceAll("_", " "))
                  .join(", ") || "No permissions assigned."}
              </p>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
