import { estimate, getCostFromTable, resolveModel } from "./estimate.js";
import { InputError } from "./errors.js";
import {
  type CostFamily,
  type ModelId,
  type PopularSize,
  POPULAR_SIZES,
  listQualitiesForFamily,
  isPopularSize,
  parseSizeString,
  formatSize,
} from "./pricing-tables.js";
import type { Quality, QualityGptImage25 } from "./pricing-tables.js";

export interface MigrateOptions {
  from: string;
  quality: string;
  size?: string;
  to?: string;
}

export interface MigrateLine {
  kind: "info" | "warning" | "recommendation";
  text: string;
}

export interface MigrateResult {
  fromModel: ModelId;
  toModel: ModelId;
  fromFamily: CostFamily;
  toFamily: CostFamily;
  size: PopularSize;
  fromQuality: Exclude<Quality, "auto">;
  naiveQuality: Exclude<Quality, "auto">;
  recommendedQuality: Exclude<Quality, "auto">;
  oldCostUsd: number;
  naiveNewCostUsd: number;
  recommendedCostUsd: number;
  silentTrap: boolean;
  lines: MigrateLine[];
  isLegacyTo25: boolean;
}

function parsePopularSize(sizeRaw: string | undefined): PopularSize {
  const size = (sizeRaw ?? "1024x1024").trim();
  if (!isPopularSize(size)) {
    throw new InputError(
      `migrate requires a popular embedded-table size for tier comparison. Valid: ${POPULAR_SIZES.join(", ")}.`,
    );
  }
  return size;
}

function findNearestQualityByCost(
  targetFamily: CostFamily,
  targetCost: number,
  size: PopularSize,
): Exclude<Quality, "auto"> {
  const qualities = listQualitiesForFamily(targetFamily);
  let best = qualities[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const q of qualities) {
    const cost = getCostFromTable(targetFamily, q, size);
    const delta = Math.abs(Math.log(cost / targetCost));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = q;
    }
  }
  return best;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(5)}`;
}

function pctChange(from: number, to: number): string {
  const pct = ((to - from) / from) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

export function migrate(options: MigrateOptions): MigrateResult {
  const fromMeta = resolveModel(options.from);
  const toMeta = resolveModel(options.to ?? "flare");
  const size = parsePopularSize(options.size);

  const fromQualityRaw = options.quality.trim().toLowerCase();
  if (fromQualityRaw === "auto") {
    throw new InputError('Quality "auto" cannot be used for migration comparisons.');
  }

  const fromQualities = listQualitiesForFamily(fromMeta.family);
  if (!fromQualities.includes(fromQualityRaw as Exclude<Quality, "auto">)) {
    throw new InputError(
      `Unknown quality "${options.quality}" for ${fromMeta.id}. Valid: ${fromQualities.join(", ")}.`,
    );
  }
  const fromQuality = fromQualityRaw as Exclude<Quality, "auto">;

  const oldCostUsd = getCostFromTable(fromMeta.family, fromQuality, size);
  const isLegacyTo25 =
    fromMeta.family === "gpt-image-2" && toMeta.family === "gpt-image-2.5";

  const recommendedQuality = findNearestQualityByCost(
    toMeta.family,
    oldCostUsd,
    size,
  );

  let naiveQuality: Exclude<Quality, "auto"> = fromQuality;
  if (toMeta.family === "gpt-image-2.5") {
    const q25 = listQualitiesForFamily("gpt-image-2.5");
    if (!q25.includes(fromQuality as QualityGptImage25)) {
      naiveQuality = "high";
    }
  } else if (fromMeta.family === "gpt-image-2.5") {
    const q2 = listQualitiesForFamily("gpt-image-2");
    if (!q2.includes(fromQuality as Exclude<Quality, "auto">)) {
      naiveQuality = "high";
    }
  }

  const naiveNewCostUsd = getCostFromTable(toMeta.family, naiveQuality, size);
  const recommendedCostUsd = getCostFromTable(
    toMeta.family,
    recommendedQuality,
    size,
  );

  const silentTrap =
    isLegacyTo25 &&
    naiveQuality === fromQuality &&
    Math.abs(naiveNewCostUsd - oldCostUsd) > 1e-9;

  const lines: MigrateLine[] = [];

  lines.push({
    kind: "info",
    text: `Size: ${size} (embedded table; output tokens only)`,
  });

  lines.push({
    kind: "info",
    text: `On ${fromMeta.id}, quality "${fromQuality}" ≈ ${formatUsd(oldCostUsd)} per image.`,
  });

  if (isLegacyTo25) {
    lines.push({
      kind: "info",
      text: `If you keep quality: "${naiveQuality}" on ${toMeta.id}, cost ≈ ${formatUsd(naiveNewCostUsd)} per image (${pctChange(oldCostUsd, naiveNewCostUsd)} vs legacy).`,
    });
    if (silentTrap) {
      lines.push({
        kind: "warning",
        text: `⚠ Keeping quality: "${fromQuality}" after migrating to ${toMeta.id} will cost you ~${formatUsd(naiveNewCostUsd)} (was ~${formatUsd(oldCostUsd)} on ${fromMeta.id}) — set quality: "${recommendedQuality}" to match your old output.`,
      });
    } else if (naiveQuality === fromQuality && Math.abs(naiveNewCostUsd - oldCostUsd) < 1e-9) {
      lines.push({
        kind: "info",
        text: `Keeping quality: "${fromQuality}" preserves approximate cost on ${toMeta.id} (no change needed).`,
      });
    }
    lines.push({
      kind: "recommendation",
      text: `To reproduce ~${formatUsd(oldCostUsd)} output on ${toMeta.id}, use quality: "${recommendedQuality}" (≈ ${formatUsd(recommendedCostUsd)} per image).`,
    });
  } else if (fromMeta.family === "gpt-image-2.5" && toMeta.family === "gpt-image-2") {
    lines.push({
      kind: "info",
      text: `Nearest legacy gpt-image-2 tier for this cost: quality "${recommendedQuality}" (≈ ${formatUsd(recommendedCostUsd)}).`,
    });
    const q2 = listQualitiesForFamily("gpt-image-2");
    if (!q2.includes(fromQuality)) {
      const cheaper = q2.filter(
        (q) => getCostFromTable("gpt-image-2", q, size) <= oldCostUsd,
      );
      const pricier = q2.filter(
        (q) => getCostFromTable("gpt-image-2", q, size) >= oldCostUsd,
      );
      if (cheaper.length > 0 && pricier.length > 0) {
        const below = cheaper[cheaper.length - 1];
        const above = pricier[0];
        lines.push({
          kind: "info",
          text: `No exact legacy tier for "${fromQuality}". Neighbors: "${below}" (${formatUsd(getCostFromTable("gpt-image-2", below, size))}) and "${above}" (${formatUsd(getCostFromTable("gpt-image-2", above, size))}).`,
        });
      }
    }
  } else {
    lines.push({
      kind: "recommendation",
      text: `Equivalent tier on ${toMeta.id}: quality "${recommendedQuality}" (≈ ${formatUsd(recommendedCostUsd)}).`,
    });
  }

  return {
    fromModel: fromMeta.id,
    toModel: toMeta.id,
    fromFamily: fromMeta.family,
    toFamily: toMeta.family,
    size,
    fromQuality,
    naiveQuality,
    recommendedQuality,
    oldCostUsd,
    naiveNewCostUsd,
    recommendedCostUsd,
    silentTrap,
    lines,
    isLegacyTo25,
  };
}

export function defaultMigrateSizeLabel(size?: string): string {
  if (!size) return "1024x1024";
  const [w, h] = parseSizeString(size);
  return formatSize(w, h);
}

/** Sanity check helper used in tests */
export function migrateUsesEstimateConsistency(
  model: string,
  quality: string,
  size: PopularSize,
): boolean {
  const est = estimate({ model, quality, size, count: 1 });
  const table = getCostFromTable(
    resolveModel(model).family,
    est.quality,
    size,
  );
  return Math.abs(est.costPerImageUsd - table) < 1e-12;
}
