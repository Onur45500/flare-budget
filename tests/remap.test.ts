import { describe, expect, it } from "vitest";
import { migrate } from "../src/remap.js";

describe("migrate", () => {
  it("warns on silent trap for gpt-image-2 high → 2.5", () => {
    const r = migrate({
      from: "gpt-image-2",
      quality: "high",
      size: "1024x1024",
      to: "flare",
    });
    expect(r.silentTrap).toBe(true);
    expect(r.recommendedQuality).toBe("max");
    expect(r.oldCostUsd).toBeCloseTo(0.21072, 5);
    expect(r.naiveNewCostUsd).toBeCloseTo(0.05268, 5);
    const warning = r.lines.find((l) => l.kind === "warning");
    expect(warning?.text).toMatch(/set quality: "max"/);
  });

  it("maps gpt-image-2 medium to 2.5 high by cost", () => {
    const r = migrate({
      from: "gpt-image-2",
      quality: "medium",
      size: "1024x1024",
    });
    expect(r.recommendedQuality).toBe("high");
  });

  it("does not set silent trap for low (unchanged cost tier)", () => {
    const r = migrate({
      from: "gpt-image-2",
      quality: "low",
      size: "1024x1024",
    });
    expect(r.silentTrap).toBe(false);
    expect(r.recommendedQuality).toBe("low");
  });

  it("reverse direction from 2.5 has no trap flag semantics", () => {
    const r = migrate({
      from: "gpt-image-2.5-flare",
      quality: "max",
      size: "1024x1024",
      to: "gpt-image-2",
    });
    expect(r.isLegacyTo25).toBe(false);
    expect(r.recommendedQuality).toBe("high");
    expect(r.lines.some((l) => l.kind === "warning")).toBe(false);
  });
});
