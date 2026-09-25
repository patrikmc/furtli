import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAttemptDetail, getQuizAverageScore } from "@/lib/quizzes";

export default async function AttemptResultsPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const attempt = await getAttemptDetail(attemptId, userId);
  if (!attempt || attempt.quiz.slug !== slug) notFound();

  const { averagePercentage, attemptCount } = await getQuizAverageScore(attempt.quizId);
  const yourPercentage = Math.round(attempt.scorePercentage);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-black/10 py-10 text-center dark:border-white/10">
        <div className="text-sm text-black/50 dark:text-white/50">{attempt.quiz.title}</div>
        <div className="text-5xl font-bold">{yourPercentage}%</div>
        <div className="text-sm text-black/60 dark:text-white/60">
          {attempt.score} of {attempt.totalQuestions} correct
        </div>
        {averagePercentage !== null && (
          <div className="mt-3 text-xs text-black/50 dark:text-white/50">
            Average score across {attemptCount} attempt{attemptCount === 1 ? "" : "s"}:{" "}
            {Math.round(averagePercentage)}%
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Question breakdown</h2>
        {attempt.answers.map((answer, i) => (
          <div
            key={answer.questionId}
            className={`rounded border px-4 py-3 text-sm ${
              answer.isCorrect
                ? "border-green-600/30 bg-green-600/5"
                : "border-red-600/30 bg-red-600/5"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">
                {i + 1}. {answer.prompt}
              </span>
              <span className={answer.isCorrect ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                {answer.isCorrect ? "Correct" : "Incorrect"}
              </span>
            </div>
            <div className="mt-1 text-black/60 dark:text-white/60">
              Your answer: {answer.chosenText}
              {!answer.isCorrect && answer.correctChoiceText && (
                <> — correct answer: {answer.correctChoiceText}</>
              )}
            </div>
            {answer.keyChanged && (
              <div className="mt-1 text-xs italic text-black/40 dark:text-white/40">
                The answer key for this question has been updated since you took this quiz.
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href={`/quizzes/${slug}`}
          className="rounded bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Back to quiz
        </Link>
        <Link href="/profile" className="rounded border border-black/15 px-5 py-2.5 text-sm dark:border-white/15">
          View your profile
        </Link>
      </div>
    </div>
  );
}
