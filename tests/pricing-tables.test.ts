import { describe, expect, it } from "vitest";
import {
  COST_USD,
  officialTokenFormula,
  OUTPUT_TOKENS,
  POPULAR_SIZES,
  PRICING_SOURCE_DATE,
  tokensToOutputCostUsd,
} from "../src/pricing-tables.js";

/**
 * When OpenAI updates pricing or the calculator formula, update:
 * - src/pricing-tables.ts (QUALITY_BASE / PRICING_SOURCE_DATE)
 * - the golden expectations below
 * - README sourcing date
 */
describe("pricing tables golden values", () => {
  it("locks PRICING_SOURCE_DATE for freshness checks", () => {
    expect(PRICING_SOURCE_DATE).toBe("2026-09-27");
  });

  it("matches OpenAI calculator formula (docs table rounds low/medium/high display)", () => {
    expect(COST_USD["gpt-image-2"].low?.["1024x1024"]).toBeCloseTo(0.00588, 5);
    expect(COST_USD["gpt-image-2"].medium?.["1024x1024"]).toBeCloseTo(0.05268, 5);
    expect(COST_USD["gpt-image-2"].high?.["1024x1024"]).toBeCloseTo(0.21072, 5);
  });

  it("locks gpt-image-2.5 flare family tokens at 1024x1024", () => {
    const t = OUTPUT_TOKENS["gpt-image-2.5"];
    expect(t.low?.["1024x1024"]).toBe(196);
    expect(t.medium?.["1024x1024"]).toBe(439);
    expect(t.high?.["1024x1024"]).toBe(1756);
    expect(t.xhigh?.["1024x1024"]).toBe(3122);
    expect(t.max?.["1024x1024"]).toBe(7024);
    expect(tokensToOutputCostUsd(1756)).toBeCloseTo(0.05268, 8);
    expect(tokensToOutputCostUsd(7024)).toBeCloseTo(0.21072, 8);
  });

  it("table equals official formula for every popular size and tier", () => {
    for (const family of ["gpt-image-2", "gpt-image-2.5"] as const) {
      const tierMap = OUTPUT_TOKENS[family];
      for (const [quality, bySize] of Object.entries(tierMap)) {
        if (!bySize) continue;
        for (const size of POPULAR_SIZES) {
          const [w, h] = size.split("x").map(Number);
          const fromFormula = officialTokenFormula(
            family,
            w,
            h,
            quality as keyof typeof bySize,
          );
          expect(bySize[size]).toBe(fromFormula);
          expect(COST_USD[family][quality as keyof typeof bySize]?.[size]).toBe(
            tokensToOutputCostUsd(fromFormula),
          );
        }
      }
    }
  });
});
