export function releaseIdentity(): string {
  const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_RELEASE;
  return release && /^[a-z0-9._-]{1,80}$/i.test(release) ? release : "local";
}

export async function boundedProbe(
  operation: () => Promise<unknown>,
  timeoutMs = 2000,
): Promise<"ok" | "unavailable"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Probe timed out")),
          timeoutMs,
        );
      }),
    ]);
    return "ok";
  } catch {
    return "unavailable";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
