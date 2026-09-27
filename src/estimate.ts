import { InputError } from "./errors.js";
import {
  ALL_MODEL_IDS,
  COST_USD,
  type CostFamily,
  type ModelId,
  type ModelMeta,
  MODELS,
  officialTokenFormula,
  OUTPUT_TOKENS,
  POPULAR_SIZES,
  type PopularSize,
  type Quality,
  listQualitiesForFamily,
  parseSizeString,
  formatSize,
  isPopularSize,
  SIZE_RULES,
  tokensToOutputCostUsd,
  type ModelAlias,
} from "./pricing-tables.js";

export type EstimateSource = "table" | "official-formula";

export interface EstimateResult {
  model: ModelId;
  family: CostFamily;
  quality: Exclude<Quality, "auto">;
  size: string;
  width: number;
  height: number;
  count: number;
  outputTokensPerImage: number;
  costPerImageUsd: number;
  totalCostUsd: number;
  source: EstimateSource;
  notes: string[];
}

const ALIAS_TO_MODEL: Record<string, ModelId> = {};
for (const model of Object.values(MODELS)) {
  for (const alias of model.aliases) {
    ALIAS_TO_MODEL[alias] = model.id;
  }
  ALIAS_TO_MODEL[model.id] = model.id;
}

export function resolveModel(input: string): ModelMeta {
  const normalized = input.trim().toLowerCase();
  const id = ALIAS_TO_MODEL[normalized];
  if (!id) {
    const valid = [
      ...ALL_MODEL_IDS,
      ...Object.values(MODELS).flatMap((m) => m.aliases.filter((a) => a !== m.id)),
    ];
    throw new InputError(
      `Unknown model "${input}". Valid models: ${valid.join(", ")}.`,
    );
  }
  return MODELS[id];
}

export function parseQualityForFamily(
  family: CostFamily,
  qualityRaw: string,
): Exclude<Quality, "auto"> {
  const quality = qualityRaw.trim().toLowerCase() as Quality;
  if (quality === "auto") {
    throw new InputError(
      'Quality "auto" cannot be estimated offline — OpenAI picks the tier per image. Use an explicit quality (e.g. low, medium, high, xhigh, max).',
    );
  }
  const valid = listQualitiesForFamily(family);
  if (!valid.includes(quality as Exclude<Quality, "auto">)) {
    throw new InputError(
      `Unknown quality "${qualityRaw}" for ${family}. Valid options: ${valid.join(", ")}.`,
    );
  }
  return quality as Exclude<Quality, "auto">;
}

export function validateCustomSize(width: number, height: number): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    errors.push("Width and height must be positive whole numbers.");
    return errors;
  }
  if (width % SIZE_RULES.edgeDivisor !== 0 || height % SIZE_RULES.edgeDivisor !== 0) {
    errors.push(`Width and height must both be divisible by ${SIZE_RULES.edgeDivisor}.`);
  }
  const pixels = width * height;
  if (pixels < SIZE_RULES.minPixels) {
    errors.push(
      `Pixel budget must be at least ${SIZE_RULES.minPixels.toLocaleString("en-US")} pixels.`,
    );
  }
  if (pixels > SIZE_RULES.maxPixels) {
    errors.push(
      `Pixel budget must be no greater than ${SIZE_RULES.maxPixels.toLocaleString("en-US")} pixels.`,
    );
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge > SIZE_RULES.maxEdge) {
    errors.push(
      `Maximum edge length must be less than or equal to ${SIZE_RULES.maxEdge}px.`,
    );
  }
  if (longEdge / shortEdge > SIZE_RULES.maxAspectRatio) {
    errors.push("Aspect ratio must be no greater than 3:1.");
  }
  return errors;
}

export function parseSizeInput(sizeRaw: string): { width: number; height: number; label: string } {
  let width: number;
  let height: number;
  try {
    [width, height] = parseSizeString(sizeRaw);
  } catch {
    throw new InputError(
      `Invalid size "${sizeRaw}". Expected WIDTHxHEIGHT. Popular sizes: ${POPULAR_SIZES.join(", ")}.`,
    );
  }
  return { width, height, label: formatSize(width, height) };
}

export function lookupOutputTokens(
  family: CostFamily,
  quality: Exclude<Quality, "auto">,
  width: number,
  height: number,
): { tokens: number; source: EstimateSource } {
  const label = formatSize(width, height);
  if (isPopularSize(label)) {
    const tokens = OUTPUT_TOKENS[family][quality]?.[label as PopularSize];
    if (tokens === undefined) {
      throw new InputError(
        `No embedded table entry for ${family} quality=${quality} size=${label}.`,
      );
    }
    return { tokens, source: "table" };
  }
  const sizeErrors = validateCustomSize(width, height);
  if (sizeErrors.length > 0) {
    throw new InputError(
      `Size ${label} is not in the embedded table and fails OpenAI size rules:\n${sizeErrors.map((e) => `- ${e}`).join("\n")}\nSupported popular sizes: ${POPULAR_SIZES.join(", ")}.`,
    );
  }
  const tokens = officialTokenFormula(family, width, height, quality);
  return { tokens, source: "official-formula" };
}

export function estimate(options: {
  model: string;
  quality: string;
  size: string;
  count?: number;
}): EstimateResult {
  const count = options.count ?? 1;
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
    throw new InputError("--count must be a positive integer.");
  }

  const modelMeta = resolveModel(options.model);
  const quality = parseQualityForFamily(modelMeta.family, options.quality);
  const { width, height, label } = parseSizeInput(options.size);
  const { tokens, source } = lookupOutputTokens(
    modelMeta.family,
    quality,
    width,
    height,
  );
  const costPerImageUsd = tokensToOutputCostUsd(tokens);
  const notes = [
    "Estimate includes image output tokens only ($30/1M). Excludes text input, image input, cached inputs, and partial_images.",
  ];
  if (source === "official-formula") {
    notes.push(
      "Cost computed with OpenAI's official calculator formula for this custom size (not a table lookup).",
    );
  }

  return {
    model: modelMeta.id,
    family: modelMeta.family,
    quality,
    size: label,
    width,
    height,
    count,
    outputTokensPerImage: tokens,
    costPerImageUsd,
    totalCostUsd: costPerImageUsd * count,
    source,
    notes,
  };
}

export function getCostFromTable(
  family: CostFamily,
  quality: Exclude<Quality, "auto">,
  size: PopularSize,
): number {
  const cost = COST_USD[family][quality]?.[size];
  if (cost === undefined) {
    throw new InputError(`Missing cost for ${family} ${quality} ${size}.`);
  }
  return cost;
}

export function modelIdFromAlias(alias: ModelAlias | string): ModelId {
  return resolveModel(alias).id;
}
