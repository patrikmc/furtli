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

  const wrapped = (cause: Error) => Object.assign(new Error('Failed query: select "week" from "weekly_metrics"\nparams: 1'), { cause });

  it("shows the database's own error instead of drizzle's Failed query wrapper", () => {
    const out = explain(wrapped(Object.assign(new Error("permission denied for table weekly_metrics"), { code: "42501" })));
    expect(out).toMatch(/^Error: permission denied for table weekly_metrics \(42501\)/);
    expect(out).toMatch(/GRANT lines/);
    expect(out).not.toMatch(/Failed query|params/);
  });

  it("explains the usual failures", () => {
    expect(explain(wrapped(Object.assign(new Error('relation "weekly_metrics" does not exist'), { code: "42P01" })))).toMatch(/pnpm db:migrate/);
    expect(explain(wrapped(Object.assign(new Error('password authentication failed for user "furtli_report"'), { code: "28P01" })))).toMatch(/Wrong user name or password/);
    expect(explain(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }))).toMatch(/docker compose up -d/);
    expect(explain(Object.assign(new Error("getaddrinfo ENOTFOUND ep-x.neon.tech"), { code: "ENOTFOUND" }))).toMatch(/host name/);
    expect(explain(new Error("something else"))).toBe("Error: something else");
  });
});
