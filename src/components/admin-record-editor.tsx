"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  editDepartmentAction,
  editRegionAction,
} from "@/server/actions/admin.actions";

export function AdminRecordEditor({
  kind,
  id,
  name,
  active,
  version,
}: {
  kind: "department" | "region";
  id: string;
  name: string;
  active: boolean;
  version?: number;
}) {
  const form = useForm({ defaultValues: { name, active, reason: "" } });
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const router = useRouter();
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        Edit name or status
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          setMessage("");
          try {
            const result =
              kind === "department"
                ? await editDepartmentAction({
                    id,
                    expectedVersion: version as number,
                    ...values,
                  })
                : await editRegionAction({ id, ...values });
            if (!result.success) throw new Error(result.error);
            setMessage("Saved.");
            await client.invalidateQueries({ queryKey: ["authority-setup"] });
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Could not save.",
            );
          }
        })}
      >
        <label htmlFor={`record-field-1-${id}`} className="block text-xs">
          Name
          <Input
            id={`record-field-1-${id}`}
            {...form.register("name", { required: true, maxLength: 200 })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" {...form.register("active")} />
          Active
        </label>
        <label htmlFor={`record-field-2-${id}`} className="block text-xs">
          Reason
          <Input
            id={`record-field-2-${id}`}
            {...form.register("reason", { required: true, maxLength: 2000 })}
          />
        </label>
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          Save changes
        </Button>
        {message && <output className="text-xs">{message}</output>}
      </form>
    </details>
  );
}
