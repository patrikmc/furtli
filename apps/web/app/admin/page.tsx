import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getAdminDashboardStats } from "@/lib/quizzes";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await getAdminDashboardStats();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Aggregated results across every quiz and every user.
          </p>
        </div>
        <Link
          href="/admin/quizzes/new"
          className="shrink-0 rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          + Add quiz
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">{stats.totalQuizzes}</div>
          <div className="text-xs text-black/50 dark:text-white/50">Quizzes</div>
        </div>
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">{stats.totalAttempts}</div>
          <div className="text-xs text-black/50 dark:text-white/50">Total attempts</div>
        </div>
        <div className="rounded border border-black/10 px-4 py-4 text-center dark:border-white/10">
          <div className="text-2xl font-bold">{stats.totalDistinctUsers}</div>
          <div className="text-xs text-black/50 dark:text-white/50">Users who&apos;ve played</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Quizzes</h2>
        <div className="overflow-hidden rounded border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left text-xs uppercase tracking-wide text-black/50 dark:bg-white/5 dark:text-white/50">
              <tr>
                <th className="px-4 py-2 font-medium">Quiz</th>
                <th className="px-4 py-2 font-medium">Questions</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Players</th>
                <th className="px-4 py-2 font-medium">Avg. score</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stats.perQuiz.map((quiz) => (
                <tr key={quiz.quizId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-3 font-medium">{quiz.title}</td>
                  <td className="px-4 py-3">{quiz.questionCount}</td>
                  <td className="px-4 py-3">{quiz.attemptCount}</td>
                  <td className="px-4 py-3">{quiz.distinctUserCount}</td>
                  <td className="px-4 py-3">
                    {quiz.averagePercentage !== null ? `${Math.round(quiz.averagePercentage)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/quizzes/${quiz.slug}/edit`} className="underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {stats.perQuiz.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No quizzes yet.{" "}
                    <Link href="/admin/quizzes/new" className="underline">
                      Add one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
