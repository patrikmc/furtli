import { getDb, hasDatabase } from "db";
import { CITY_PLZ } from "geo/data";
import { getMailer } from "@/lib/email/mailer";
import { subscribeSchema } from "@/lib/subscriptions/input";
import { SubscriptionInputError, subscribe } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscribe  { email, plz | stationId, topics[], reminders, digest, consent: true, lang, source, attribution }
 * Always answers { ok: true } for a valid request, whether the address is new,
 * pending or active (no account enumeration). Nothing is sent to the address
 * except the confirmation email.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }
  if (parsed.data.plz && !CITY_PLZ.includes(parsed.data.plz)) {
    return Response.json({ error: "Invalid input", issues: ["plz"] }, { status: 400 });
  }
  if (!hasDatabase()) return Response.json({ error: "Subscriptions are not available" }, { status: 503 });

  try {
    await subscribe({ db: getDb(), mailer: getMailer() }, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof SubscriptionInputError) return Response.json({ error: e.message }, { status: 400 });
    console.error("POST /api/subscribe failed", e);
    return Response.json({ error: "Subscription failed" }, { status: 500 });
  }
}
