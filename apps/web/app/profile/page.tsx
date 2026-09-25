import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileStats } from "@/lib/quizzes";

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const stats = await getProfileStats(userId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-bold">
          {user?.firstName ? `${user.firstName}'s profile` : "Your profile"}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {user?.primaryEmailAddress?.emailAddress}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">{stats.distinctQuizzesTaken}</div>
          <div className="text-xs text-black/50 dark:text-white/50">Quizzes taken</div>
        </div>
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">{stats.totalAttempts}</div>
          <div className="text-xs text-black/50 dark:text-white/50">Total attempts</div>
        </div>
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">
            {stats.overallAveragePercentage !== null ? `${Math.round(stats.overallAveragePercentage)}%` : "—"}
          </div>
          <div className="text-xs text-black/50 dark:text-white/50">Average score</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Latest results</h2>
        {stats.latestPerQuiz.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            You haven&apos;t taken any quizzes yet.{" "}
            <Link href="/quizzes" className="underline">
              Browse quizzes
            </Link>
            .
          </p>
        )}
        {stats.latestPerQuiz.map(({ quiz, attempt }) => (
          <Link
            key={quiz.id}
            href={`/quizzes/${quiz.slug}/attempts/${attempt.id}`}
            className="flex items-center justify-between rounded border border-black/10 px-4 py-3 text-sm transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
          >
            <div>
              <div className="font-medium">{quiz.title}</div>
              <div className="text-xs text-black/50 dark:text-white/50">
                {attempt.score}/{attempt.totalQuestions} correct
              </div>
            </div>
            <div className="text-lg font-semibold">{Math.round(attempt.scorePercentage)}%</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
