import { render } from "@react-email/render";
import ConfirmSubscription, { type ConfirmSubscriptionProps } from "@/emails/ConfirmSubscription";
import Reminder, { type ReminderProps } from "@/emails/Reminder";
import WeeklyDigest, { type WeeklyDigestProps } from "@/emails/WeeklyDigest";
import Welcome, { type WelcomeProps } from "@/emails/Welcome";
import { COPY, TYPE_LABELS, joinList, formatShortDate } from "./copy";

/** A rendered email: subject line, HTML and a plain-text alternative. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

async function both(el: React.ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

export async function renderConfirm(p: ConfirmSubscriptionProps): Promise<RenderedEmail> {
  const t = COPY[p.lang];
  return { subject: p.isUpdate ? t.confirmUpdateSubject : t.confirmSubject, ...(await both(<ConfirmSubscription {...p} />)) };
}

export async function renderWelcome(p: WelcomeProps): Promise<RenderedEmail> {
  return { subject: COPY[p.lang].welcomeSubject, ...(await both(<Welcome {...p} />)) };
}

export async function renderReminder(p: ReminderProps): Promise<RenderedEmail> {
  const labels = [...new Set(p.items.map((i) => TYPE_LABELS[p.lang][i.type]))];
  return { subject: COPY[p.lang].reminderSubject(joinList(labels, p.lang)), ...(await both(<Reminder {...p} />)) };
}

export async function renderDigest(p: WeeklyDigestProps & { from: string; to: string }): Promise<RenderedEmail> {
  const range = `${formatShortDate(p.from, p.lang)} – ${formatShortDate(p.to, p.lang)}`;
  return { subject: COPY[p.lang].digestSubject(range), ...(await both(<WeeklyDigest {...p} />)) };
}
