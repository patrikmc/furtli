/**
 * Small, strict argument parsing for the weekly scripts: an unknown or
 * mistyped option (e.g. "--dry-run." copied with a full stop) stops the
 * script instead of being ignored, so a dry run never silently saves.
 */
export function parseArgs(argv: string[], flags: readonly string[], valued: readonly string[]): { flags: Set<string>; values: Map<string, string> } {
  const args = argv.filter((a) => a !== "--");
  const out = { flags: new Set<string>(), values: new Map<string, string>() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flags.includes(a)) out.flags.add(a);
    else if (valued.includes(a)) {
      const v = args[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`);
      out.values.set(a, v);
    } else throw new Error(`Unknown option "${a}". Options: ${[...flags, ...valued.map((v) => `${v} <value>`)].join(", ")}`);
  }
  return out;
}

/** A clearer message for the two usual local failures. */
export function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) return `${msg}\nThe database isn't reachable: start it (docker compose up -d) or point DATABASE_URL at Neon.`;
  if (code === "42P01" || /relation "weekly_metrics" does not exist/.test(msg))
    return `${msg}\nThe weekly_metrics table is missing: run \`pnpm db:migrate\` against this database first.`;
  return msg;
}
