import "server-only";
import { Resend } from "resend";

/**
 * Sending email. With RESEND_API_KEY set, messages go out through Resend
 * (batch API, up to 100 per request). Without it (local dev, tests, CI) the
 * "dev mailer" prints subject, recipient and every link to the server log,
 * so the whole subscribe → confirm → unsubscribe flow works locally.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Resend tags (ASCII letters, digits, _ and - only), e.g. { name: "kind", value: "reminder" }. */
  tags?: { name: string; value: string }[];
}

export interface SendResult {
  id?: string;
  error?: string;
  /** True when nothing was sent because no API key is configured. */
  dev?: boolean;
}

export interface Mailer {
  /** "resend" sends for real; "dev" only prints to the log (no RESEND_API_KEY). */
  readonly kind: "resend" | "dev";
  /** Sends up to 100 messages; results are in the same order. */
  sendBatch(messages: OutgoingEmail[], opts?: { idempotencyKey?: string }): Promise<SendResult[]>;
}

/** Prepended to every subject, e.g. "[Staging] " on staging. Unset in production. */
export function withSubjectPrefix(subject: string): string {
  return `${process.env.EMAIL_SUBJECT_PREFIX ?? ""}${subject}`;
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Furtli <hallo@furtli.ch>";
}

class ResendMailer implements Mailer {
  readonly kind = "resend" as const;
  private client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async sendBatch(messages: OutgoingEmail[], opts: { idempotencyKey?: string } = {}): Promise<SendResult[]> {
    if (messages.length === 0) return [];
    const replyTo = process.env.EMAIL_REPLY_TO || undefined;
    const { data, error } = await this.client.batch.send(
      messages.map((m) => ({
        from: emailFrom(),
        to: [m.to],
        subject: withSubjectPrefix(m.subject),
        html: m.html,
        text: m.text,
        headers: m.headers,
        tags: m.tags,
        ...(replyTo ? { replyTo } : {}),
      })),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    if (error || !data) {
      const msg = error ? `${error.name}: ${error.message}` : "No response from Resend";
      return messages.map(() => ({ error: msg }));
    }
    return messages.map((_, i) => (data.data[i]?.id ? { id: data.data[i].id } : { error: "Missing id in Resend response" }));
  }
}

class DevMailer implements Mailer {
  readonly kind = "dev" as const;
  async sendBatch(messages: OutgoingEmail[]): Promise<SendResult[]> {
    for (const m of messages) {
      const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"));
      console.info(
        `\n[email:dev] to=${m.to}\n  subject: ${withSubjectPrefix(m.subject)}\n  links:\n${[...new Set(links)].map((l) => `    ${l}`).join("\n")}\n`,
      );
    }
    return messages.map(() => ({ dev: true }));
  }
}

let instance: Mailer | null = null;

export function getMailer(): Mailer {
  if (instance) return instance;
  const key = process.env.RESEND_API_KEY;
  if (!key && process.env.VERCEL_ENV === "production") {
    console.warn("RESEND_API_KEY is not set in production: emails are only logged.");
  }
  instance = key ? new ResendMailer(key) : new DevMailer();
  return instance;
}
