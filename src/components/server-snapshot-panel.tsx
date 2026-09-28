"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createServerReportSnapshotAction,
  getSnapshotWorkspaceAction,
  listServerReportSnapshotsAction,
} from "@/server/actions/snapshot.actions";

export function ServerSnapshotPanel({ department }: { department?: string }) {
  const cache = useQueryClient();
  const [authority, setAuthority] = useState("");
  const [type, setType] = useState<
    "condition" | "restoration" | "inventory" | "measure"
  >("inventory");
  const key = useRef<{ payload: string; requestId: string } | null>(null);
  const options = useQuery({
    queryKey: ["snapshot-workspace"],
    queryFn: async () => {
      const result = await getSnapshotWorkspaceAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const selectedDepartment = options.data?.departments.find(
    (item) => item.id === department,
  );
  const authorityId =
    selectedDepartment?.authorityId ||
    authority ||
    options.data?.authorities.find((item) => item.canReadWhole)?.id;
  const canGenerate = Boolean(
    selectedDepartment ||
      options.data?.authorities.some(
        (item) => item.id === authorityId && item.canReadWhole,
      ),
  );
  const records = useQuery({
    queryKey: ["server-snapshots", authorityId, department],
    enabled: Boolean(authorityId),
    queryFn: async () => {
      const result = await listServerReportSnapshotsAction({
        authorityId,
        departmentId: department,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!authorityId || !canGenerate)
        throw new Error(
          "Select an authorized department or authority-wide read scope.",
        );
      const payload = JSON.stringify({ authorityId, department, type });
      if (key.current?.payload !== payload)
        key.current = { payload, requestId: crypto.randomUUID() };
      const result = await createServerReportSnapshotAction({
        authorityId,
        departmentId: department,
        snapshotType: type,
        requestId: key.current.requestId,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      key.current = null;
      cache.invalidateQueries({ queryKey: ["server-snapshots"] });
    },
  });
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold">Saved reporting snapshots</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Snapshots freeze current authorized database aggregates with server time
        and actor. Historical reconstruction and caller-supplied totals are not
        accepted.
      </p>
      {options.isError ? (
        <p role="alert" className="mt-3 text-sm">
          Snapshot scopes could not be loaded.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {!department && (
            <label className="text-sm">
              Authority
              <select
                className="mt-1 block rounded-md border p-2"
                value={authorityId ?? ""}
                onChange={(event) => {
                  setAuthority(event.target.value);
                  generate.reset();
                }}
              >
                <option value="">Choose authority</option>
                {options.data?.authorities
                  .filter((item) => item.canReadWhole)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            Report type
            <select
              className="mt-1 block rounded-md border p-2"
              value={type}
              onChange={(event) => {
                setType(event.target.value as typeof type);
                generate.reset();
              }}
            >
              {["inventory", "condition", "restoration", "measure"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <Button
            disabled={!canGenerate || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Saving…" : "Save current snapshot"}
          </Button>
        </div>
      )}
      {!options.isPending && !canGenerate && (
        <p className="mt-3 text-xs text-muted-foreground">
          Select an authorized department in the header. Authority-wide
          generation requires an authority-wide grant.
        </p>
      )}
      {generate.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {generate.error.message}
        </p>
      )}
      {generate.isSuccess && (
        <output className="mt-3 block text-sm">
          Snapshot saved for {generate.data.asOfDate}.
        </output>
      )}
      {records.isPending && authorityId ? (
        <output className="mt-3 block text-sm">Loading saved snapshots…</output>
      ) : records.isError ? (
        <p role="alert" className="mt-3 text-sm">
          Snapshot history is unavailable.
        </p>
      ) : records.data?.length ? (
        <div className="mt-4 space-y-2">
          {records.data.map((record) => (
            <details key={record.id} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">
                {record.snapshotType} · {record.asOfDate} · {record.createdBy}
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(record.data, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      ) : (
        authorityId && (
          <p className="mt-3 text-sm text-muted-foreground">
            No saved snapshots in this scope.
          </p>
        )
      )}
    </section>
  );
}
