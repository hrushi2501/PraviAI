"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseCoordinateInput } from "@/lib/coordinate-input";
import type { ActionResult } from "@/server/actions/action-client";
import {
  getAssetRegisterOptions,
  getAssetRegistrationDefinitions,
  listRegisteredAssets,
  saveRegisteredAsset,
} from "@/server/actions/asset-register.actions";

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm w-full";

export function PersistedAssetRegister() {
  const params = useSearchParams();
  const scope = params.get("department") ?? "";
  return <ScopedAssetRegister key={scope} selectedDepartment={scope} />;
}

function ScopedAssetRegister({
  selectedDepartment,
}: {
  selectedDepartment: string;
}) {
  const cache = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [registration, setRegistration] = useState<string>("");
  const [availability, setAvailability] = useState<string>("");
  const [lifecycle, setLifecycle] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    | "code"
    | "name"
    | "department"
    | "template"
    | "registration"
    | "lifecycle"
    | "availability"
  >("code");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [open, setOpen] = useState(false);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    {
      code: true,
      name: true,
      department: true,
      template: true,
      registration: true,
      lifecycle: true,
      availability: true,
    },
  );
  const [notice, setNotice] = useState("");

  const options = useQuery({
    queryKey: ["asset-register-options"],
    queryFn: async () => unwrap(await getAssetRegisterOptions()),
  });

  const department = options.data?.departments.find(
    (d) => d.id === selectedDepartment,
  );
  const departmentId = selectedDepartment;

  const records = useQuery({
    queryKey: [
      "registered-assets",
      departmentId,
      page,
      pageSize,
      search,
      registration,
      availability,
      lifecycle,
      sortBy,
      sortOrder,
    ],
    enabled: Boolean(options.data?.departments.length),
    queryFn: async () =>
      unwrap(
        await listRegisteredAssets({
          departmentId: departmentId || undefined,
          page,
          pageSize,
          search,
          registration: registration || undefined,
          availability: availability || undefined,
          lifecycle: lifecycle || undefined,
          sortBy,
          sortOrder,
        }),
      ),
  });

  const toggleSort = (
    col:
      | "code"
      | "name"
      | "department"
      | "template"
      | "registration"
      | "lifecycle"
      | "availability",
  ) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const exportCsv = () => {
    if (!records.data?.rows.length) return;
    const headers = [
      "Asset Code",
      "Name",
      "Department",
      "Asset Type",
      "Registration Status",
      "Lifecycle Stage",
      "Service Availability",
    ];
    const rows = records.data.rows.map((r) => [
      `"${r.code.replace(/"/g, '""')}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.department.replace(/"/g, '""')}"`,
      `"${r.template.replace(/"/g, '""')}"`,
      `"${r.registration.replace(/"/g, '""')}"`,
      `"${r.lifecycle.replace(/"/g, '""')}"`,
      `"${r.availability.replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `assets_register_${selectedDepartment || "all"}_page_${page}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = Boolean(
    search || registration || availability || lifecycle,
  );

  const clearAllFilters = () => {
    setSearchInput("");
    setSearch("");
    setRegistration("");
    setAvailability("");
    setLifecycle("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Asset register
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search your department’s assets and save new registrations as
            drafts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!records.data?.rows.length}
            className="text-xs"
          >
            Export CSV
          </Button>
          <Button
            disabled={!department?.canWrite}
            onClick={() => setOpen(true)}
          >
            <Plus /> Register asset
          </Button>
        </div>
      </div>

      {/* Quick Filter Presets */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3 text-sm">
        <span className="text-xs font-medium text-muted-foreground mr-1">
          Preset views:
        </span>
        <Button
          variant={!registration && !hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={clearAllFilters}
        >
          All Assets
        </Button>
        <Button
          variant={registration === "submitted" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setRegistration("submitted");
            setPage(1);
          }}
        >
          Awaiting Verification
        </Button>
        <Button
          variant={registration === "draft" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setRegistration("draft");
            setPage(1);
          }}
        >
          My Drafts
        </Button>
        <Button
          variant={registration === "verified" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setRegistration("verified");
            setPage(1);
          }}
        >
          Verified Assets
        </Button>
        <Button
          variant={
            registration === "correction_required" ? "default" : "outline"
          }
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setRegistration("correction_required");
            setPage(1);
          }}
        >
          Corrections Needed
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        <Link
          href={`/app/map${selectedDepartment ? `?department=${encodeURIComponent(selectedDepartment)}` : ""}`}
          className="text-primary underline"
        >
          Open asset map
        </Link>{" "}
        ·{" "}
        <Link href="/app/asset-types" className="text-primary underline">
          Asset definitions
        </Link>{" "}
        ·{" "}
        <Link href="/app/administration" className="text-primary underline">
          Department and region setup
        </Link>
      </p>

      {notice && (
        <output className="rounded-md border bg-muted/40 p-3 text-sm">
          {notice}
        </output>
      )}

      {options.isPending ? (
        <output>Loading departments…</output>
      ) : options.isError ? (
        <div role="alert" className="rounded-md border p-4">
          <p>{options.error.message}</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => options.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : !options.data?.departments.length ? (
        <div className="rounded-lg border bg-white p-8">
          <h2 className="font-medium">No accessible departments</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask your authority administrator for an active department
            assignment, then refresh.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => options.refetch()}
          >
            Refresh access
          </Button>
        </div>
      ) : (
        <>
          {/* Advanced Multi-Factor Filter Toolbar */}
          <div className="rounded-lg border bg-white p-4 space-y-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput);
                setPage(1);
              }}
            >
              <label
                htmlFor="asset-search"
                className="flex-1 min-w-52 space-y-1 text-sm"
              >
                <span>Find an asset</span>
                <Input
                  id="asset-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Asset name or code"
                  maxLength={240}
                />
              </label>

              <label className="space-y-1 text-sm min-w-40">
                <span>Registration</span>
                <select
                  aria-label="Filter by registration"
                  className={selectClass}
                  value={registration}
                  onChange={(e) => {
                    setRegistration(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="verified">Verified</option>
                  <option value="correction_required">
                    Correction Required
                  </option>
                </select>
              </label>

              <label className="space-y-1 text-sm min-w-40">
                <span>Availability</span>
                <select
                  aria-label="Filter by availability"
                  className={selectClass}
                  value={availability}
                  onChange={(e) => {
                    setAvailability(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All availability</option>
                  <option value="in_service">In Service</option>
                  <option value="restricted">Restricted</option>
                  <option value="closed">Closed</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>

              <label className="space-y-1 text-sm min-w-40">
                <span>Lifecycle</span>
                <select
                  aria-label="Filter by lifecycle"
                  className={selectClass}
                  value={lifecycle}
                  onChange={(e) => {
                    setLifecycle(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All stages</option>
                  <option value="in_service">In Service</option>
                  <option value="decommissioned">Decommissioned</option>
                  <option value="disposed">Disposed</option>
                </select>
              </label>

              <Button type="submit" variant="outline">
                Search
              </Button>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="text-xs text-muted-foreground"
                >
                  Reset filters
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                aria-label="Refresh asset list"
                onClick={() => records.refetch()}
              >
                <RefreshCw />
              </Button>
            </form>

            {/* Table Meta & Column Visibility Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  aria-label="Select page size"
                  value={pageSize}
                  className="h-7 rounded border bg-card px-2 text-xs"
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowColumnsMenu(!showColumnsMenu)}
                >
                  Customize columns ▾
                </Button>
                {showColumnsMenu && (
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border bg-card p-2 shadow-md space-y-1 text-xs">
                    <p className="font-semibold text-foreground px-1 pb-1 border-b">
                      Visible columns
                    </p>
                    {Object.keys(visibleColumns).map((colKey) => (
                      <label
                        key={colKey}
                        className="flex items-center gap-2 px-1 py-0.5 hover:bg-muted rounded cursor-pointer capitalize"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[colKey]}
                          onChange={(e) =>
                            setVisibleColumns({
                              ...visibleColumns,
                              [colKey]: e.target.checked,
                            })
                          }
                        />
                        {colKey}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white">
            {records.isPending ? (
              <output className="p-8 text-sm">Loading assets…</output>
            ) : records.isError ? (
              <div className="p-6" role="alert">
                <p>{records.error.message}</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => records.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : !records.data?.rows.length ? (
              <div className="p-10 text-center">
                <p className="font-medium">
                  {hasActiveFilters
                    ? "No matching assets"
                    : "No assets registered yet"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Try clearing or broadening your search criteria."
                    : department?.canWrite
                      ? "Register your first asset using a published department template."
                      : "Your department’s registered assets will appear here."}
                </p>
                {hasActiveFilters && (
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {visibleColumns.code && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("code")}
                      >
                        <span className="flex items-center gap-1">
                          Asset code{" "}
                          {sortBy === "code"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.name && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("name")}
                      >
                        <span className="flex items-center gap-1">
                          Name{" "}
                          {sortBy === "name"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.department && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("department")}
                      >
                        <span className="flex items-center gap-1">
                          Department{" "}
                          {sortBy === "department"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.template && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("template")}
                      >
                        <span className="flex items-center gap-1">
                          Asset type{" "}
                          {sortBy === "template"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.registration && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("registration")}
                      >
                        <span className="flex items-center gap-1">
                          Registration{" "}
                          {sortBy === "registration"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.lifecycle && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("lifecycle")}
                      >
                        <span className="flex items-center gap-1">
                          Lifecycle{" "}
                          {sortBy === "lifecycle"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                    {visibleColumns.availability && (
                      <th
                        className="px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("availability")}
                      >
                        <span className="flex items-center gap-1">
                          Availability{" "}
                          {sortBy === "availability"
                            ? sortOrder === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅"}
                        </span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {records.data.rows.map((row) => (
                    <tr
                      className="border-b last:border-0 hover:bg-muted/30"
                      key={row.id}
                    >
                      {visibleColumns.code && (
                        <td className="px-4 py-3 font-medium">
                          <Link
                            className="font-medium text-primary hover:underline"
                            href={`/app/assets/${row.id}?department=${row.departmentId}`}
                          >
                            {row.code}
                          </Link>
                        </td>
                      )}
                      {visibleColumns.name && (
                        <td className="px-4 py-3">
                          <Link
                            className="hover:underline font-medium text-foreground"
                            href={`/app/assets/${row.id}?department=${row.departmentId}`}
                          >
                            {row.name}
                          </Link>
                        </td>
                      )}
                      {visibleColumns.department && (
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.department}
                        </td>
                      )}
                      {visibleColumns.template && (
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {row.template}
                        </td>
                      )}
                      {visibleColumns.registration && (
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              row.registration === "verified"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : row.registration === "submitted"
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.registration.replace("_", " ")}
                          </span>
                        </td>
                      )}
                      {visibleColumns.lifecycle && (
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {row.lifecycle.replace("_", " ")}
                        </td>
                      )}
                      {visibleColumns.availability && (
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {row.availability.replace("_", " ")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {records.data && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                <span>
                  Showing {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, records.data.total)} of{" "}
                  {records.data.total.toLocaleString("en-IN")} assets · Page{" "}
                  {page} of{" "}
                  {Math.max(1, Math.ceil(records.data.total / pageSize))}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1 || records.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      page * pageSize >= records.data.total ||
                      records.isFetching
                    }
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Register asset</SheetTitle>
            <SheetDescription>
              Save a draft in {department?.name}. Independent verification
              follows submission.
            </SheetDescription>
          </SheetHeader>
          {open && departmentId && (
            <RegistrationForm
              key={departmentId}
              departmentId={departmentId}
              onSaved={(code) => {
                setOpen(false);
                setNotice(`Asset ${code} saved as a draft.`);
                setPage(1);
                cache.invalidateQueries({ queryKey: ["registered-assets"] });
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RegistrationForm({
  departmentId,
  onSaved,
}: {
  departmentId: string;
  onSaved: (code: string) => void;
}) {
  const definitions = useQuery({
    queryKey: ["registration-definitions", departmentId],
    queryFn: async () =>
      unwrap(await getAssetRegistrationDefinitions(departmentId)),
  });
  const [templateKey, setTemplateKey] = useState("");
  const template =
    definitions.data?.templates.find(
      (t) => `${t.code}:${t.version}` === templateKey,
    ) ?? definitions.data?.templates[0];
  const form = useForm<{
    assetCode: string;
    name: string;
    regionId: string;
    sourceReference: string;
    ownerReference: string;
    custodianReference: string;
    latitude: string;
    longitude: string;
    attributes: Record<string, string>;
  }>({
    defaultValues: {
      assetCode: "",
      name: "",
      regionId: "",
      sourceReference: "",
      ownerReference: "",
      custodianReference: "",
      latitude: "",
      longitude: "",
      attributes: {},
    },
    shouldUnregister: true,
  });
  const save = useMutation({
    mutationFn: async (values: {
      assetCode: string;
      name: string;
      regionId: string;
      sourceReference: string;
      ownerReference: string;
      custodianReference: string;
      latitude: string;
      longitude: string;
      attributes: Record<string, string>;
    }) => {
      if (!template) throw new Error("Select a published template");
      const attributes: Record<string, unknown> = {};
      for (const field of template.fields) {
        const key = String(field.key);
        const value = values.attributes?.[key];
        if (value == null || value === "") continue;
        attributes[key] =
          field.type === "number" || field.type === "integer"
            ? Number(value)
            : field.type === "boolean"
              ? value === "true"
              : value;
      }
      const coordinates = parseCoordinateInput(
        values.latitude,
        values.longitude,
      );
      const result = await saveRegisteredAsset({
        departmentId,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        assetCode: values.assetCode.trim(),
        name: values.name.trim(),
        regionId: values.regionId || undefined,
        sourceReference: values.sourceReference.trim(),
        ownerReference: values.ownerReference.trim() || undefined,
        custodianReference: values.custodianReference.trim() || undefined,
        templateCode: template.code,
        templateVersion: template.version,
        attributes,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => onSaved(data.code),
  });
  if (definitions.isPending)
    return <output className="p-4">Loading published templates…</output>;
  if (definitions.isError)
    return (
      <div className="p-4" role="alert">
        <p>{definitions.error.message}</p>
        <Button variant="outline" onClick={() => definitions.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!template)
    return (
      <p className="p-4 text-sm">
        No published templates are available. Ask a template reviewer to publish
        an asset definition before registration.{" "}
        <Link
          href="/app/asset-types"
          className="text-primary underline underline-offset-4"
        >
          Open asset definitions
        </Link>
      </p>
    );
  const unsupported = template.fields.some(
    (f) =>
      typeof f.key !== "string" ||
      !["text", "number", "integer", "select", "date", "boolean"].includes(
        String(f.type),
      ),
  );
  return (
    <form
      className="space-y-4 p-4"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <label className="block space-y-1 text-sm">
        <span>Published template</span>
        <select
          className={selectClass}
          value={`${template.code}:${template.version}`}
          onChange={(e) => {
            setTemplateKey(e.target.value);
            form.resetField("attributes");
            save.reset();
          }}
        >
          {definitions.data?.templates.map((t) => (
            <option
              value={`${t.code}:${t.version}`}
              key={`${t.code}:${t.version}`}
            >
              {t.name} · version {t.version}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="asset-code" className="block space-y-1 text-sm">
        <span>Asset code *</span>
        <Input
          id="asset-code"
          {...form.register("assetCode", { required: true })}
          required
          maxLength={80}
        />
      </label>
      <label htmlFor="asset-name" className="block space-y-1 text-sm">
        <span>Asset name *</span>
        <Input
          id="asset-name"
          {...form.register("name", { required: true })}
          required
          maxLength={240}
        />
      </label>
      <label htmlFor="asset-source" className="block space-y-1 text-sm">
        <span>Documentary source reference *</span>
        <Input
          id="asset-source"
          required
          {...form.register("sourceReference", {
            required: true,
            validate: (value) => Boolean(value.trim()),
          })}
          placeholder="Official register, survey or document reference"
          maxLength={1000}
        />
        <span className="block text-xs text-muted-foreground">
          Identify the real official record supporting this registration.
        </span>
      </label>
      {form.formState.errors.sourceReference && (
        <p role="alert" className="text-sm text-destructive">
          Enter a documentary source reference containing text.
        </p>
      )}
      <label htmlFor="asset-owner" className="block space-y-1 text-sm">
        <span>Owner reference</span>
        <Input
          id="asset-owner"
          {...form.register("ownerReference")}
          maxLength={1000}
        />
      </label>
      <label htmlFor="asset-custodian" className="block space-y-1 text-sm">
        <span>Custodian reference</span>
        <Input
          id="asset-custodian"
          {...form.register("custodianReference")}
          maxLength={1000}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Region (required before submission)</span>
        <select {...form.register("regionId")} className={selectClass}>
          <option value="">Not specified</option>
          {definitions.data?.regions.map((r) => (
            <option value={r.id} key={r.id}>
              {r.name} · {r.level}
            </option>
          ))}
        </select>
      </label>
      {!definitions.data?.regions.length && (
        <p className="text-sm text-muted-foreground">
          No active regions are available.{" "}
          <Link href="/app/administration" className="text-primary underline">
            Ask an authority administrator to create the canonical region
            hierarchy
          </Link>{" "}
          before submitting this registration.
        </p>
      )}
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">
          Map coordinates (optional)
        </legend>
        <p className="mb-3 text-xs text-muted-foreground">
          Use documented decimal coordinates. Enter both values or leave both
          unknown. A point does not establish a road's regional length
          attribution.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="asset-latitude" className="text-sm">
            Latitude
            <Input
              id="asset-latitude"
              type="number"
              step="any"
              min={6}
              max={38}
              {...form.register("latitude")}
            />
          </label>
          <label htmlFor="asset-longitude" className="text-sm">
            Longitude
            <Input
              id="asset-longitude"
              type="number"
              step="any"
              min={68}
              max={98}
              {...form.register("longitude")}
            />
          </label>
        </div>
      </fieldset>
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium text-sm">Asset details</h3>
        {template.fields.map((field) => {
          const key = String(field.key);
          const required = field.required === true;
          const label =
            typeof field.label === "string"
              ? field.label
              : key.replaceAll("_", " ");
          const options =
            field.type === "boolean"
              ? ["true", "false"]
              : Array.isArray(field.options)
                ? field.options.filter(
                    (v): v is string => typeof v === "string",
                  )
                : [];
          return (
            <label
              htmlFor={`asset-field-${key}`}
              className="block space-y-1 text-sm"
              key={`${template.code}:${template.version}:${key}`}
            >
              <span className="capitalize">
                {label}
                {required ? " *" : ""}
                {typeof field.unit === "string" ? ` (${field.unit})` : ""}
              </span>
              {field.type === "select" || field.type === "boolean" ? (
                <select
                  id={`asset-field-${key}`}
                  className={selectClass}
                  required={required}
                  {...form.register(`attributes.${key}`)}
                >
                  <option value="">Choose a value</option>
                  {options.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`asset-field-${key}`}
                  {...form.register(`attributes.${key}`)}
                  required={required}
                  type={
                    field.type === "integer" || field.type === "number"
                      ? "number"
                      : field.type === "date"
                        ? "date"
                        : "text"
                  }
                  step={field.type === "integer" ? 1 : "any"}
                  min={typeof field.min === "number" ? field.min : undefined}
                  max={typeof field.max === "number" ? field.max : undefined}
                />
              )}
            </label>
          );
        })}
      </div>
      {unsupported && (
        <p role="alert" className="text-sm text-destructive">
          This template contains a field type this form cannot handle. Contact
          your template administrator.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <Button type="submit" disabled={save.isPending || unsupported}>
        {save.isPending ? "Saving…" : "Save draft"}
      </Button>
    </form>
  );
}
