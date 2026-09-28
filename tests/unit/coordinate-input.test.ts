import { describe, expect, it } from "vitest";
import { parseCoordinateInput } from "@/lib/coordinate-input";

describe("Coordinate form data integrity", () => {
  it("keeps unknown location unknown and rejects a partial pair", () => {
    expect(parseCoordinateInput("", " ")).toBeNull();
    expect(() => parseCoordinateInput("23.02", "")).toThrow("both");
    expect(() => parseCoordinateInput("", "72.57")).toThrow("both");
  });
  it("preserves documented decimal coordinates and accepts territorial boundaries", () => {
    expect(parseCoordinateInput("23.022505", "72.571362")).toEqual({
      latitude: 23.022505,
      longitude: 72.571362,
    });
    expect(parseCoordinateInput("6", "68")).toEqual({
      latitude: 6,
      longitude: 68,
    });
  });
  it("rejects nonfinite input and out-of-bound coordinates without inventing a location", () => {
    for (const [lat, lng] of [
      ["Infinity", "72"],
      ["23", "NaN"],
      ["5.9", "72"],
      ["23", "98.1"],
    ])
      expect(() => parseCoordinateInput(lat, lng)).toThrow();
  });
});
