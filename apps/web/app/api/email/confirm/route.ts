import { getDb, hasDatabase } from "db";
import { getMailer } from "@/lib/email/mailer";
import { asLang } from "@/lib/i18n/lang";
import { confirm } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

/** Form POST from /abo/bestaetigen (a button, so link scanners can't confirm on their own). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const lang = asLang(form?.get("lang"));
  // ?lang= keeps the result page in the language of the page the button was on (the proxy stores it).
  const back = (s: string) => Response.redirect(new URL(`/abo/fertig?s=${s}&lang=${lang}`, req.url), 303);
  if (!token || !hasDatabase()) return back("invalid");
  try {
    return back(await confirm({ db: getDb(), mailer: getMailer() }, token));
  } catch (e) {
    console.error("POST /api/email/confirm failed", e);
    return back("error");
  }
}
