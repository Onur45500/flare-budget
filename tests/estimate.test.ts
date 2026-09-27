import { describe, expect, it } from "vitest";
import { estimate } from "../src/estimate.js";
import { InputError } from "../src/errors.js";

describe("estimate", () => {
  it("multiplies per-image cost by count", () => {
    const r = estimate({
      model: "flare",
      quality: "high",
      size: "1024x1024",
      count: 1000,
    });
    expect(r.costPerImageUsd * r.count).toBeCloseTo(r.totalCostUsd, 10);
    expect(r.totalCostUsd).toBeCloseTo(52.68, 2);
  });

  it("uses official formula for valid custom sizes", () => {
    const r = estimate({
      model: "sunburst",
      quality: "medium",
      size: "1536x864",
      count: 1,
    });
    expect(r.source).toBe("official-formula");
    expect(r.outputTokensPerImage).toBeGreaterThan(0);
  });

  it("rejects auto quality", () => {
    expect(() =>
      estimate({ model: "flare", quality: "auto", size: "1024x1024" }),
    ).toThrow(InputError);
  });

  it("rejects unknown model with valid options listed", () => {
    expect(() =>
      estimate({ model: "gpt-4", quality: "high", size: "1024x1024" }),
    ).toThrow(/Valid models/);
  });

  it("rejects invalid size not in table and failing rules", () => {
    expect(() =>
      estimate({ model: "flare", quality: "high", size: "1000x1000" }),
    ).toThrow(/divisible by 16/);
  });
});
