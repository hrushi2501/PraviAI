export class RequestBodyError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

/** Reads streamed bytes under a hard cap; does not trust Content-Length alone. */
export async function readRequestBytes(
  request: Request,
  maxBytes = 65_536,
): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new RequestBodyError(
      "Request body is too large or has an invalid length",
      413,
    );
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError("Request body timed out", 408));
      reader.cancel().catch(() => {});
    }, 5000);
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("Request body exceeds the size limit", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readRequestBody(
  request: Request,
  maxBytes = 65_536,
): Promise<string> {
  const bytes = await readRequestBytes(request, maxBytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestBodyError("Request body must be valid UTF-8", 400);
  }
}
