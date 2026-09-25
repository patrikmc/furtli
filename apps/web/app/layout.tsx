import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";
import { isCurrentUserAdmin } from "@/lib/admin";

// Deliberately using the system font stack (Tailwind's default `font-sans`)
// rather than next/font/google: it removes a network fetch from every build
// (including CI), which matters more here than the specific typeface. Swap
// in next/font/local with a self-hosted font file if you want a custom
// typeface without paying that cost.

export const metadata: Metadata = {
  title: "Quiz Night",
  description: "A sample quiz app built on the startup-template scaffold.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // isCurrentUserAdmin() calls Clerk's currentUser(), which makes one
  // Backend API read per request for signed-in visitors (React's cache()
  // dedupes repeat calls within the same request, including the one
  // profile/page.tsx makes, so this doesn't add a second round trip
  // there). That's a fine trade for "Admin link only shows for admins"
  // on a template; if this read ever shows up in your latency budget,
  // switch to a Clerk session-claim (JWT template) and read the role via
  // the free, no-network auth() instead — see lib/admin.ts for why that
  // wasn't the default here.
  const isAdmin = await isCurrentUserAdmin();

  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full flex flex-col">
          <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
            <Link href="/" className="font-semibold">
              Quiz Night
            </Link>
            <div className="flex items-center gap-4">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
              </Show>
              <Show when="signed-in">
                <Link href="/quizzes" className="text-sm underline">
                  Quizzes
                </Link>
                <Link href="/profile" className="text-sm underline">
                  Profile
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="text-sm underline">
                    Admin
                  </Link>
                )}
                <UserButton />
              </Show>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
