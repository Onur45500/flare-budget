# flare-budget

Offline GPT Image **2.5** (Flare / Sunburst) **output-cost estimator** and **gpt-image-2 quality remapper**. Not an official OpenAI tool, not a live usage meter, and not affiliated with OpenAI.

**Pricing snapshot date: 2026-09-27** — run `flare-budget --meta` to see source URLs and freshness.

## The problem

OpenAI bills GPT Image models by **tokens**, and GPT Image 2.5 added **`xhigh`** and **`max`** while reusing tier names (`low`, `medium`, `high`). The **same quality string** can mean a different token tier than on `gpt-image-2`. Teams that swap the model ID but keep `quality: "high"` can **silently** get cheaper, lower-fidelity output. OpenAI’s older **GPT Image 2** calculator does not estimate 2.5 consumption; the guide now ships a combined 2.5 calculator, but there is no migration helper that warns about label drift.

flare-budget embeds OpenAI’s **token rates** and the **calculator formula** from the image generation guide so you can estimate and compare **fully offline** (no API key, no network).

## Install

```bash
npm install -g flare-budget
# or without installing:
npx flare-budget --help
```

Requires **Node.js 24+**.

## Quick start

### 1. Migrate (start here)

```bash
flare-budget migrate --from gpt-image-2 --quality high --size 1024x1024
```

Example output:

```text
Migration: gpt-image-2 → gpt-image-2.5-flare
Size: 1024x1024 (embedded table; output tokens only)
On gpt-image-2, quality "high" ≈ $0.21072 per image.
If you keep quality: "high" on gpt-image-2.5-flare, cost ≈ $0.05268 per image (-75% vs legacy).
⚠ Keeping quality: "high" after migrating to gpt-image-2.5-flare will cost you ~$0.05268 (was ~$0.21072 on gpt-image-2) — set quality: "max" to match your old output.
To reproduce ~$0.21072 output on gpt-image-2.5-flare, use quality: "max" (≈ $0.21072 per image).
```

Exact tier mapping from embedded costs (every popular size):

| gpt-image-2 | Closest gpt-image-2.5 tier |
|-------------|----------------------------|
| low         | low                        |
| medium      | high                       |
| high        | max                        |

`medium` and `xhigh` on 2.5 have no legacy equivalent.

### 2. Estimate

```bash
flare-budget estimate --model flare --quality high --size 1024x1024 --count 1000
flare-budget estimate --model sunburst --quality max --size 1536x1024 --json
```

### 3. Monthly budget

```bash
flare-budget monthly --model flare --size 1024x1024 --images-per-day 500 \
  --compare-qualities low,high,max

flare-budget monthly --model flare --size 1024x1024 --images-per-day 500 \
  --compare-qualities low,high,max --markdown
```

Default month length: **30.44 days** (365.25 ÷ 12). Override with `--days 30` or `--days 31`.

## How the numbers were sourced

| Data | Status | Source |
|------|--------|--------|
| Token rates ($8 / $2 / $30 image I/O, $5 / $1.25 text) | **Official** | [Pricing](https://platform.openai.com/docs/pricing), [Flare](https://platform.openai.com/docs/models/gpt-image-2.5-flare), [Sunburst](https://platform.openai.com/docs/models/gpt-image-2.5-sunburst) |
| Output tokens per quality × size | **Official calculator formula** | [Image generation guide — token calculator](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-2-5-and-gpt-image-2-output-tokens) (`GptImageTokenCalculator` in OpenAI’s docs bundle) |
| Third-party tables | **Corroboration only** | e.g. [Kanaries](https://docs.kanaries.net/articles/gpt-image-2-5) (read 2026-09-20) — not used as primary source |

**Pulled on: 2026-09-27**

Estimates include **image output tokens only** at **$30/1M**. They exclude text prompts, reference-image input, cached inputs, Responses API mainline tokens, and streaming `partial_images` (+100 output tokens each).

### Updating pricing

1. Re-fetch OpenAI pricing and the calculator section (or its JS bundle) for changes to rates or `QUALITY_BASE` constants.
2. Update `src/pricing-tables.ts` and `PRICING_SOURCE_DATE`.
3. Update golden expectations in `tests/pricing-tables.test.ts` (they fail loudly when numbers drift).
4. Bump `CHANGELOG.md` and release.

## Supported sizes

**Embedded table** (fast lookup): `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`.

Any other size that satisfies OpenAI’s rules (multiples of 16, aspect ratio ≤ 3:1, longest edge ≤ 3840, pixel budget 655,360–8,294,400) is computed with the **same official formula** and labeled `official-formula` in output.

**Note:** Larger resolutions are not always more expensive (OpenAI documents that non-square sizes can use fewer tokens than smaller squares at the same quality).

## Limitations (v1)

- **USD only** — no currency conversion.
- **Standard token rates only** — not Batch/Flex/regional uplifts.
- **Output tokens only** — not full request cost.
- **`auto` quality** — refused offline (OpenAI picks per image).
- **Point-in-time tables** — run `flare-budget --meta` before trusting numbers in production budgets.

## CLI reference

```bash
flare-budget --meta          # version, source URL, source date
flare-budget estimate --model flare|sunburst|gpt-image-2 --quality <tier> --size WxH [--count N] [--json]
flare-budget migrate --from gpt-image-2|gpt-image-2.5-flare|... --quality <tier> [--size WxH] [--to flare|sunburst]
flare-budget monthly --model flare|sunburst --size WxH (--images-per-day N | --images-per-month N) [--quality tier | --compare-qualities a,b,c] [--days N] [--markdown] [--json]
```

Exit codes: **0** success, **2** invalid input / usage, **1** unexpected error.

## Contributing

Pricing updates are welcome as PRs that change `src/pricing-tables.ts`, `PRICING_SOURCE_DATE`, and **golden tests** together. Include the date you re-fetched OpenAI docs.

## License

MIT — see [LICENSE](LICENSE).