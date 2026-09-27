#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { estimate } from "./estimate.js";
import { isInputError } from "./errors.js";
import { buildMonthlyResult } from "./monthly.js";
import { migrate } from "./remap.js";
import {
  CALCULATOR_SOURCE_NOTE,
  PRICING_RATES_URL,
  PRICING_SOURCE_DATE,
  PRICING_SOURCE_URL,
} from "./pricing-tables.js";

function readPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(dir, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

const VERSION = readPackageVersion();

function formatUsd5(n: number): string {
  return `$${n.toFixed(5)}`;
}

function formatUsd2(n: number): string {
  return `$${n.toFixed(2)}`;
}

function printMeta(): void {
  console.log(`flare-budget ${VERSION}`);
  console.log(`Pricing source date: ${PRICING_SOURCE_DATE}`);
  console.log(`Pricing calculator: ${PRICING_SOURCE_URL}`);
  console.log(`Token rates: ${PRICING_RATES_URL}`);
  console.log(CALCULATOR_SOURCE_NOTE);
  console.log("Currency: USD only (v1).");
}

function handleError(error: unknown): never {
  if (isInputError(error)) {
    console.error(error.message);
    process.exit(error.exitCode);
  }
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(String(error));
  process.exit(1);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("flare-budget")
    .description(
      "Offline GPT Image 2.5 cost estimator and gpt-image-2 quality remapper",
    )
    .version(`${VERSION} (pricing ${PRICING_SOURCE_DATE})`, "-V, --version")
    .option("--meta", "Show pricing source metadata and freshness");

  program
    .command("estimate")
    .description("Estimate per-image and total output cost")
    .requiredOption("--model <id>", "Model: flare, sunburst, or gpt-image-2")
    .requiredOption(
      "--quality <tier>",
      "Quality: low, medium, high, xhigh, max (2.5) or low, medium, high (gpt-image-2)",
    )
    .requiredOption("--size <WxH>", "Image size, e.g. 1024x1024")
    .option("--count <n>", "Number of images", "1")
    .option("--json", "Machine-readable JSON output")
    .action((opts: { model: string; quality: string; size: string; count: string; json?: boolean }) => {
      try {
        const count = Number(opts.count);
        const result = estimate({
          model: opts.model,
          quality: opts.quality,
          size: opts.size,
          count,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`Model:     ${result.model}`);
        console.log(`Quality:   ${result.quality}`);
        console.log(`Size:      ${result.size}`);
        console.log(`Source:    ${result.source}`);
        console.log(`Tokens:    ${result.outputTokensPerImage} output tokens/image`);
        console.log(`Per image: ${formatUsd5(result.costPerImageUsd)}`);
        console.log(`Total (${result.count}): ${formatUsd2(result.totalCostUsd)}`);
        for (const note of result.notes) {
          console.log(`Note: ${note}`);
        }
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("migrate")
    .description("Map legacy gpt-image-2 quality to GPT Image 2.5 equivalents")
    .requiredOption("--from <model>", "Source model: gpt-image-2 or gpt-image-2.5-flare")
    .requiredOption("--quality <tier>", "Quality tier on the source model")
    .option("--size <WxH>", "Popular table size", "1024x1024")
    .option("--to <model>", "Target model when migrating", "flare")
    .option("--json", "Machine-readable JSON output")
    .action(
      (opts: {
        from: string;
        quality: string;
        size?: string;
        to?: string;
        json?: boolean;
      }) => {
        try {
          const result = migrate({
            from: opts.from,
            quality: opts.quality,
            size: opts.size,
            to: opts.to,
          });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(`Migration: ${result.fromModel} → ${result.toModel}`);
          for (const line of result.lines) {
            console.log(line.text);
          }
        } catch (error) {
          handleError(error);
        }
      },
    );

  program
    .command("monthly")
    .description("Print daily / weekly / monthly budget table")
    .requiredOption("--model <id>", "Model: flare or sunburst")
    .requiredOption("--size <WxH>", "Image size")
    .option("--quality <tier>", "Single quality tier (if not using --compare-qualities)")
    .option("--images-per-day <n>", "Images generated per day")
    .option("--images-per-month <n>", "Images generated per month")
    .option("--days <n>", "Days per month for monthly column (default 30.44)")
    .option(
      "--compare-qualities <list>",
      "Comma-separated tiers, e.g. low,high,max",
    )
    .option("--markdown", "GitHub-flavored Markdown table")
    .option("--json", "Machine-readable JSON output")
    .action(
      (opts: {
        model: string;
        size: string;
        quality?: string;
        imagesPerDay?: string;
        imagesPerMonth?: string;
        days?: string;
        compareQualities?: string;
        markdown?: boolean;
        json?: boolean;
      }) => {
        try {
          const result = buildMonthlyResult({
            model: opts.model,
            size: opts.size,
            quality: opts.quality,
            imagesPerDay: opts.imagesPerDay ? Number(opts.imagesPerDay) : undefined,
            imagesPerMonth: opts.imagesPerMonth
              ? Number(opts.imagesPerMonth)
              : undefined,
            days: opts.days ? Number(opts.days) : undefined,
            compareQualities: opts.compareQualities,
            markdown: opts.markdown,
          });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(
            `Budget: ${result.model} @ ${result.size}, ${result.imagesPerDay.toFixed(2)} images/day`,
          );
          console.log(result.tableText);
        } catch (error) {
          handleError(error);
        }
      },
    );

  program.configureOutput({
    writeErr: (str) => {
      process.stderr.write(str);
    },
  });

  program.exitOverride((err) => {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      process.exit(0);
    }
    if (err.code === "commander.missingMandatoryOptionValue") {
      console.error(err.message);
      process.exit(2);
    }
    if (err.code === "commander.unknownOption") {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  });

  return program;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--meta") {
    printMeta();
    process.exit(0);
  }

  const program = createProgram();
  try {
    program.parse(process.argv);
    if (program.getOptionValue("meta") === true) {
      printMeta();
      process.exit(0);
    }
  } catch (error) {
    handleError(error);
  }
}

const entry = process.argv[1] ? fileURLToPath(import.meta.url) : "";
const invoked = process.argv[1] ?? "";
if (
  invoked &&
  (entry === invoked ||
    invoked.endsWith("cli.js") ||
    invoked.endsWith("cli.ts"))
) {
  main();
}
