import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

/**
 * Admin access is a single `publicMetadata.role === "admin"` check on the
 * Clerk user, not a Clerk session-claim / JWT-template configuration in
 * proxy.ts. That's a deliberate pragmatic choice for a template: it's one
 * dashboard edit away (Clerk dashboard -> Users -> pick a user -> Edit
 * public metadata -> `{"role": "admin"}`) rather than requiring a custom
 * session token configuration, and it's checked server-side on every
 * admin page/action — never trusted from the client, never baked into a
 * cookie the client could tamper with. See docs/QUIZZES.md for the
 * step-by-step of granting yourself admin locally.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await currentUser();
  return user?.publicMetadata?.role === "admin";
}

/** Use at the top of an admin Server Component page. Renders the route as a 404 for non-admins rather than a distinguishable "forbidden" page — a signed-in non-admin user gets no signal that /admin exists at all. */
export async function requireAdmin(): Promise<void> {
  if (!(await isCurrentUserAdmin())) {
    notFound();
  }
}

/** Use at the top of an admin Server Action. Actions can't call notFound() (there's no page render to swap out), so this throws instead — the action call rejects, which is the correct outcome for a non-admin somehow invoking an admin action directly (e.g. a forged request), since the UI never renders a path to trigger it in the first place. */
export async function assertAdmin(): Promise<void> {
  if (!(await isCurrentUserAdmin())) {
    throw new Error("Forbidden: admin role required");
  }
}
