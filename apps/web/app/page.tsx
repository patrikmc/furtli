import { SignInButton, SignUpButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold">Quiz Night - By the river</h1>
      <p className="text-lg text-black/70 dark:text-white/70">
        Test yourself against short, focused quizzes — world capitals, composer nationalities, the
        decade a famous face was born. Every quiz tracks your score and shows how you compare to
        everyone else who&apos;s taken it.
      </p>
      <div className="flex items-center justify-center gap-3">
        <SignUpButton>
          <button className="rounded bg-black px-6 py-3 text-sm font-medium text-white dark:bg-white dark:text-black">
            Create account
          </button>
        </SignUpButton>
        <SignInButton>
          <button className="rounded border border-black/15 px-6 py-3 text-sm font-medium dark:border-white/15">
            Sign in
          </button>
        </SignInButton>
      </div>
      <p className="mt-8 text-xs text-black/40 dark:text-white/40">
        This is the startup-template sample app — a quiz platform built on Next.js, Clerk, and
        Drizzle-managed Postgres. See the repo&apos;s root <code>README.md</code> and{" "}
        <code>docs/QUIZZES.md</code> for how the quiz content pipeline works.
      </p>
    </div>
  );
}
