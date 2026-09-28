import { expect, it } from "vitest";
import {
  ConflictError,
  DomainError,
  InvariantViolationError,
  translateDatabaseError,
} from "@/server/db/error-mapper";

it("hides native unique-constraint values and preserves explicit domain validation", () => {
  const collision = translateDatabaseError({
    code: "23505",
    message: "duplicate email private@example.com in secret_table",
    detail: "private row",
  });
  expect(collision).toBeInstanceOf(ConflictError);
  expect(collision.message).not.toContain("private");
  const invalid = translateDatabaseError({
    code: "P0001",
    message: "Canonical region required",
  });
  expect(invalid).toBeInstanceOf(InvariantViolationError);
  expect(invalid.message).toBe("Canonical region required");
});
it("narrows malformed failures safely and retains domain errors", () => {
  const known = new DomainError("Service unavailable", "NOT_IMPLEMENTED", 501);
  expect(translateDatabaseError(known)).toBe(known);
  expect(translateDatabaseError(null)).toBeInstanceOf(Error);
  expect(translateDatabaseError("failure").message).toBe("failure");
  expect(
    translateDatabaseError({ code: "22P02", message: "private input" }),
  ).toBeInstanceOf(InvariantViolationError);
});
