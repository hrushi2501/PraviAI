export type DatabasePurpose = "runtime" | "identity";
export interface DatabaseConnectionEnvironment {
  NODE_ENV?: string;
  DATABASE_RUNTIME_URL?: string;
  DATABASE_IDENTITY_URL?: string;
  DATABASE_URL?: string;
  ALLOW_LEGACY_DATABASE_URL?: string;
}

export function resolveDatabaseConnection(
  purpose: DatabasePurpose,
  environment: DatabaseConnectionEnvironment,
) {
  const connectionString =
    purpose === "runtime"
      ? environment.DATABASE_RUNTIME_URL
      : environment.DATABASE_IDENTITY_URL;
  if (environment.NODE_ENV === "production") {
    if (!environment.DATABASE_RUNTIME_URL || !environment.DATABASE_IDENTITY_URL)
      throw new Error(
        "Production requires dedicated DATABASE_RUNTIME_URL and DATABASE_IDENTITY_URL credentials",
      );
    if (environment.DATABASE_RUNTIME_URL === environment.DATABASE_IDENTITY_URL)
      throw new Error(
        "Production runtime and identity database credentials must be separate",
      );
    const username = decodeURIComponent(
      new URL(connectionString as string).username,
    );
    if (username === "postgres" || username.startsWith("postgres."))
      throw new Error(
        "Production database pools must use dedicated least-privilege login roles",
      );
  }
  if (connectionString) return { connectionString, legacyDevelopment: false };
  if (
    environment.NODE_ENV !== "production" &&
    environment.ALLOW_LEGACY_DATABASE_URL === "true" &&
    environment.DATABASE_URL
  )
    return {
      connectionString: environment.DATABASE_URL,
      legacyDevelopment: true,
    };
  throw new Error(
    `Missing ${purpose === "runtime" ? "DATABASE_RUNTIME_URL" : "DATABASE_IDENTITY_URL"}; legacy DATABASE_URL is development-only and requires explicit opt-in`,
  );
}
