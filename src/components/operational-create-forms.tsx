"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  createInspectionDraftAction,
  proposeRestorationAction,
} from "@/server/actions/operational-create.actions";

type InspectionFields = {
  observedOn: string;
  nextReviewOn: string;
  condition: "good" | "fair" | "poor" | "critical" | "unknown";
  limitations: string;
  components: Record<
    string,
    {
      condition: "good" | "fair" | "poor" | "critical" | "not_assessed";
      notes: string;
    }
  >;
};
const inputClass =
  "mt-1 block w-full rounded-md border bg-background p-2 text-sm";
function useRequestKey() {
  const command = useRef<{ payload: string; key: string } | null>(null);
  const keyFor = (input: unknown) => {
    const payload = JSON.stringify(input);
    if (command.current?.payload !== payload)
      command.current = { payload, key: crypto.randomUUID() };
    return command.current.key;
  };
  return {
    keyFor,
    resetKey: () => {
      command.current = null;
    },
  };
}
export function InspectionDraftForm({
  assetId,
  components,
}: {
  assetId: string;
  components: string[];
}) {
  const router = useRouter();
  const { keyFor, resetKey } = useRequestKey();
  const [message, setMessage] = useState("");
  const form = useForm<InspectionFields>({
    defaultValues: {
      observedOn: "",
      nextReviewOn: "",
      condition: "unknown",
      limitations: "",
      components: Object.fromEntries(
        components.map((key) => [
          key,
          { condition: "not_assessed", notes: "" },
        ]),
      ),
    },
  });
  async function save(values: InspectionFields) {
    setMessage("");
    const data = {
      assetId,
      observedOn: values.observedOn,
      nextReviewOn: values.nextReviewOn || undefined,
      condition: values.condition,
      limitations: values.limitations || undefined,
      observations: values.components,
    };
    try {
      const result = await createInspectionDraftAction({
        ...data,
        requestId: keyFor(data),
      });
      if (!result.success) throw new Error(result.error);

      resetKey();
      form.reset();
      setMessage(
        "Inspection draft saved. Open the inspection queue to upload supporting evidence and submit it for independent review.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Inspection draft could not be saved.",
      );
    }
  }
  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer font-semibold">
        Record an inspection draft
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Use actual observation dates and this asset's published checklist. This
        saves a draft, without changing trusted condition. Submission may
        require evidence; upload actual files from the inspection queue.
      </p>
      <form onSubmit={form.handleSubmit(save)} className="mt-4 space-y-4">
        <label className="block text-sm">
          Observed on
          <input
            type="date"
            className={inputClass}
            {...form.register("observedOn", { required: true })}
          />
        </label>
        <label className="block text-sm">
          Overall observed condition
          <select className={inputClass} {...form.register("condition")}>
            {["unknown", "good", "fair", "poor", "critical"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {components.map((key, index) => (
          <fieldset key={key} className="rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{key}</legend>
            <label className="block text-xs">
              Component finding
              <select
                className={inputClass}
                {...form.register(`components.${key}.condition`)}
              >
                {["not_assessed", "good", "fair", "poor", "critical"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label
              className="mt-3 block text-xs"
              htmlFor={`component-notes-${index}`}
            >
              Defect / limitation notes
              <textarea
                id={`component-notes-${index}`}
                className={inputClass}
                {...form.register(`components.${key}.notes`)}
                rows={2}
              />
            </label>
          </fieldset>
        ))}
        <label className="block text-sm">
          Assessment limitations
          <textarea
            className={inputClass}
            {...form.register("limitations")}
            rows={3}
          />
        </label>
        <label className="block text-sm">
          Next review date (departmental policy)
          <input
            type="date"
            className={inputClass}
            {...form.register("nextReviewOn")}
          />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save inspection draft"}
        </Button>
        {message && <output className="block text-sm">{message}</output>}
      </form>
    </details>
  );
}

type WorkFields = {
  description: string;
  justification: string;
  inspectionId: string;
  complaintId: string;
  targetOn: string;
  assignToSelf: boolean;
};
export function RestorationProposalForm({
  assetId,
  inspections,
  complaints,
}: {
  assetId: string;
  inspections: { id: string; label: string }[];
  complaints: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { keyFor, resetKey } = useRequestKey();
  const [message, setMessage] = useState("");
  const form = useForm<WorkFields>({
    defaultValues: {
      description: "",
      justification: "",
      inspectionId: "",
      complaintId: "",
      targetOn: "",
      assignToSelf: false,
    },
  });
  async function save(values: WorkFields) {
    setMessage("");
    const data = {
      assetId,
      description: values.description,
      justification: values.justification,
      inspectionId: values.inspectionId || undefined,
      complaintId: values.complaintId || undefined,
      targetOn: values.targetOn || undefined,
      assignToSelf: values.assignToSelf,
    };
    try {
      const result = await proposeRestorationAction({
        ...data,
        requestId: keyFor(data),
      });
      if (!result.success) throw new Error(result.error);
      resetKey();
      form.reset();
      setMessage(
        "Restoration proposal saved for independent approval. It remains unpriced until a sourced estimate is recorded.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Restoration proposal could not be saved.",
      );
    }
  }
  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer font-semibold">
        Propose restoration work
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        A proposal requires independent senior approval. It does not change
        condition, availability or sanctioned funding.
      </p>
      <form onSubmit={form.handleSubmit(save)} className="mt-4 space-y-4">
        <label className="block text-sm">
          Work scope
          <textarea
            className={inputClass}
            rows={3}
            {...form.register("description", {
              required: true,
              maxLength: 10000,
            })}
          />
        </label>
        <label className="block text-sm">
          Justification
          <textarea
            className={inputClass}
            rows={3}
            {...form.register("justification", {
              required: true,
              maxLength: 10000,
            })}
          />
        </label>
        <label className="block text-sm">
          Approved source inspection
          <select className={inputClass} {...form.register("inspectionId")}>
            <option value="">No inspection link</option>
            {inspections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Linked complaint
          <select className={inputClass} {...form.register("complaintId")}>
            <option value="">No complaint link</option>
            {complaints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Target completion date
          <input
            type="date"
            className={inputClass}
            {...form.register("targetOn")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("assignToSelf")} />
          Assign execution to me after approval
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Saving…"
            : "Save restoration proposal"}
        </Button>
        {message && <output className="block text-sm">{message}</output>}
      </form>
    </details>
  );
}
