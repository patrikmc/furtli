import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { COPY, type Lang } from "../../lib/email/copy";

/** Brand tokens (app/globals.css), inlined for email clients. */
export const C = {
  orange: "#E8512B",
  ink: "#17223B",
  paper: "#F3F5F2",
  mint: "#D7EFE3",
  moss: "#2F7D5B",
  sun: "#F6C343",
  muted: "#5B6477",
};

export const FONT = '"Atkinson Hyperlegible", "Helvetica Neue", Helvetica, Arial, sans-serif';

const contact = process.env.EMAIL_CONTACT_ADDRESS || "hallo@furtli.ch";

export function Layout({
  lang,
  preview,
  children,
  mapUrl,
  unsubscribeUrl,
}: {
  lang: Lang;
  preview: string;
  children: ReactNode;
  mapUrl: string;
  /** Omitted on the confirmation email (nothing to unsubscribe from yet). */
  unsubscribeUrl?: string;
}) {
  const t = COPY[lang];
  return (
    <Html lang={lang === "de" ? "de-CH" : "en"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.paper, fontFamily: FONT, color: C.ink, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
          <Text style={{ fontSize: 26, lineHeight: "32px", fontWeight: 800, margin: "0 0 4px", letterSpacing: -0.5 }}>
            furtli<span style={{ color: C.orange }}>.</span>
          </Text>
          <Text style={{ fontSize: 13, color: C.muted, margin: "0 0 16px" }}>{t.brandTagline}</Text>
          <Section style={{ backgroundColor: "#FFFFFF", borderRadius: 20, padding: "24px 24px 20px" }}>{children}</Section>
          <Text style={{ fontSize: 12, lineHeight: "18px", color: C.muted, margin: "20px 4px 0" }}>
            {t.footerWhy}
            <br />
            <Link href={mapUrl} style={{ color: C.ink, textDecoration: "underline" }}>
              {t.footerMap}
            </Link>
            {unsubscribeUrl && (
              <>
                {" · "}
                <Link href={unsubscribeUrl} style={{ color: C.ink, textDecoration: "underline" }}>
                  {t.footerUnsubscribe}
                </Link>
              </>
            )}
          </Text>
          <Hr style={{ borderColor: "#DDE2DA", margin: "16px 4px" }} />
          <Text style={{ fontSize: 11, color: C.muted, margin: "0 4px" }}>
            Furtli · Zürich · <Link href={`mailto:${contact}`} style={{ color: C.muted }}>{contact}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, margin: "0 0 12px" }}>{children}</Text>;
}

export function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text style={{ fontSize: 16, lineHeight: "24px", margin: "0 0 12px", color: muted ? C.muted : C.ink }}>{children}</Text>
  );
}

export function PrimaryButton({ href, children, color = C.ink }: { href: string; children: ReactNode; color?: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: color,
        color: "#FFFFFF",
        fontWeight: 700,
        fontSize: 16,
        padding: "12px 20px",
        borderRadius: 14,
        textDecoration: "none",
        margin: "4px 0 12px",
      }}
    >
      {children}
    </Link>
  );
}
