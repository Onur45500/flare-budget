import { estimate, parseQualityForFamily, resolveModel } from "./estimate.js";
import { InputError } from "./errors.js";
import {
  PRICING_SOURCE_DATE,
  PRICING_SOURCE_URL,
  listQualitiesForFamily,
  type Quality,
} from "./pricing-tables.js";

export const DAYS_PER_MONTH_AVG = 365.25 / 12;

export interface MonthlyOptions {
  model: string;
  size: string;
  quality?: string;
  imagesPerDay?: number;
  imagesPerMonth?: number;
  days?: number;
  compareQualities?: string;
  markdown?: boolean;
}

export interface MonthlyRow {
  quality: string;
  costPerImageUsd: number;
  dailyUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
  deltaVsFirstUsd: number | null;
}

export interface MonthlyResult {
  model: string;
  size: string;
  imagesPerDay: number;
  daysPerMonth: number;
  rows: MonthlyRow[];
  footer: string;
  tableText: string;
}

function parseCompareQualities(
  family: ReturnType<typeof resolveModel>["family"],
  raw: string | undefined,
  fallbackQuality: string | undefined,
): Exclude<Quality, "auto">[] {
  if (raw) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw new InputError("--compare-qualities must list at least one quality.");
    }
    return parts.map((q) => parseQualityForFamily(family, q));
  }
  if (!fallbackQuality) {
    throw new InputError("Provide --quality or --compare-qualities.");
  }
  return [parseQualityForFamily(family, fallbackQuality)];
}

function resolveImagesPerDay(options: MonthlyOptions): number {
  if (options.imagesPerDay !== undefined && options.imagesPerMonth !== undefined) {
    throw new InputError("Use either --images-per-day or --images-per-month, not both.");
  }
  const days = options.days ?? DAYS_PER_MONTH_AVG;
  if (options.imagesPerDay !== undefined) {
    if (options.imagesPerDay <= 0) {
      throw new InputError("--images-per-day must be positive.");
    }
    return options.imagesPerDay;
  }
  if (options.imagesPerMonth !== undefined) {
    if (options.imagesPerMonth <= 0) {
      throw new InputError("--images-per-month must be positive.");
    }
    return options.imagesPerMonth / days;
  }
  throw new InputError("Provide --images-per-day or --images-per-month.");
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function renderAsciiTable(
  headers: string[],
  rows: string[][],
  footer: string,
): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const pad = (s: string, i: number) => s.padStart(widths[i]);
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers.map((h, i) => pad(h, i)).join(" | ");
  const body = rows.map((r) => r.map((c, i) => pad(c, i)).join(" | ")).join("\n");
  return `${headerLine}\n${sep}\n${body}\n\n${footer}`;
}

function renderMarkdownTable(
  headers: string[],
  rows: string[][],
  footer: string,
): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${headerLine}\n${sep}\n${body}\n\n${footer}`;
}

export function buildMonthlyResult(options: MonthlyOptions): MonthlyResult {
  const modelMeta = resolveModel(options.model);
  const daysPerMonth = options.days ?? DAYS_PER_MONTH_AVG;
  if (daysPerMonth <= 0) {
    throw new InputError("--days must be positive.");
  }
  const imagesPerDay = resolveImagesPerDay({ ...options, days: daysPerMonth });
  const qualities = parseCompareQualities(
    modelMeta.family,
    options.compareQualities,
    options.quality,
  );

  const validAll = listQualitiesForFamily(modelMeta.family);
  for (const q of qualities) {
    if (!validAll.includes(q)) {
      throw new InputError(`Invalid quality in comparison: ${q}`);
    }
  }

  const rows: MonthlyRow[] = [];
  let firstMonthly: number | null = null;

  for (const quality of qualities) {
    const est = estimate({
      model: options.model,
      quality,
      size: options.size,
      count: 1,
    });
    const dailyUsd = est.costPerImageUsd * imagesPerDay;
    const weeklyUsd = dailyUsd * 7;
    const monthlyUsd = dailyUsd * daysPerMonth;
    if (firstMonthly === null) firstMonthly = monthlyUsd;
    rows.push({
      quality,
      costPerImageUsd: est.costPerImageUsd,
      dailyUsd,
      weeklyUsd,
      monthlyUsd,
      deltaVsFirstUsd:
        firstMonthly === null || rows.length === 0
          ? null
          : monthlyUsd - firstMonthly,
    });
  }

  // Fix delta: first row should be 0
  if (rows.length > 0) {
    const base = rows[0].monthlyUsd;
    for (const row of rows) {
      row.deltaVsFirstUsd = row.monthlyUsd - base;
    }
  }

  const footer =
    `Monthly uses ${daysPerMonth} days/month (365.25/12). Override with --days. ` +
    `Output tokens only. Source: ${PRICING_SOURCE_URL} (${PRICING_SOURCE_DATE}).`;

  const headers = [
    "Quality",
    "$/image",
    "Daily",
    "Weekly",
    "Monthly",
    "Δ vs first",
  ];
  const tableRows = rows.map((r) => [
    r.quality,
    formatMoney(r.costPerImageUsd),
    formatMoney(r.dailyUsd),
    formatMoney(r.weeklyUsd),
    formatMoney(r.monthlyUsd),
    r.deltaVsFirstUsd === null ? "—" : formatMoney(r.deltaVsFirstUsd),
  ]);

  const tableText = options.markdown
    ? renderMarkdownTable(headers, tableRows, footer)
    : renderAsciiTable(headers, tableRows, footer);

  return {
    model: modelMeta.id,
    size: rows[0] ? estimate({ model: options.model, quality: qualities[0], size: options.size }).size : options.size,
    imagesPerDay,
    daysPerMonth,
    rows,
    footer,
    tableText,
  };
}
