import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listQuizzesForOverview } from "@/lib/quizzes";

export default async function QuizzesOverviewPage() {
  const { userId } = await auth();
  const quizzes = await listQuizzesForOverview(userId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Pick one to play. Quizzes you&apos;ve already taken show your latest score.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {quizzes.map((quiz) => (
          <Link
            key={quiz.id}
            href={`/quizzes/${quiz.slug}`}
            className="flex flex-col overflow-hidden rounded-lg border border-black/10 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
          >
            {quiz.thumbnailUrl ? (
              <div className="relative h-36 w-full bg-black/5 dark:bg-white/5">
                <Image src={quiz.thumbnailUrl} alt="" fill className="object-cover" />
              </div>
            ) : (
              <div className="h-36 w-full bg-black/5 dark:bg-white/5" />
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{quiz.title}</h2>
                {quiz.category && (
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
                    {quiz.category}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm text-black/60 dark:text-white/60">{quiz.description}</p>
              <div className="mt-auto flex items-center justify-between pt-2 text-xs text-black/50 dark:text-white/50">
                <span>
                  {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
                </span>
                {quiz.latestAttempt ? (
                  <span className="font-medium text-black dark:text-white">
                    Last score: {Math.round(quiz.latestAttempt.scorePercentage)}%
                  </span>
                ) : (
                  <span>Not attempted yet</span>
                )}
              </div>
            </div>
          </Link>
        ))}

        {quizzes.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            No quizzes yet — run <code>pnpm db:seed</code> to load the sample content in{" "}
            <code>content/quizzes/</code>.
          </p>
        )}
      </div>
    </div>
  );
}
