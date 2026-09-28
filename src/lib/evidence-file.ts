import { createHash } from "node:crypto";
import { DomainError } from "@/server/db/error-mapper";

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function inspectEvidenceFile(
  name: string,
  mime: string,
  bytes: Uint8Array,
) {
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES)
    throw new DomainError(
      "Evidence must be between 1 byte and 10 MB.",
      "INVALID_FILE",
      413,
    );
  const extension = name.split(".").pop()?.toLowerCase();
  const ascii = (offset: number, text: string) =>
    text
      .split("")
      .every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const formats = {
    "image/jpeg": {
      extensions: ["jpg", "jpeg"],
      valid: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      suffix: "jpg",
    },
    "image/png": {
      extensions: ["png"],
      valid: [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
      suffix: "png",
    },
    "image/webp": {
      extensions: ["webp"],
      valid: ascii(0, "RIFF") && ascii(8, "WEBP"),
      suffix: "webp",
    },
    "application/pdf": {
      extensions: ["pdf"],
      valid: ascii(0, "%PDF-"),
      suffix: "pdf",
    },
  };
  const format = formats[mime as keyof typeof formats];
  if (!format || !format.valid || !format.extensions.includes(extension ?? ""))
    throw new DomainError(
      "Use a JPEG, PNG, WebP or PDF with matching file type and extension.",
      "INVALID_FILE",
      422,
    );
  if (
    !name.trim() ||
    name.length > 255 ||
    name.includes("/") ||
    name.includes("\\") ||
    Array.from(name).some((ch) => ch.charCodeAt(0) < 32)
  )
    throw new DomainError(
      "Use a valid file name without path characters.",
      "INVALID_FILE",
      422,
    );
  return {
    originalName: name,
    mimeType: mime,
    sizeBytes: bytes.length,
    suffix: format.suffix,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function evidenceObjectKey(
  departmentId: string,
  actorId: string,
  assetId: string,
  parentId: string,
  requestId: string,
  hash: string,
  suffix: string,
): string {
  const actor = createHash("sha256").update(actorId).digest("hex").slice(0, 24);
  return `${departmentId}/${actor}/${assetId}/${parentId}/${requestId}/${hash}.${suffix}`;
}
