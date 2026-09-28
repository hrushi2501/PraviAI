"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { AdminRecordEditor } from "@/components/admin-record-editor";
import { AdminUserDirectory } from "@/components/admin-user-directory";
import { Panel, StatusBadge } from "@/components/asset-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelGovernanceAction,
  decideGovernanceAction,
  findVerifiedOfficialAction,
  getAdminSetupAction,
  requestGovernanceAction,
} from "@/server/actions/admin.actions";

type Values = {
  code: string;
  name: string;
  manager: string;
  manager_role: string;
  parent_id: string;
  level: string;
  department_id: string;
  clerk_id: string;
  role: string;
  scope: string;
  active: string;
  reason: string;
  permissions: string[];
};
const regionParents: Record<string, string[]> = {
  state: [],
  district: ["state"],
  block: ["district"],
  city: ["district"],
  ward: ["city"],
  village: ["block", "district"],
};
const selectStyle = "mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm";
const actions = [
  "department_create",
  "region_create",
  "department_member",
  "authority_member",
  "role_create",
  "role_edit",
  "role_retire",
] as const;
type Action = (typeof actions)[number];
const titles: Record<Action, string> = {
  department_create: "Add department",
  region_create: "Add region",
  department_member: "Assign department access",
  authority_member: "Assign authority access",
  role_create: "Create role",
  role_edit: "Edit role permissions",
  role_retire: "Retire role",
};

export function AuthorityAdmin() {
  const [authorityId, setAuthorityId] = useState<string>();
  const [action, setAction] = useState<Action>("department_create");
  const [message, setMessage] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [foundOfficial, setFoundOfficial] = useState<{
    clerkId: string;
    email: string;
    displayName: string;
  } | null>(null);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["authority-setup", authorityId],
    queryFn: () => getAdminSetupAction(authorityId),
  });
  const form = useForm<Values>({
    shouldUnregister: true,
    defaultValues: {
      code: "",
      name: "",
      manager: "",
      manager_role: "department_manager",
      parent_id: "",
      level: "state",
      department_id: "",
      clerk_id: "",
      role: "",
      scope: "department",
      active: "true",
      reason: "",
      permissions: [],
    },
  });
  const scope = form.watch("scope");
  const roleCode = form.watch("code");
  const level = form.watch("level");
  const result = query.data;
  if (query.isPending)
    return <p className="text-sm">Loading authority setup…</p>;
  if (query.isError || !result?.success)
    return (
      <div role="alert" className="space-y-3">
        <p>
          {result && !result.success
            ? result.error
            : "Authority setup could not be loaded."}
        </p>
        <Button onClick={() => query.refetch()}>Retry</Button>
      </div>
    );
  const data = result.data;
  if (!data.selectedAuthorityId)
    return (
      <p className="text-sm text-muted-foreground">
        Authority administration is available to authorised administrators.
      </p>
    );
  const selectedRole = data.roles.find((r) => r.code === roleCode);
  const roleScope =
    action === "role_edit" ? (selectedRole?.scope ?? scope) : scope;
  const identities = data.eligibleIdentities;
  const nameOf = (id: string) =>
    identities.find((item) => item.clerkId === id)?.email ?? id;
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["authority-setup"] }),
      client.invalidateQueries({ queryKey: ["authority-directory"] }),
    ]);
    router.refresh();
  }
  async function submit(values: Values) {
    setMessage("");
    let payload: Record<string, unknown>;
    switch (action) {
      case "department_create":
        payload = {
          code: values.code.trim(),
          name: values.name.trim(),
          manager: values.manager,
          manager_role: values.manager_role,
        };
        break;
      case "region_create":
        payload = {
          code: values.code.trim(),
          name: values.name.trim(),
          level: values.level,
          parent_id: values.parent_id || null,
        };
        break;
      case "department_member":
        payload = {
          department_id: values.department_id,
          clerk_id: values.clerk_id,
          role: values.role,
          active: values.active === "true",
        };
        break;
      case "authority_member":
        payload = {
          clerk_id: values.clerk_id,
          role: values.role,
          active: values.active === "true",
        };
        break;
      case "role_create":
        payload = {
          code: values.code.trim(),
          name: values.name.trim(),
          scope: values.scope,
          permissions: values.permissions,
        };
        break;
      case "role_edit":
        payload = {
          code: values.code,
          name: values.name.trim(),
          permissions: values.permissions,
          expected_version: selectedRole?.version,
        };
        break;
      case "role_retire":
        payload = {
          code: values.code,
          expected_version: selectedRole?.version,
        };
        break;
    }
    try {
      const fingerprint = JSON.stringify({
        authorityId: data.selectedAuthorityId,
        action,
        payload,
        reason: values.reason.trim(),
      });
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, id: crypto.randomUUID() };
      const response = await requestGovernanceAction({
        authorityId: data.selectedAuthorityId as string,
        action,
        payload,
        reason: values.reason.trim(),
        requestId: retry.current.id,
      });
      if (!response.success) throw new Error(response.error);
      setMessage(
        "Request submitted. A different authorised administrator must approve it in the review inbox before it takes effect.",
      );
      retry.current = null;
      form.reset();
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Request could not be submitted.",
      );
    }
  }
  async function decide(id: string, approve: boolean | null) {
    if (!decisionReason.trim()) {
      setMessage("Enter a review reason before making a decision.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response =
        approve === null
          ? await cancelGovernanceAction({ id, reason: decisionReason.trim() })
          : await decideGovernanceAction({
              id,
              approve,
              reason: decisionReason.trim(),
            });
      if (!response.success) throw new Error(response.error);
      setMessage(
        approve === null
          ? "Request cancelled."
          : approve
            ? "Approved. The change has been applied."
            : "Request rejected.",
      );
      setDecisionReason("");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function findOfficial() {
    setLookupBusy(true);
    setFoundOfficial(null);
    setMessage("");
    try {
      const response = await findVerifiedOfficialAction({
        authorityId: data.selectedAuthorityId as string,
        email: lookupEmail.trim(),
      });
      if (!response.success) throw new Error(response.error);
      setFoundOfficial(response.data);
      form.setValue(
        action === "department_create" ? "manager" : "clerk_id",
        response.data.clerkId,
      );
      setMessage(
        "Verified account found. Submit the access request for independent review.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Account could not be found.",
      );
    } finally {
      setLookupBusy(false);
    }
  }
  function person(field: "manager" | "clerk_id", title: string) {
    return (
      <label className="block text-sm">
        {title}
        <select
          className={selectStyle}
          {...form.register(field, { required: true })}
        >
          <option value="">Select an account</option>
          {foundOfficial &&
            !data.users.some(
              (item) => item.clerkId === foundOfficial.clerkId,
            ) && (
              <option value={foundOfficial.clerkId}>
                {foundOfficial.displayName} · {foundOfficial.email} (verified)
              </option>
            )}
          {(field === "manager" ? identities : data.users).map((item) => (
            <option key={item.clerkId} value={item.clerkId}>
              {item.displayName} · {item.email}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="space-y-6">
      <label className="block max-w-md text-sm">
        Authority
        <select
          className={selectStyle}
          value={data.selectedAuthorityId}
          onChange={(event) => {
            setAuthorityId(event.target.value);
            form.reset();
            setMessage("");
          }}
        >
          {data.authorities
            .filter((item) => item.canAdmin || item.canApprove)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <nav
        aria-label="Administration sections"
        className="flex flex-wrap gap-4 text-sm"
      >
        <a
          href="#authority-change-form"
          className="text-primary underline underline-offset-4"
        >
          Setup and changes
        </a>
        <a
          href="#authority-review"
          className="text-primary underline underline-offset-4"
        >
          Review inbox
        </a>
        <a
          href="#authority-directory"
          className="text-primary underline underline-offset-4"
        >
          Users and roles
        </a>
      </nav>
      <Panel
        title="Setup checklist"
        description="Set up the authority in this order so staff can register and assess real assets."
      >
        <ol className="grid gap-3 text-sm md:grid-cols-4">
          <li>1. Create a department and assign its initial manager.</li>
          <li>2. Add regions and assign a separate senior approver.</li>
          <li>
            3.{" "}
            <Link
              href="/app/asset-types"
              className="text-primary underline underline-offset-4"
            >
              Create and publish asset definitions.
            </Link>
          </li>
          <li>
            4.{" "}
            <Link
              href="/app/assets"
              className="text-primary underline underline-offset-4"
            >
              Select the department and register assets.
            </Link>
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Authority access controls governance. Department roles control
          operational permissions. Creators cannot approve their own
          submissions.
        </p>
      </Panel>
      <p className="text-sm text-muted-foreground">
        {data.departments.filter((item) => item.active).length} active
        departments · {data.regions.filter((item) => item.active).length} active
        regions ·{" "}
        {
          data.departmentMembers.filter(
            (item) => item.active && item.role === "senior_approver",
          ).length
        }{" "}
        senior approvers.{" "}
        <Link
          href="/app/asset-types"
          className="text-primary underline underline-offset-4"
        >
          Continue to asset definitions
        </Link>
      </p>
      {data.truncated && (
        <output className="text-sm">
          Showing the first 100 records per list and 100 recent requests.
        </output>
      )}
      {data.canAdmin && (
        <Panel
          title="Manage authority"
          description="Submit a change for independent review. Existing records are retained when access is removed."
        >
          <div className="mb-5 flex flex-wrap gap-2">
            {actions.map((item) => (
              <Button
                key={item}
                variant={action === item ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setAction(item);
                  form.reset();
                  setMessage("");
                }}
              >
                {titles[item]}
              </Button>
            ))}
          </div>
          <form
            id="authority-change-form"
            onSubmit={form.handleSubmit(submit)}
            className="grid gap-4 md:grid-cols-2"
          >
            {(
              ["department_create", "region_create", "role_create"] as Action[]
            ).includes(action) && (
              <label htmlFor="admin-field-1" className="block text-sm">
                Code
                <Input
                  id="admin-field-1"
                  {...form.register("code", { required: true, maxLength: 50 })}
                  placeholder={
                    action === "role_create" ? "asset_supervisor" : "PWD"
                  }
                />
              </label>
            )}
            {(action === "role_edit" || action === "role_retire") && (
              <label className="block text-sm">
                Role
                <select
                  className={selectStyle}
                  {...form.register("code", {
                    required: true,
                    onChange: (event) => {
                      const r = data.roles.find(
                        (item) => item.code === event.target.value,
                      );
                      form.setValue("name", r?.name ?? "");
                      form.setValue(
                        "permissions",
                        data.rolePermissions
                          .filter((item) => item.role === r?.code)
                          .map((item) => item.permission),
                      );
                    },
                  })}
                >
                  <option value="">Select role</option>
                  {data.roles
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} ({item.scope})
                      </option>
                    ))}
                </select>
              </label>
            )}
            {(
              [
                "department_create",
                "region_create",
                "role_create",
                "role_edit",
              ] as Action[]
            ).includes(action) && (
              <label htmlFor="admin-field-2" className="block text-sm">
                Name
                <Input
                  id="admin-field-2"
                  {...form.register("name", { required: true, maxLength: 240 })}
                />
              </label>
            )}
            {action === "department_create" && (
              <>
                {person("manager", "Initial department manager")}
                <label className="block text-sm">
                  Manager role
                  <select
                    className={selectStyle}
                    {...form.register("manager_role", { required: true })}
                  >
                    {data.roles
                      .filter(
                        (item) => item.active && item.scope === "department",
                      )
                      .map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground md:col-span-2">
                  The initial manager receives department access when this
                  request is approved. Add a separate approver using Assign
                  department access.
                </p>
              </>
            )}
            {action === "region_create" && (
              <>
                <label className="block text-sm">
                  Level
                  <select
                    className={selectStyle}
                    {...form.register("level", {
                      onChange: () => {
                        form.setValue("parent_id", "");
                      },
                    })}
                  >
                    {[
                      "state",
                      "district",
                      "block",
                      "city",
                      "ward",
                      "village",
                    ].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Parent region
                  <select
                    className={selectStyle}
                    disabled={level === "state"}
                    {...form.register("parent_id", {
                      required: level !== "state",
                    })}
                  >
                    <option value="">
                      {level === "state"
                        ? "State has no parent"
                        : "Select parent region"}
                    </option>
                    {data.regions
                      .filter(
                        (item) =>
                          item.active &&
                          regionParents[level]?.includes(item.level),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.level})
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {(
              [
                "department_create",
                "department_member",
                "authority_member",
              ] as Action[]
            ).includes(action) && (
              <div className="rounded-md border p-4 md:col-span-2">
                <label htmlFor="official-email" className="block text-sm">
                  Find a registered official by verified email
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    id="official-email"
                    type="email"
                    className="min-w-0 flex-1"
                    value={lookupEmail}
                    onChange={(event) => setLookupEmail(event.target.value)}
                    placeholder="official@example.com"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lookupBusy || !lookupEmail.trim()}
                    onClick={findOfficial}
                  >
                    {lookupBusy ? "Finding…" : "Find account"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The official must first sign up through this app. Finding the
                  account does not grant access.
                </p>
              </div>
            )}
            {action === "department_member" && (
              <p className="rounded-md border bg-muted/30 p-3 text-xs md:col-span-2">
                A reviewer cannot approve changes to their own department
                membership. With two administrators, the recipient should submit
                their own access request and have the other administrator
                approve it.
              </p>
            )}
            {(action === "department_member" ||
              action === "authority_member") && (
              <>
                {action === "department_member" && (
                  <label className="block text-sm">
                    Department
                    <select
                      className={selectStyle}
                      {...form.register("department_id", { required: true })}
                    >
                      <option value="">Select department</option>
                      {data.departments
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {person("clerk_id", "Verified member")}
                <label className="block text-sm">
                  Role
                  <select
                    className={selectStyle}
                    {...form.register("role", { required: true })}
                  >
                    <option value="">Select role</option>
                    {data.roles
                      .filter(
                        (item) =>
                          item.active &&
                          item.scope ===
                            (action === "department_member"
                              ? "department"
                              : "authority"),
                      )
                      .map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Access
                  <select className={selectStyle} {...form.register("active")}>
                    <option value="true">Active</option>
                    <option value="false">Remove access</option>
                  </select>
                </label>
              </>
            )}
            {action === "role_create" && (
              <label className="block text-sm">
                Scope
                <select
                  className={selectStyle}
                  {...form.register("scope", {
                    onChange: () => form.setValue("permissions", []),
                  })}
                >
                  <option value="department">Department</option>
                  <option value="authority">Authority</option>
                </select>
              </label>
            )}
            {(action === "role_create" || action === "role_edit") && (
              <fieldset className="rounded-md border p-4 md:col-span-2">
                <legend className="px-1 text-sm">Permissions</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.permissionCatalog
                    .filter((item) => item.scope === roleScope)
                    .map((item) => (
                      <label
                        key={item.code}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          value={item.code}
                          {...form.register("permissions")}
                        />
                        {item.code.replaceAll("_", " ")}
                      </label>
                    ))}
                </div>
              </fieldset>
            )}
            <label
              htmlFor="admin-field-3"
              className="block text-sm md:col-span-2"
            >
              Reason
              <Input
                id="admin-field-3"
                {...form.register("reason", {
                  required: true,
                  minLength: 1,
                  maxLength: 2000,
                })}
                placeholder="Why is this change needed?"
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Submitting…"
                  : "Submit for approval"}
              </Button>
              {Object.keys(form.formState.errors).length > 0 && (
                <p role="alert" className="mt-2 text-sm">
                  Complete all required fields.
                </p>
              )}
            </div>
          </form>
        </Panel>
      )}
      {message && (
        <output className="block rounded-md border bg-card p-4 text-sm">
          {message}
        </output>
      )}
      <div id="authority-review" className="scroll-mt-24">
        <Panel
          title="Review inbox"
          description="Review the requested values and reason. A different administrator must approve each change."
        >
          <label htmlFor="admin-field-4" className="mb-4 block text-sm">
            Review or cancellation reason
            <Input
              id="admin-field-4"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="Explain your decision"
              maxLength={2000}
            />
          </label>
          <div className="space-y-4">
            {data.governanceRequests
              .filter((item) => item.status === "pending")
              .map((item) => (
                <article key={item.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-medium">
                      {titles[item.action as Action] ?? item.action}
                    </h3>
                    <StatusBadge value={item.status} />
                  </div>
                  <p className="mt-2 text-sm">
                    Requested by {nameOf(item.requestedBy)} · {item.reason}
                  </p>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    {Object.entries(item.payload).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-muted-foreground">
                          {key.replaceAll("_", " ")}
                        </dt>
                        <dd className="break-words">
                          {Array.isArray(value)
                            ? value.join(", ")
                            : typeof value === "boolean"
                              ? value
                                ? "Active"
                                : "Inactive"
                              : value == null
                                ? "None"
                                : ["manager", "clerk_id"].includes(key)
                                  ? nameOf(String(value))
                                  : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Expires {new Date(item.expiresAt).toLocaleString()}
                  </p>
                  {item.action === "department_member" &&
                    item.payload.clerk_id === data.actorId &&
                    item.requestedBy !== data.actorId && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        You cannot approve your own department access. Ask the
                        requester to cancel this proposal, then submit your own
                        access request for the other administrator to review.
                      </p>
                    )}
                  <div className="mt-3 flex gap-2">
                    {item.requestedBy === data.actorId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => decide(item.id, null)}
                      >
                        Cancel request
                      </Button>
                    ) : (
                      data.canApprove &&
                      !(
                        item.action === "department_member" &&
                        item.payload.clerk_id === data.actorId
                      ) && (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => decide(item.id, true)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => decide(item.id, false)}
                          >
                            Reject
                          </Button>
                        </>
                      )
                    )}
                  </div>
                </article>
              ))}
            {!data.governanceRequests.some(
              (item) => item.status === "pending",
            ) && (
              <p className="text-sm text-muted-foreground">
                No pending requests.
              </p>
            )}
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Departments">
          <ul className="divide-y text-sm">
            {data.departments.map((item) => (
              <li key={item.id} className="py-3">
                <span>
                  {item.name}{" "}
                  <span className="text-muted-foreground">({item.code})</span>
                </span>
                <StatusBadge value={item.active ? "active" : "inactive"} />
                {data.canAdmin && (
                  <AdminRecordEditor
                    kind="department"
                    id={item.id}
                    name={item.name}
                    active={item.active}
                    version={item.version}
                  />
                )}
              </li>
            ))}
          </ul>
          {!data.departments.length && (
            <p className="text-sm text-muted-foreground">
              Create the first department above.
            </p>
          )}
        </Panel>
        <Panel title="Regions">
          <ul className="divide-y text-sm">
            {data.regions.map((item) => (
              <li key={item.id} className="py-3">
                {item.name}{" "}
                <span className="text-muted-foreground">
                  · {item.level} · {item.code}
                </span>
                {data.canAdmin && (
                  <AdminRecordEditor
                    kind="region"
                    id={item.id}
                    name={item.name}
                    active={item.active}
                  />
                )}
              </li>
            ))}
          </ul>
          {!data.regions.length && (
            <p className="text-sm text-muted-foreground">
              Start with a state, then add its districts and local regions.
            </p>
          )}
        </Panel>
      </div>
      <div id="authority-directory" className="scroll-mt-24">
        <AdminUserDirectory
          authorityId={data.selectedAuthorityId}
          users={data.users}
          authorityMembers={data.authorityMembers}
          departmentMembers={data.departmentMembers}
          departments={data.departments}
          roles={data.roles}
          permissions={data.rolePermissions}
          canManage={data.canAdmin}
          onAssign={(clerkId, departmentId, role) => {
            const nextAction =
              departmentId === undefined
                ? "authority_member"
                : "department_member";
            setAction(nextAction);
            form.reset();
            form.setValue("clerk_id", clerkId);
            form.setValue("department_id", departmentId ?? "");
            form.setValue("role", role ?? "");
            document
              .getElementById("authority-change-form")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
          onEditRole={(code) => {
            const r = data.roles.find((item) => item.code === code);
            setAction("role_edit");
            form.reset();
            form.setValue("code", code);
            form.setValue("name", r?.name ?? "");
            form.setValue(
              "permissions",
              data.rolePermissions
                .filter((item) => item.role === code)
                .map((item) => item.permission),
            );
            document
              .getElementById("authority-change-form")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </div>
      <Panel title="Recent decisions">
        <ul className="divide-y text-sm">
          {data.governanceRequests
            .filter((item) => item.status !== "pending")
            .map((item) => (
              <li key={item.id} className="py-3">
                <span className="mr-3">
                  {titles[item.action as Action] ?? item.action}
                </span>
                <StatusBadge value={item.status} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.decisionReason ?? item.reason}
                  {item.decidedBy ? ` · ${nameOf(item.decidedBy)}` : ""}
                </p>
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  );
}
