import { InvariantViolationError } from "@/server/db/error-mapper";

/**
 * Value Object representing a monetary amount in Indian Paise (bigint).
 * Prevents precision loss and floating-point errors.
 */
export class MoneyPaise {
  public readonly amountPaise: bigint;

  constructor(amountPaise: bigint | string | number) {
    const val = BigInt(amountPaise);
    if (val < BigInt(0)) {
      throw new InvariantViolationError("Monetary amount cannot be negative");
    }
    this.amountPaise = val;
  }

  static fromPaise(paise: bigint | string | number): MoneyPaise {
    return new MoneyPaise(paise);
  }

  static fromRupees(rupees: number): MoneyPaise {
    if (Number.isNaN(rupees) || rupees < 0) {
      throw new InvariantViolationError("Invalid rupee amount");
    }
    const paise = BigInt(Math.round(rupees * 100));
    return new MoneyPaise(paise);
  }

  static zero(): MoneyPaise {
    return new MoneyPaise(BigInt(0));
  }

  toRupees(): number {
    return Number(this.amountPaise) / 100;
  }

  /**
   * Formats the amount in Indian National Rupee currency (e.g. ₹1,50,000.00)
   */
  formatINR(): string {
    const rupees = this.toRupees();
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(rupees);
  }

  add(other: MoneyPaise): MoneyPaise {
    return new MoneyPaise(this.amountPaise + other.amountPaise);
  }

  subtract(other: MoneyPaise): MoneyPaise {
    if (this.amountPaise < other.amountPaise) {
      throw new InvariantViolationError(
        "Resulting money amount cannot be negative",
      );
    }
    return new MoneyPaise(this.amountPaise - other.amountPaise);
  }

  equals(other: MoneyPaise): boolean {
    return this.amountPaise === other.amountPaise;
  }

  isZero(): boolean {
    return this.amountPaise === BigInt(0);
  }
}
