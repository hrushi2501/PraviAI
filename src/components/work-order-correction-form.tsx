"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  editWorkOrderAction,
  getWorkOrderCorrectionAction,
} from "@/server/actions/work-order.actions";

const schema = z.object({
  description: z.string().trim().min(1).max(10000),
  justification: z.string().trim().min(1).max(10000),
  assignee: z.string(),
  targetOn: z.union([z.iso.date(), z.literal("")]),
  reason: z.string().trim().min(1).max(4000),
});
type Fields = z.infer<typeof schema>;
type Data = NonNullable<
  Extract<
    Awaited<ReturnType<typeof getWorkOrderCorrectionAction>>,
    { success: true }
  >["data"]
>;
export function WorkOrderCorrectionForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setOpen(true);
    setData(null);
    setError("");
    try {
      const result = await getWorkOrderCorrectionAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (!result.data) {
        setError("Work order is unavailable in your current scope.");
        return;
      }
      setData(result.data);
    } catch {
      setError("Work order could not be loaded. Try again.");
    }
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={load}>
        Correct proposal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Correct restoration proposal</DialogTitle>
            <DialogDescription>
              Update the scope, justification, responsible executor and
              deadline. Independent approval remains required.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : data ? (
            <WorkEditor
              key={data.record.version}
              data={data}
              onSaved={() => setOpen(false)}
            />
          ) : (
            <output className="text-sm text-muted-foreground">
              Loading current proposal…
            </output>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function WorkEditor({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: data.record.description,
      justification: data.record.justification,
      assignee: data.record.assignedTo ?? "",
      targetOn: data.record.targetOn ?? "",
      reason: "",
    },
  });
  async function save(values: Fields) {
    setMessage("");
    try {
      const result = await editWorkOrderAction({
        id: data.record.id,
        expectedVersion: data.record.version,
        reason: values.reason,
        patch: {
          description: values.description,
          justification: values.justification,
          assigned_to: values.assignee || null,
          target_on: values.targetOn || null,
        },
      });
      if (!result.success) {
        setMessage(
          result.code === "VERSION_CONFLICT"
            ? `${result.error} Close and reopen this form to load the current version.`
            : result.error,
        );
        return;
      }
      router.refresh();
      onSaved();
    } catch {
      setMessage("The correction could not be saved. Try again.");
    }
  }
  return (
    <form onSubmit={form.handleSubmit(save)} className="space-y-4">
      <label className="block text-sm">
        Work scope
        <textarea
          className="mt-1 w-full rounded-md border bg-background p-2"
          rows={3}
          {...form.register("description")}
        />
      </label>
      <label className="block text-sm">
        Justification
        <textarea
          className="mt-1 w-full rounded-md border bg-background p-2"
          rows={3}
          {...form.register("justification")}
        />
      </label>
      <label className="block text-sm">
        Executor
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          {...form.register("assignee")}
        >
          <option value="">Not assigned</option>
          {data.record.assignedTo &&
            !data.assignees.some(
              (user) => user.clerkId === data.record.assignedTo,
            ) && (
              <option value={data.record.assignedTo}>
                Current assignee is unavailable — select an active executor
              </option>
            )}
          {data.assignees.map((user) => (
            <option key={user.clerkId} value={user.clerkId}>
              {user.displayName}
            </option>
          ))}
        </select>
      </label>
      <label
        className="block text-sm"
        htmlFor={`work-target-${data.record.id}`}
      >
        Target date
        <Input
          id={`work-target-${data.record.id}`}
          type="date"
          {...form.register("targetOn")}
        />
      </label>
      <label className="block text-sm">
        Reason for correction
        <textarea
          className="mt-1 w-full rounded-md border bg-background p-2"
          rows={2}
          {...form.register("reason")}
        />
      </label>
      {Object.keys(form.formState.errors).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Enter the work scope, justification and correction reason.
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving…" : "Save correction"}
      </Button>
    </form>
  );
}
