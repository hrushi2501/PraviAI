"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EvidenceUploader({
  assetId,
  inspectionId,
  workOrderId,
  onUploaded,
}: {
  assetId: string;
  inspectionId?: string;
  workOrderId?: string;
  onUploaded?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [classification, setClassification] = useState("internal");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const cache = useQueryClient();
  const id = `evidence-upload-${inspectionId ?? workOrderId ?? assetId}`;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file || file.size > 10 * 1024 * 1024 || !file.size)
        throw new Error("Choose a file between 1 byte and 10 MB.");
      const data = new FormData();
      data.set("file", file);
      data.set("assetId", assetId);
      data.set("requestId", requestId);
      data.set("caption", caption);
      data.set("classification", classification);
      if (inspectionId) data.set("inspectionId", inspectionId);
      if (workOrderId) data.set("workOrderId", workOrderId);
      const response = await fetch("/api/evidence/upload", {
        method: "POST",
        body: data,
      });
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !result.success)
        throw new Error(result.error ?? "Evidence upload failed.");
    },
    onSuccess: () => {
      setNotice("Evidence uploaded and attached to this record.");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setCaption("");
      setRequestId(crypto.randomUUID());
      cache.invalidateQueries({ queryKey: ["evidence"] });
      router.refresh();
      onUploaded?.();
    },
  });
  return (
    <form
      className="space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="text-sm font-semibold">Upload supporting evidence</h3>
      <p className="text-xs text-muted-foreground">
        Private JPEG, PNG, WebP or PDF files, up to 10 MB. Uploaded files attach
        to this record after authorization checks.
      </p>
      <label htmlFor={`${id}-file`} className="block text-sm">
        Evidence file
        <Input
          ref={fileInput}
          id={`${id}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          disabled={mutation.isPending}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setRequestId(crypto.randomUUID());
            setNotice("");
            mutation.reset();
          }}
        />
      </label>
      <label htmlFor={`${id}-caption`} className="block text-sm">
        Caption
        <Input
          id={`${id}-caption`}
          value={caption}
          maxLength={2000}
          disabled={mutation.isPending}
          onChange={(e) => {
            setCaption(e.target.value);
            setRequestId(crypto.randomUUID());
          }}
        />
      </label>
      <label className="block text-sm">
        Classification
        <select
          className="mt-1 h-10 w-full rounded-md border bg-card px-3"
          disabled={mutation.isPending}
          value={classification}
          onChange={(e) => {
            setClassification(e.target.value);
            setRequestId(crypto.randomUUID());
          }}
        >
          <option value="internal">Internal</option>
          <option value="restricted">Restricted</option>
        </select>
      </label>
      {notice && <output className="block text-sm">{notice}</output>}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <Button type="submit" disabled={!file || mutation.isPending}>
        {mutation.isPending ? "Uploading…" : "Upload evidence"}
      </Button>
    </form>
  );
}
