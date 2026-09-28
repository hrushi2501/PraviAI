import { InvariantViolationError } from "@/server/db/error-mapper";

/**
 * Value Object representing an optimistic concurrency control token.
 */
export class VersionToken {
  public readonly version: number;

  constructor(version: number) {
    if (!Number.isInteger(version) || version <= 0) {
      throw new InvariantViolationError(
        "Version token must be a positive integer",
      );
    }
    this.version = version;
  }

  next(): VersionToken {
    return new VersionToken(this.version + 1);
  }

  matches(expectedVersion: number): boolean {
    return this.version === expectedVersion;
  }

  toNumber(): number {
    return this.version;
  }

  toString(): string {
    return this.version.toString();
  }
}
