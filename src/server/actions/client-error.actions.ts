"use server";
import { z } from "zod";
import { logEvent } from "@/lib/logger";
import { withAuthenticatedAction } from "./action-client";

export async function reportClientErrorAction(input: {
  digest?: string;
  errorType: string;
}) {
  return withAuthenticatedAction(async () => {
    const details = z
      .strictObject({
        digest: z
          .string()
          .regex(/^[a-z\d_-]{1,100}$/i)
          .optional(),
        errorType: z.string().regex(/^[a-z\d_$]{1,80}$/i),
      })
      .parse(input);
    logEvent("error", "workspace_client_error", details);
    return { recorded: true };
  });
}
