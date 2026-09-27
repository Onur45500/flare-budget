import { describe, expect, it } from "vitest";
import { buildMonthlyResult, DAYS_PER_MONTH_AVG } from "../src/monthly.js";
import { InputError } from "../src/errors.js";

describe("monthly", () => {
  it("uses 30.44 days per month by default", () => {
    expect(DAYS_PER_MONTH_AVG).toBeCloseTo(30.4375, 4);
    const r = buildMonthlyResult({
      model: "flare",
      size: "1024x1024",
      quality: "high",
      imagesPerDay: 10,
    });
    const row = r.rows[0];
    expect(row.monthlyUsd).toBeCloseTo(row.dailyUsd * DAYS_PER_MONTH_AVG, 6);
    expect(row.weeklyUsd).toBeCloseTo(row.dailyUsd * 7, 6);
  });

  it("honors --days override", () => {
    const r = buildMonthlyResult({
      model: "flare",
      size: "1024x1024",
      compareQualities: "low,high",
      imagesPerDay: 100,
      days: 30,
    });
    expect(r.daysPerMonth).toBe(30);
    expect(r.rows[1].monthlyUsd).toBeCloseTo(r.rows[1].dailyUsd * 30, 6);
  });

  it("derives images per day from images per month", () => {
    const r = buildMonthlyResult({
      model: "flare",
      size: "1024x1024",
      quality: "low",
      imagesPerMonth: 304.4,
      days: 30.44,
    });
    expect(r.imagesPerDay).toBeCloseTo(10, 6);
  });

  it("rejects both volume flags", () => {
    expect(() =>
      buildMonthlyResult({
        model: "flare",
        size: "1024x1024",
        quality: "low",
        imagesPerDay: 1,
        imagesPerMonth: 30,
      }),
    ).toThrow(InputError);
  });

  it("renders markdown table with pipes", () => {
    const r = buildMonthlyResult({
      model: "flare",
      size: "1024x1024",
      imagesPerDay: 500,
      compareQualities: "low,high,max",
      markdown: true,
    });
    expect(r.tableText).toMatch(/^\| Quality \|/m);
    expect(r.tableText).toMatch(/\| low \|/);
    expect(r.tableText).toMatch(/\| max \|/);
  });
});
