import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const node = process.execPath;

function run(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(node, [cli, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const e = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
      status: e.status ?? 1,
    };
  }
}

describe("CLI", () => {
  it("estimate math is consistent for 1000 images", () => {
    const { stdout, status } = run([
      "estimate",
      "--model",
      "flare",
      "--quality",
      "high",
      "--size",
      "1024x1024",
      "--count",
      "1000",
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Per image: \$0\.05268/);
    expect(stdout).toMatch(/Total \(1000\): \$52\.68/);
  });

  it("migrate prints trap warning", () => {
    const { stdout, status } = run([
      "migrate",
      "--from",
      "gpt-image-2",
      "--quality",
      "high",
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/⚠ Keeping quality: "high"/);
    expect(stdout).toMatch(/set quality: "max"/);
  });

  it("invalid quality exits 2", () => {
    const { stderr, status } = run([
      "estimate",
      "--model",
      "flare",
      "--quality",
      "not-a-tier",
      "--size",
      "1024x1024",
    ]);
    expect(status).toBe(2);
    expect(stderr + "").toMatch(/Valid options/);
  });

  it("--meta prints source date", () => {
    const { stdout, status } = run(["--meta"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/2026-09-27/);
  });
});
