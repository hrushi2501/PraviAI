"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DepartmentTemplateSelect } from "@/db/schema/templates";
import type { ActionResult } from "@/server/actions/action-client";
import {
  createTemplate,
  editTemplate,
  getTemplateWorkspace,
  transitionTemplate,
} from "@/server/actions/template.actions";

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}
const selectClass = "h-9 w-full rounded-md border bg-white px-3 text-sm";
type Workspace =
  Awaited<ReturnType<typeof getTemplateWorkspace>> extends ActionResult<infer T>
    ? T
    : never;

export function TemplateWorkspace() {
  const params = useSearchParams();
  const scope = params.get("department") ?? "";
  return <ScopedTemplates key={scope} scope={scope} />;
}

function ScopedTemplates({ scope }: { scope: string }) {
  const cache = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState<
    DepartmentTemplateSelect | "create" | null
  >(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["template-workspace", scope],
    queryFn: async () => unwrap(await getTemplateWorkspace(scope || undefined)),
  });
  function refresh(message: string) {
    setNotice(message);
    setEditing(null);
    cache.invalidateQueries({ queryKey: ["template-workspace"] });
    cache.invalidateQueries({ queryKey: ["registration-definitions"] });
    router.refresh();
  }
  const department = query.data?.departments.find((d) => d.id === scope);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Asset definitions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a department definition, submit it for independent review,
            then use its published version for registration.
          </p>
        </div>
        <Button
          disabled={!department?.canWrite}
          onClick={() => setEditing("create")}
        >
          Create definition
        </Button>
      </div>
      {!scope && (
        <p className="text-sm text-muted-foreground">
          Select a department in the header to create a definition.
        </p>
      )}
      {query.data && !query.data.departments.length && (
        <p className="rounded-md border bg-card p-4 text-sm">
          Create a department and assign its manager and reviewer first.{" "}
          <Link
            href="/app/administration"
            className="text-primary underline underline-offset-4"
          >
            Open authority administration
          </Link>
        </p>
      )}
      {notice && (
        <output className="block rounded-md border bg-muted/40 p-3 text-sm">
          {notice}
        </output>
      )}
      {query.isPending ? (
        <output>Loading definitions…</output>
      ) : query.isError ? (
        <div role="alert" className="rounded-md border p-5">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : !query.data?.templates.length ? (
        <div className="rounded-lg border bg-white p-8">
          <p className="font-medium">No department definitions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            An officer with template permissions can create a draft from a
            standard starter. A different authorized reviewer must publish it.
          </p>
        </div>
      ) : (
        query.data.templates.map((template) => {
          const dept = query.data?.departments.find(
            (d) => d.id === template.departmentId,
          );
          const independent =
            query.data?.actorId !== template.createdBy &&
            query.data?.actorId !== template.submittedBy;
          return (
            <div
              key={`${template.departmentId}:${template.code}:${template.version}`}
              className="rounded-lg border bg-white p-5 space-y-4"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="font-semibold">
                    {template.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · version {template.version}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dept?.name} · {template.code} ·{" "}
                    {template.status.replaceAll("_", " ")}
                  </p>
                </div>
                {dept?.canWrite &&
                  ["draft", "correction_required"].includes(
                    template.status,
                  ) && (
                    <Button
                      variant="outline"
                      onClick={() => setEditing(template)}
                    >
                      Edit draft
                    </Button>
                  )}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Policy reference</dt>
                  <dd className="mt-1">{template.policyReference}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lifecycle stages</dt>
                  <dd className="mt-1">
                    {template.lifecycleStages.join(" → ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Inspection components
                  </dt>
                  <dd className="mt-1">{template.components.join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fields</dt>
                  <dd className="mt-1">
                    {template.fields
                      .map((f) => `${String(f.key)}${f.required ? " *" : ""}`)
                      .join(", ") || "None"}
                  </dd>
                </div>
              </dl>
              {template.decisionReason && (
                <p className="text-sm">
                  Last decision: {template.decisionReason}
                </p>
              )}
              <TemplateDecision
                template={template}
                canWrite={dept?.canWrite ?? false}
                canApprove={(dept?.canApprove ?? false) && independent}
                onDone={refresh}
              />
              {template.status === "submitted" &&
                dept?.canApprove &&
                !independent && (
                  <p className="text-xs text-muted-foreground">
                    You created or submitted this version. A different reviewer
                    must publish or return it.
                  </p>
                )}
            </div>
          );
        })
      )}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {editing === "create"
                ? "Create department definition"
                : "Edit draft definition"}
            </SheetTitle>
            <SheetDescription>
              Published versions remain unchanged. Every update is checked
              against the current revision.
            </SheetDescription>
          </SheetHeader>
          {editing && query.data && (
            <DefinitionEditor
              key={
                editing === "create"
                  ? "create"
                  : `${editing.code}:${editing.version}:${editing.revision}`
              }
              initial={editing === "create" ? undefined : editing}
              scope={scope}
              workspace={query.data}
              onDone={refresh}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TemplateDecision({
  template,
  canWrite,
  canApprove,
  onDone,
}: {
  template: DepartmentTemplateSelect;
  canWrite: boolean;
  canApprove: boolean;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const actions: Array<"submit" | "publish" | "return" | "withdraw"> =
    template.status === "submitted"
      ? canApprove
        ? ["publish", "return"]
        : []
      : ["draft", "correction_required"].includes(template.status) && canWrite
        ? ["submit", "withdraw"]
        : [];
  const mutation = useMutation({
    mutationFn: async (action: (typeof actions)[number]) =>
      unwrap(
        await transitionTemplate({
          departmentId: template.departmentId,
          code: template.code,
          version: template.version,
          revision: template.revision,
          reason,
          action,
        }),
      ),
    onSuccess: ({ action }) =>
      onDone(
        `${template.name}: ${action === "publish" ? "published" : action === "return" ? "returned for correction" : action === "withdraw" ? "withdrawn" : "submitted for independent review"}.`,
      ),
  });
  if (!actions.length) return null;
  const id = `template-reason-${template.departmentId}-${template.code}-${template.version}`;
  return (
    <div className="border-t pt-4 space-y-3">
      <label htmlFor={id} className="block text-sm">
        Decision reason
        <Input
          id={id}
          className="mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="Why this definition is ready or needs correction"
        />
      </label>
      <div className="flex gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={
              action === "publish" || action === "submit"
                ? "default"
                : "outline"
            }
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate(action)}
          >
            {action === "publish"
              ? "Publish"
              : action === "return"
                ? "Return for correction"
                : action === "withdraw"
                  ? "Withdraw"
                  : "Submit for review"}
          </Button>
        ))}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}

function DefinitionEditor({
  initial,
  scope,
  workspace,
  onDone,
}: {
  initial?: DepartmentTemplateSelect;
  scope: string;
  workspace: Workspace;
  onDone: (message: string) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [base, setBase] = useState(workspace.starters[0]?.code ?? "");
  const [policy, setPolicy] = useState(initial?.policyReference ?? "");
  const [components, setComponents] = useState(
    initial?.components.join(", ") ?? "",
  );
  const [fields, setFields] = useState(initial?.fields ?? []);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState("");
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: async () =>
      initial
        ? unwrap(
            await editTemplate({
              departmentId: initial.departmentId,
              code: initial.code,
              version: initial.version,
              revision: initial.revision,
              reason,
              name,
              policy,
              fields,
              components: components
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            }),
          )
        : unwrap(
            await createTemplate({
              departmentId: scope,
              code,
              name,
              base,
              policy,
              requestId,
            }),
          ),
    onSuccess: () =>
      onDone(
        `${name}: draft ${initial ? "updated" : "created"}. Submit it for independent review before registration.`,
      ),
  });
  const starter = workspace.starters.find((s) => s.code === base);
  const labelClass = "block space-y-1 text-sm";
  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {!initial && (
        <>
          <label className={labelClass} htmlFor="definition-code">
            <span>Stable code *</span>
            <Input
              id="definition-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              pattern="[a-z][a-z0-9_]{0,49}"
              placeholder="district_road"
            />
          </label>
          <label className={labelClass}>
            <span>Standard starter</span>
            <select
              className={selectClass}
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              {workspace.starters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            The starter supplies fields, inspection components and approved
            lifecycle rules. Edit the resulting draft before submitting if
            needed.
          </p>
          {starter && (
            <p className="text-sm">
              Fields: {starter.fields.map((f) => String(f.key)).join(", ")}
              <br />
              Components: {starter.components.join(", ")}
              <br />
              Lifecycle: {starter.stages.join(" → ")}
            </p>
          )}
        </>
      )}
      <label className={labelClass} htmlFor="definition-name">
        <span>Definition name *</span>
        <Input
          id="definition-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={240}
        />
      </label>
      <label className={labelClass} htmlFor="definition-policy">
        <span>Actual policy reference *</span>
        <Input
          id="definition-policy"
          required
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
          maxLength={2000}
          placeholder="Department circular or approved engineering standard"
        />
      </label>
      {initial && (
        <>
          <label className={labelClass} htmlFor="definition-components">
            <span>Inspection component keys *</span>
            <Input
              id="definition-components"
              value={components}
              onChange={(e) => setComponents(e.target.value)}
              required
            />
            <span className="block text-xs text-muted-foreground">
              Separate stable lowercase keys with commas.
            </span>
          </label>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Template fields</legend>
            {fields.map((field, index) => (
              <div
                key={String(field.key)}
                className="rounded-md border p-3 text-sm"
              >
                <div className="flex justify-between gap-2">
                  <span>
                    {String(field.key)} · {String(field.type)}
                  </span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.required === true}
                      onChange={(e) =>
                        setFields(
                          fields.map((f, i) =>
                            i === index
                              ? { ...f, required: e.target.checked }
                              : f,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                </div>
                {Array.isArray(field.options) && (
                  <label
                    htmlFor={`options-${String(field.key)}`}
                    className="mt-2 block"
                  >
                    Select options (comma separated)
                    <Input
                      id={`options-${String(field.key)}`}
                      value={field.options.join(", ")}
                      onChange={(e) =>
                        setFields(
                          fields.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  options: e.target.value
                                    .split(",")
                                    .map((v) => v.trim()),
                                }
                              : f,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    setFields(fields.filter((_, i) => i !== index))
                  }
                >
                  Remove field
                </Button>
              </div>
            ))}
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Add field</p>
              <label htmlFor="new-template-field" className="block text-sm">
                Stable field key
                <Input
                  id="new-template-field"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="surface_material"
                />
              </label>
              <label className="block text-sm">
                Field type
                <select
                  className={selectClass}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {[
                    "text",
                    "select",
                    "number",
                    "integer",
                    "date",
                    "boolean",
                  ].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              {newType === "select" && (
                <label htmlFor="new-template-options" className="block text-sm">
                  Select options (comma separated)
                  <Input
                    id="new-template-options"
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                  />
                </label>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={
                  !/^[a-z][a-z0-9_]{0,49}$/.test(newKey) ||
                  fields.some((f) => f.key === newKey) ||
                  fields.length >= 80 ||
                  (newType === "select" && !newOptions.trim())
                }
                onClick={() => {
                  setFields([
                    ...fields,
                    {
                      key: newKey,
                      type: newType,
                      required: false,
                      ...(newType === "select"
                        ? {
                            options: newOptions
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean),
                          }
                        : {}),
                    },
                  ]);
                  setNewKey("");
                  setNewOptions("");
                }}
              >
                Add field
              </Button>
            </div>
          </fieldset>
          <label className={labelClass} htmlFor="definition-edit-reason">
            <span>Change reason *</span>
            <Input
              id="definition-edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={2000}
            />
          </label>
        </>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          mutation.isPending ||
          !name.trim() ||
          !policy.trim() ||
          (!initial && !base) ||
          (Boolean(initial) && !reason.trim())
        }
      >
        {mutation.isPending
          ? "Saving…"
          : initial
            ? "Save changes"
            : "Create draft"}
      </Button>
    </form>
  );
}
