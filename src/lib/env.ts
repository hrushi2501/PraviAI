import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().optional(),
  DATABASE_RUNTIME_URL: z.string().optional(),
  DATABASE_IDENTITY_URL: z.string().optional(),
  ALLOW_LEGACY_DATABASE_URL: z.enum(["true", "false"]).optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  ERROR_REPORTING_URL: z
    .url()
    .refine((value) => value.startsWith("https://"), "HTTPS required")
    .optional(),
  ERROR_REPORTING_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  DIRECT_URL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_EVIDENCE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{0,62}$/)
    .optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.union([z.url(), z.literal("")]).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_TRACING_V2: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().optional(),
  MLFLOW_TRACKING_URI: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default("/app/dashboard"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default("/app/dashboard"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL,
  DATABASE_IDENTITY_URL: process.env.DATABASE_IDENTITY_URL,
  ALLOW_LEGACY_DATABASE_URL: process.env.ALLOW_LEGACY_DATABASE_URL,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
  ERROR_REPORTING_URL: process.env.ERROR_REPORTING_URL || undefined,
  ERROR_REPORTING_TOKEN: process.env.ERROR_REPORTING_TOKEN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  DIRECT_URL: process.env.DIRECT_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_EVIDENCE_BUCKET: process.env.SUPABASE_EVIDENCE_BUCKET,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
  QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  LANGCHAIN_API_KEY: process.env.LANGCHAIN_API_KEY,
  LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2,
  LANGCHAIN_PROJECT: process.env.LANGCHAIN_PROJECT,
  MLFLOW_TRACKING_URI: process.env.MLFLOW_TRACKING_URI,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
};

export function validateEnvironment(input: Record<string, unknown>) {
  const serverParsed = serverSchema.safeParse(input);
  const clientParsed = clientSchema.safeParse(input);
  if (!serverParsed.success || !clientParsed.success) {
    const issues = [
      ...(!serverParsed.success ? serverParsed.error.issues : []),
      ...(!clientParsed.success ? clientParsed.error.issues : []),
    ];
    throw new Error(
      `Invalid environment configuration: ${[...new Set(issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  }
  return { ...serverParsed.data, ...clientParsed.data };
}

/** Runtime readiness checks fail closed without forcing optional integrations during build. */
export function productionConfigurationIssues(
  input: Record<string, string | undefined> = process.env,
): string[] {
  if (input.NODE_ENV !== "production") return [];
  const required = [
    "DATABASE_RUNTIME_URL",
    "DATABASE_IDENTITY_URL",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const missing = required.filter((name) => !input[name]?.trim());
  if (
    input.DATABASE_RUNTIME_URL &&
    input.DATABASE_RUNTIME_URL === input.DATABASE_IDENTITY_URL
  )
    missing.push("DATABASE_POOLS_MUST_BE_SEPARATE");
  for (const name of ["DATABASE_RUNTIME_URL", "DATABASE_IDENTITY_URL"]) {
    if (input[name]) {
      try {
        const url = new URL(input[name]);
        if (!["postgres:", "postgresql:"].includes(url.protocol))
          missing.push(name);
      } catch {
        missing.push(name);
      }
    }
  }
  try {
    if (new URL(input.NEXT_PUBLIC_APP_URL ?? "").protocol !== "https:")
      missing.push("NEXT_PUBLIC_APP_URL");
  } catch {
    missing.push("NEXT_PUBLIC_APP_URL");
  }
  try {
    if (
      input.UPSTASH_REDIS_REST_URL &&
      new URL(input.UPSTASH_REDIS_REST_URL).protocol !== "https:"
    )
      missing.push("UPSTASH_REDIS_REST_URL");
  } catch {
    missing.push("UPSTASH_REDIS_REST_URL");
  }
  if (
    Boolean(input.ERROR_REPORTING_URL) !== Boolean(input.ERROR_REPORTING_TOKEN)
  )
    missing.push("ERROR_REPORTING_CONFIGURATION");
  return [...new Set(missing)];
}

export const env = validateEnvironment(processEnv);
