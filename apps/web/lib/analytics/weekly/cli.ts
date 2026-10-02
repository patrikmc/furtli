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

type Err = { message?: unknown; code?: unknown; cause?: unknown };

/** The innermost error: drizzle wraps the database's own error ("Failed query: …") in `cause`. */
function rootCause(e: unknown): unknown {
  let c = e;
  for (let i = 0; i < 5 && c && typeof c === "object" && (c as Err).cause; i++) c = (c as Err).cause;
  return c;
}

const text = (e: unknown) => (e instanceof Error ? e.message : String((e as Err)?.message ?? e));

/** What to do about the usual failures, by Postgres / network error code (or message). */
function hint(code: string, msg: string): string | null {
  if (code === "ECONNREFUSED") return "The database isn't reachable: start it (docker compose up -d) or check the host in DATABASE_URL.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "The database host name can't be resolved: check the host in DATABASE_URL (copy it from Neon → Connect).";
  if (code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT") return "The database didn't answer in time: check the network and the host in DATABASE_URL.";
  if (code === "42P01" || /relation "weekly_metrics" does not exist/.test(msg))
    return "The weekly_metrics table doesn't exist in this database: run the migrations against it (pnpm db:migrate with the owner login), and check that DATABASE_URL points at the right database and Neon branch.";
  if (code === "42501" || /permission denied/.test(msg))
    return "This login may not read weekly_metrics: run the GRANT lines from docs/DEPLOYMENT.md §7 as the owner, in the same database and branch, after the table exists.";
  if (code === "28P01" || /password authentication failed/.test(msg)) return "Wrong user name or password in DATABASE_URL.";
  if (code === "28000" || /role ".*" does not exist/.test(msg)) return "This database login doesn't exist here: create it with docs/DEPLOYMENT.md §7, in the same Neon project and branch as the host in DATABASE_URL.";
  if (code === "3D000" || /database ".*" does not exist/.test(msg)) return "The database name at the end of DATABASE_URL is wrong (Neon's default is neondb).";
  return null;
}

/**
 * A readable error for the scripts: the database's own message (not drizzle's
 * "Failed query: … params: …" wrapper) on a line starting with "Error:", plus
 * a hint when we know the usual cause. The SQL is left out unless DEBUG is set.
 */
export function explain(e: unknown): string {
  const root = rootCause(e);
  const msg = text(root);
  const code = String((root as Err)?.code ?? (e as Err)?.code ?? "");
  const lines = [`Error: ${msg}${code && !msg.includes(code) ? ` (${code})` : ""}`];
  const h = hint(code, msg);
  if (h) lines.push(h);
  if (process.env.DEBUG && root !== e) lines.push(`(${text(e)})`);
  return lines.join("\n");
}
