import { getDb, hasDatabase } from "db";
import { getMailer } from "@/lib/email/mailer";
import { asLang } from "@/lib/i18n/lang";
import { unsubscribe } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/email/unsubscribe?t=TOKEN
 * - One-click (RFC 8058): mail clients POST "List-Unsubscribe=One-Click" → 200.
 * - The button on /abo/abmelden posts a form with t → redirect to the result page.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const token = url.searchParams.get("t") || String(form?.get("t") ?? "");
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";

  let outcome: "unsubscribed" | "invalid" | "error" = "invalid";
  if (token && hasDatabase()) {
    try {
      outcome = await unsubscribe({ db: getDb(), mailer: getMailer() }, token);
    } catch (e) {
      console.error("POST /api/email/unsubscribe failed", e);
      outcome = "error";
    }
  }
  if (oneClick) return new Response(outcome === "error" ? "error" : "ok", { status: outcome === "error" ? 500 : 200 });
  const lang = asLang(form?.get("lang"));
  return Response.redirect(new URL(`/abo/fertig?s=${outcome}&lang=${lang}`, req.url), 303);
}
