import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "@/lib/currency-input";

describe("exact financial input", () => {
  it("preserves paise without floating-point rounding", () => {
    expect(rupeesToPaise("0.29")).toBe("29");
    expect(rupeesToPaise("1200.5")).toBe("120050");
    expect(rupeesToPaise("90071992547409.91")).toBe("9007199254740991");
  });
  it("rejects precision loss, scientific notation and negative amounts", () => {
    for (const value of ["1.005", "1e4", "-1", "NaN", "", "01"])
      expect(() => rupeesToPaise(value)).toThrow();
  });
});
