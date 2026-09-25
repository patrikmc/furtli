import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getQuizDetail } from "@/lib/quizzes";

export default async function QuizDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  const quiz = await getQuizDetail(slug, userId);
  if (!quiz) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <Link href="/quizzes" className="text-sm text-black/60 underline dark:text-white/60">
        ← Back to quizzes
      </Link>

      {quiz.coverImageUrl && (
        <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
          <Image src={quiz.coverImageUrl} alt="" fill className="object-cover" priority />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          {quiz.category && (
            <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
              {quiz.category}
            </span>
          )}
        </div>
        <p className="text-black/70 dark:text-white/70">{quiz.description}</p>
        <p className="text-sm text-black/50 dark:text-white/50">
          {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
        </p>
      </div>

      {quiz.latestAttempt && (
        <div className="rounded border border-black/10 px-4 py-3 text-sm dark:border-white/10">
          Your last attempt: <strong>{Math.round(quiz.latestAttempt.scorePercentage)}%</strong> (
          {quiz.latestAttempt.score}/{quiz.latestAttempt.totalQuestions} correct)
        </div>
      )}

      <div className="flex gap-3">
        <Link
          href={`/quizzes/${quiz.slug}/play`}
          className="rounded bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {quiz.latestAttempt ? "Retake quiz" : "Start quiz"}
        </Link>
        <Link
          href="/quizzes"
          className="rounded border border-black/15 px-5 py-2.5 text-sm dark:border-white/15"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
