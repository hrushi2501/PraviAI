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
  editInspectionAction,
  getInspectionCorrectionAction,
} from "@/server/actions/inspection.actions";

const conditionSchema = z.enum(["good", "fair", "poor", "critical", "unknown"]);
const schema = z.object({
  observedOn: z.iso.date(),
  nextReviewOn: z.union([z.iso.date(), z.literal("")]),
  condition: conditionSchema,
  limitations: z.string().max(10000),
  observations: z.record(
    z.string(),
    z.object({
      condition: z.enum(["good", "fair", "poor", "critical", "not_assessed"]),
      notes: z.string().max(10000).optional(),
    }),
  ),
  reason: z.string().trim().min(1, "Explain the correction").max(4000),
});
type Fields = z.infer<typeof schema>;
type Data = NonNullable<
  Extract<
    Awaited<ReturnType<typeof getInspectionCorrectionAction>>,
    { success: true }
  >["data"]
>;

export function InspectionCorrectionForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setOpen(true);
    setData(null);
    setError("");
    try {
      const result = await getInspectionCorrectionAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (!result.data) {
        setError("Inspection is unavailable in your current scope.");
        return;
      }
      setData(result.data);
    } catch {
      setError("Inspection could not be loaded. Try again.");
    }
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={load}>
        Correct inspection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Correct inspection</DialogTitle>
            <DialogDescription>
              Edit the original observations and dates. Approval remains a
              separate review step.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : data ? (
            <InspectionEditor
              key={data.record.version}
              data={data}
              onSaved={() => setOpen(false)}
            />
          ) : (
            <output className="text-sm text-muted-foreground">
              Loading current inspection…
            </output>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function InspectionEditor({
  data,
  onSaved,
}: {
  data: Data;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      observedOn: data.record.observedOn,
      nextReviewOn: data.record.nextReviewOn ?? "",
      condition: conditionSchema.parse(data.record.condition),
      limitations: data.record.limitations ?? "",
      observations: schema.shape.observations.parse(
        Object.fromEntries(
          data.components.map((component) => [
            component,
            data.record.observations[component] ?? {
              condition: "not_assessed",
              notes: "",
            },
          ]),
        ),
      ),
      reason: "",
    },
  });
  async function save(values: Fields) {
    setMessage("");
    try {
      const result = await editInspectionAction({
        id: data.record.id,
        expectedVersion: data.record.version,
        reason: values.reason,
        patch: {
          observed_on: values.observedOn,
          next_review_on: values.nextReviewOn || null,
          condition: values.condition,
          limitations: values.limitations.trim() || null,
          observations: values.observations,
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className="text-sm"
          htmlFor={`inspection-observed-${data.record.id}`}
        >
          Observed on
          <Input
            id={`inspection-observed-${data.record.id}`}
            type="date"
            {...form.register("observedOn")}
          />
        </label>
        <label
          className="text-sm"
          htmlFor={`inspection-review-${data.record.id}`}
        >
          Next review on
          <Input
            id={`inspection-review-${data.record.id}`}
            type="date"
            {...form.register("nextReviewOn")}
          />
        </label>
      </div>
      <label className="block text-sm">
        Overall condition
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          {...form.register("condition")}
        >
          {["unknown", "good", "fair", "poor", "critical"].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Published inspection components
        </legend>
        {!data.components.length && (
          <p className="text-sm text-destructive">
            The pinned inspection definition is unavailable. A correction cannot
            be saved.
          </p>
        )}
        {data.components.map((component) => (
          <div key={component} className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              {component.replaceAll("_", " ")} condition
              <select
                className="mt-1 w-full rounded-md border bg-background p-2"
                {...form.register(`observations.${component}.condition`)}
              >
                {["not_assessed", "good", "fair", "poor", "critical"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label
              className="text-sm"
              htmlFor={`inspection-notes-${data.record.id}-${component}`}
            >
              Observation notes
              <Input
                id={`inspection-notes-${data.record.id}-${component}`}
                {...form.register(`observations.${component}.notes`)}
              />
            </label>
          </div>
        ))}
      </fieldset>
      <label className="block text-sm">
        Assessment limitations
        <textarea
          className="mt-1 w-full rounded-md border bg-background p-2"
          rows={3}
          {...form.register("limitations")}
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
          Enter valid assessment dates and a correction reason.
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button
        type="submit"
        disabled={form.formState.isSubmitting || !data.components.length}
      >
        {form.formState.isSubmitting ? "Saving…" : "Save correction"}
      </Button>
    </form>
  );
}
