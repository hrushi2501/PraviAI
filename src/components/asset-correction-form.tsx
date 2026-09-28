"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseCoordinateInput } from "@/lib/coordinate-input";
import { editAssetAction } from "@/server/actions/asset.actions";

type Fields = {
  name: string;
  source: string;
  attributes: string;
  reason: string;
};
export function AssetCorrectionForm({
  id,
  version,
  name,
  source,
  attributes,
}: {
  id: string;
  version: number;
  name: string;
  source: string | null;
  attributes: Record<string, unknown>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const form = useForm<Fields>({
    defaultValues: {
      name,
      source: source ?? "",
      attributes: JSON.stringify(attributes, null, 2),
      reason: "",
    },
  });
  async function save(values: Fields) {
    setMessage("");
    try {
      const parsed: unknown = JSON.parse(values.attributes);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error(
          "Attributes must be a JSON object using the published definition's field keys.",
        );
      const result = await editAssetAction({
        assetId: id,
        expectedVersion: version,
        patch: {
          name: values.name.trim(),
          source_reference: values.source.trim() || null,
          attributes: parsed,
        },
        reason: values.reason.trim(),
      });
      if (!result.success) throw new Error(result.error);
      setMessage("Corrections saved. You can submit this record for review.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Corrections could not be saved.",
      );
    }
  }
  return (
    <details className="rounded-lg border bg-white p-5">
      <summary className="cursor-pointer font-semibold">
        Edit draft / returned registration
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Correct the record using its published definition. Supplied attribute
        types and the expected record version are checked on the server.
      </p>
      <form onSubmit={form.handleSubmit(save)} className="mt-4 space-y-4">
        <label htmlFor="correction-name" className="block text-sm">
          Name
          <Input
            id="correction-name"
            {...form.register("name", { required: true, maxLength: 240 })}
          />
        </label>
        <label htmlFor="correction-source" className="block text-sm">
          Documentary source
          <Input id="correction-source" {...form.register("source")} />
        </label>
        <label className="block text-sm">
          Definition attributes (JSON)
          <textarea
            {...form.register("attributes", { required: true })}
            className="mt-1 w-full rounded-md border p-3 font-mono text-xs"
            rows={7}
          />
        </label>
        <label htmlFor="correction-reason" className="block text-sm">
          Correction reason
          <Input
            id="correction-reason"
            {...form.register("reason", { required: true, minLength: 1 })}
          />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save corrections"}
        </Button>
        {message && <output className="block text-sm">{message}</output>}
      </form>
    </details>
  );
}

export function AssetCoordinateForm({
  id,
  version,
  latitude,
  longitude,
  verified,
}: {
  id: string;
  version: number;
  latitude: string | null;
  longitude: string | null;
  verified: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const form = useForm<{ latitude: string; longitude: string; reason: string }>(
    {
      defaultValues: {
        latitude: latitude ?? "",
        longitude: longitude ?? "",
        reason: "",
      },
    },
  );
  async function save(values: {
    latitude: string;
    longitude: string;
    reason: string;
  }) {
    try {
      const coordinates = parseCoordinateInput(
        values.latitude,
        values.longitude,
      );
      const result = await editAssetAction({
        assetId: id,
        expectedVersion: version,
        patch: {
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
        },
        reason: values.reason.trim(),
      });
      if (!result.success) throw new Error(result.error);
      setMessage(
        verified
          ? "Coordinate correction saved. Registration now requires independent verification again."
          : "Coordinates saved. The map will use the recorded location.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Coordinates could not be saved.",
      );
    }
  }
  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer font-semibold">
        Correct map coordinates
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter both documented decimal coordinates or leave both unknown.{" "}
        {verified &&
          "A verified master-record correction returns registration to independent review."}
      </p>
      <form className="mt-4 space-y-4" onSubmit={form.handleSubmit(save)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="correct-latitude" className="text-sm">
            Latitude
            <Input
              id="correct-latitude"
              type="number"
              step="any"
              min={6}
              max={38}
              {...form.register("latitude")}
            />
          </label>
          <label htmlFor="correct-longitude" className="text-sm">
            Longitude
            <Input
              id="correct-longitude"
              type="number"
              step="any"
              min={68}
              max={98}
              {...form.register("longitude")}
            />
          </label>
        </div>
        <label htmlFor="coordinate-reason" className="block text-sm">
          Source and correction reason
          <Input
            id="coordinate-reason"
            required
            {...form.register("reason", {
              required: true,
              validate: (value) => Boolean(value.trim()),
            })}
          />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save coordinates"}
        </Button>
        {message && <output className="block text-sm">{message}</output>}
      </form>
    </details>
  );
}
