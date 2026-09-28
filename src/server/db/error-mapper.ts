export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR",
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Access denied: insufficient permissions") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class OptimisticLockError extends DomainError {
  constructor(
    message = "Version conflict: resource was modified concurrently",
  ) {
    super(message, "VERSION_CONFLICT", 409);
    this.name = "OptimisticLockError";
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Unique constraint violation or duplicate candidate") {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message = "Database business constraint violation") {
    super(message, "INVARIANT_VIOLATION", 422);
    this.name = "InvariantViolationError";
  }
}

/**
 * Translates PostgreSQL error codes into typed TypeScript domain exceptions.
 */
export function translateDatabaseError(error: unknown): Error {
  if (error instanceof DomainError) {
    return error;
  }

  const record =
    error !== null && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const message =
    typeof record.message === "string"
      ? record.message
      : "Database operation failed";

  switch (code) {
    case "42501":
      return new ForbiddenError(message);
    case "40001":
      return new OptimisticLockError(message);
    case "P0002":
      return new NotFoundError(message);
    case "23505":
      return new ConflictError();
    case "23514":
      return new InvariantViolationError(
        "Values do not satisfy required validation rules",
      );
    case "P0001":
      return new InvariantViolationError(message);
    case "23503":
      return new InvariantViolationError(
        "A referenced record is unavailable or inaccessible",
      );
    case "23502":
    case "22P02":
      return new InvariantViolationError(
        "A required value is missing or has an invalid type",
      );
    default:
      return error instanceof Error ? error : new Error(String(error));
  }
}
