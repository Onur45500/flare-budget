/**
 * Embedded pricing data for flare-budget.
 *
 * Provenance (pulled 2026-09-27):
 * - Token rates: official OpenAI pricing / model pages (Standard tier).
 * - Output token counts: OpenAI's GptImageTokenCalculator in the image generation guide
 *   (same formula as platform docs). Output-image tokens only; excludes text/image input
 *   and partial_images. Verify periodically when OpenAI updates pricing or the calculator.
 */

export const PRICING_SOURCE_DATE = "2026-09-27";

export const PRICING_SOURCE_URL =
  "https://developers.openai.com/api/docs/guides/image-generation#gpt-image-2-5-and-gpt-image-2-output-tokens";

export const PRICING_RATES_URL = "https://platform.openai.com/docs/pricing";

export const CALCULATOR_SOURCE_NOTE =
  "Output token counts match OpenAI's official image token calculator formula (GptImageTokenCalculator). Not live API billing.";

export const IMAGE_OUTPUT_USD_PER_1M = 30;

export const TOKEN_RATES_USD_PER_1M = {
  textInput: 5,
  textInputCached: 1.25,
  imageInput: 8,
  imageInputCached: 2,
  imageOutput: IMAGE_OUTPUT_USD_PER_1M,
} as const;

export const POPULAR_SIZES = [
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
] as const;

export type PopularSize = (typeof POPULAR_SIZES)[number];

export type CostFamily = "gpt-image-2" | "gpt-image-2.5";

export type QualityGptImage2 = "low" | "medium" | "high";
export type QualityGptImage25 =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
export type Quality = QualityGptImage2 | QualityGptImage25 | "auto";

export type ModelId =
  | "gpt-image-2"
  | "gpt-image-2.5-flare"
  | "gpt-image-2.5-sunburst";

export type ModelAlias = "flare" | "sunburst" | "gpt-image-2";

export interface ModelMeta {
  id: ModelId;
  aliases: readonly ModelAlias[];
  family: CostFamily;
  snapshot?: string;
  positioning: string;
  speedLabel: string;
}

export const MODELS: Record<ModelId, ModelMeta> = {
  "gpt-image-2.5-flare": {
    id: "gpt-image-2.5-flare",
    aliases: ["flare"],
    family: "gpt-image-2.5",
    snapshot: "gpt-image-2.5-flare-2026-09-08",
    positioning: "Fastest model for high-quality, everyday image generation",
    speedLabel: "Very fast",
  },
  "gpt-image-2.5-sunburst": {
    id: "gpt-image-2.5-sunburst",
    aliases: ["sunburst"],
    family: "gpt-image-2.5",
    snapshot: "gpt-image-2.5-sunburst-2026-09-08",
    positioning: "Most capable model for image generation and editing",
    speedLabel: "Medium",
  },
  "gpt-image-2": {
    id: "gpt-image-2",
    aliases: ["gpt-image-2"],
    family: "gpt-image-2",
    snapshot: "gpt-image-2-2026-04-21",
    positioning: "Legacy image generation model",
    speedLabel: "Baseline",
  },
};

/** Quality tier base constants from OpenAI's calculator bundle. */
export const QUALITY_BASE: Record<
  CostFamily,
  Partial<Record<Exclude<Quality, "auto">, number>>
> = {
  "gpt-image-2": {
    low: 16,
    medium: 48,
    high: 96,
  },
  "gpt-image-2.5": {
    low: 16,
    medium: 24,
    high: 48,
    xhigh: 64,
    max: 96,
  },
};

export const SIZE_RULES = {
  edgeDivisor: 16,
  minPixels: 655_360,
  maxPixels: 8_294_400,
  maxEdge: 3840,
  maxAspectRatio: 3,
} as const;

function bankersRoundHalf(value: number): number {
  const floor = Math.floor(value);
  const frac = value - floor;
  if (frac === 0.5) {
    return floor + (floor % 2);
  }
  return Math.round(value);
}

/**
 * OpenAI GptImageTokenCalculator output token formula.
 */
export function officialTokenFormula(
  family: CostFamily,
  width: number,
  height: number,
  quality: Exclude<Quality, "auto">,
): number {
  const base = QUALITY_BASE[family][quality];
  if (base === undefined) {
    throw new Error(`Unsupported quality ${quality} for ${family}`);
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const scaled = base / (longEdge / shortEdge);
  const u = bankersRoundHalf(scaled);
  const d = (width >= height ? base : u) * (width >= height ? u : base);
  return Math.ceil((d * (2_000_000 + width * height)) / 4_000_000);
}

export function tokensToOutputCostUsd(tokens: number): number {
  return (tokens * IMAGE_OUTPUT_USD_PER_1M) / 1_000_000;
}

function buildOutputTokensTable(): Record<
  CostFamily,
  Partial<Record<Exclude<Quality, "auto">, Record<PopularSize, number>>>
> {
  const table = {
    "gpt-image-2": {},
    "gpt-image-2.5": {},
  } as Record<
    CostFamily,
    Partial<Record<Exclude<Quality, "auto">, Record<PopularSize, number>>>
  >;

  for (const family of ["gpt-image-2", "gpt-image-2.5"] as const) {
    const qualities = Object.keys(QUALITY_BASE[family]) as Exclude<
      Quality,
      "auto"
    >[];
    for (const quality of qualities) {
      const bySize = {} as Record<PopularSize, number>;
      for (const size of POPULAR_SIZES) {
        const [w, h] = parseSizeString(size);
        bySize[size] = officialTokenFormula(family, w, h, quality);
      }
      table[family][quality] = bySize;
    }
  }
  return table;
}

/** Golden snapshot: literals match formula at PRICING_SOURCE_DATE; tests lock these values. */
export const OUTPUT_TOKENS: Record<
  CostFamily,
  Partial<Record<Exclude<Quality, "auto">, Record<PopularSize, number>>>
> = buildOutputTokensTable();

export function buildCostUsdTable(): Record<
  CostFamily,
  Partial<Record<Exclude<Quality, "auto">, Record<PopularSize, number>>>
> {
  const costs = {
    "gpt-image-2": {},
    "gpt-image-2.5": {},
  } as Record<
    CostFamily,
    Partial<Record<Exclude<Quality, "auto">, Record<PopularSize, number>>>
  >;

  for (const family of ["gpt-image-2", "gpt-image-2.5"] as const) {
    const tierMap = OUTPUT_TOKENS[family];
    for (const [quality, bySize] of Object.entries(tierMap)) {
      if (!bySize) continue;
      const costBySize = {} as Record<PopularSize, number>;
      for (const [size, tokens] of Object.entries(bySize)) {
        costBySize[size as PopularSize] = tokensToOutputCostUsd(tokens);
      }
      costs[family][quality as Exclude<Quality, "auto">] = costBySize;
    }
  }
  return costs;
}

export const COST_USD = buildCostUsdTable();

export function parseSizeString(size: string): [number, number] {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) {
    throw new Error(`Invalid size format "${size}". Expected WIDTHxHEIGHT (e.g. 1024x1024).`);
  }
  return [Number(match[1]), Number(match[2])];
}

export function formatSize(width: number, height: number): string {
  return `${width}x${height}`;
}

export function isPopularSize(size: string): size is PopularSize {
  return (POPULAR_SIZES as readonly string[]).includes(size);
}

export const ALL_MODEL_IDS = Object.keys(MODELS) as ModelId[];

export function listQualitiesForFamily(family: CostFamily): Exclude<Quality, "auto">[] {
  return Object.keys(QUALITY_BASE[family]) as Exclude<Quality, "auto">[];
}
