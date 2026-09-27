import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcDir = join(root, "src");
const blockNetwork = join(root, "tests", "helpers", "block-network.cjs");
const cli = join(root, "dist", "cli.js");

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...listSourceFiles(p));
    else if (e.name.endsWith(".ts")) files.push(p);
  }
  return files;
}

describe("offline guarantee", () => {
  it("src does not import network modules", () => {
    const forbidden = [
      "node:net",
      "node:http",
      "node:https",
      "node:dns",
      '"fetch"',
      "'fetch'",
    ];
    for (const file of listSourceFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(text.includes(token), `${file} must not reference ${token}`).toBe(
          false,
        );
      }
    }
  });

  it(
    "CLI commands succeed with network blocked",
    () => {
    const node = process.execPath;
    const run = (args: string[]) =>
      execFileSync(node, ["--require", blockNetwork, cli, ...args], {
        encoding: "utf8",
      });
    expect(
      run([
        "estimate",
        "--model",
        "flare",
        "--quality",
        "high",
        "--size",
        "1024x1024",
        "--count",
        "2",
      ]),
    ).toMatch(/Per image/);
    expect(run(["migrate", "--from", "gpt-image-2", "--quality", "high"])).toMatch(
      /max/,
    );
    expect(
      run([
        "monthly",
        "--model",
        "flare",
        "--size",
        "1024x1024",
        "--images-per-day",
        "1",
        "--quality",
        "low",
      ]),
    ).toMatch(/Daily/);
    },
    60_000,
  );
});
