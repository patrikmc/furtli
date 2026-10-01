import { describe, expect, it } from "vitest";
import { explain, parseArgs } from "./cli";

describe("weekly script options", () => {
  const parse = (argv: string[]) => parseArgs(argv, ["--dry-run", "--json"], ["--week"]);

  it("reads flags and values (pnpm's -- separator is ignored)", () => {
    const a = parse(["--", "--dry-run", "--week", "2026-W40"]);
    expect(a.flags.has("--dry-run")).toBe(true);
    expect(a.values.get("--week")).toBe("2026-W40");
  });

  it("refuses a mistyped option instead of ignoring it", () => {
    expect(() => parse(["--dry-run."])).toThrow(/Unknown option "--dry-run."/);
    expect(() => parse(["--week"])).toThrow(/needs a value/);
  });

  it("explains a missing table and an unreachable database", () => {
    expect(explain(Object.assign(new Error('relation "weekly_metrics" does not exist'), { code: "42P01" }))).toMatch(/pnpm db:migrate/);
    expect(explain(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toMatch(/docker compose up -d/);
  });
});
