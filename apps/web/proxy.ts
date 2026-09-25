import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (same behavior, new name/
// export). If you're on Next.js <=15, rename this file back to
// `middleware.ts` and change `export default` to `export default function
// middleware` — nothing else changes. See:
// https://nextjs.org/docs/app/api-reference/file-conventions/proxy

const isProtectedRoute = createRouteMatcher(["/quizzes(.*)", "/profile(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
