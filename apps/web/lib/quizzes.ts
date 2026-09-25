import "server-only";
import {
  db,
  quizzes,
  questions,
  choices,
  attempts,
  eq,
  and,
  asc,
  desc,
  inArray,
  avg,
  count,
  type Attempt,
  type Quiz,
} from "db";

/**
 * All the read queries the quiz-taking side of the app needs, in one
 * place. Nothing here is a Server Action (no "use server", no mutations)
 * — this is plain server-side data access, imported directly by Server
 * Components. Grading and attempt-writing lives next to the route that
 * owns it instead (app/quizzes/[slug]/play/actions.ts), since that's the
 * one place a client ever triggers a write.
 *
 * A recurring pattern below: "latest attempt per quiz for this user" is
 * computed in JS from a small, already-user-scoped result set (`WHERE
 * clerk_user_id = $1`, indexed) rather than a `DISTINCT ON` SQL query.
 * That's a deliberate simplicity-over-cleverness call for a template —
 * one user's attempt history is never going to be large. Swap in
 * `DISTINCT ON (quiz_id) ... ORDER BY quiz_id, completed_at DESC` if you
 * ever need this to scale to thousands of attempts per user.
 */

export type QuizOverviewItem = Quiz & {
  questionCount: number;
  latestAttempt: Attempt | null;
};

export async function listQuizzesForOverview(clerkUserId: string | null): Promise<QuizOverviewItem[]> {
  const allQuizzes = await db.query.quizzes.findMany({
    orderBy: (q, { asc }) => [asc(q.title)],
    with: {
      questions: { columns: { id: true } },
    },
  });

  const latestByQuiz = new Map<string, Attempt>();
  if (clerkUserId) {
    const userAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.clerkUserId, clerkUserId))
      .orderBy(desc(attempts.completedAt));
    for (const attempt of userAttempts) {
      if (!latestByQuiz.has(attempt.quizId)) latestByQuiz.set(attempt.quizId, attempt);
    }
  }

  return allQuizzes.map(({ questions: quizQuestions, ...quiz }) => ({
    ...quiz,
    questionCount: quizQuestions.length,
    latestAttempt: latestByQuiz.get(quiz.id) ?? null,
  }));
}

export type QuizDetail = Quiz & {
  questionCount: number;
  latestAttempt: Attempt | null;
};

export async function getQuizDetail(slug: string, clerkUserId: string | null): Promise<QuizDetail | null> {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, slug),
    with: { questions: { columns: { id: true } } },
  });
  if (!quiz) return null;

  let latestAttempt: Attempt | null = null;
  if (clerkUserId) {
    const [row] = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.quizId, quiz.id), eq(attempts.clerkUserId, clerkUserId)))
      .orderBy(desc(attempts.completedAt))
      .limit(1);
    latestAttempt = row ?? null;
  }

  const { questions: quizQuestions, ...rest } = quiz;
  return { ...rest, questionCount: quizQuestions.length, latestAttempt };
}

/**
 * The question set for actually playing a quiz. `choices` is restricted
 * to `{ id, text }` via Drizzle's relational-query `columns` option —
 * `isCorrect` is never selected here, so there's no risk of it leaking to
 * the client through this path even by accident. Grading re-fetches the
 * real rows (including isCorrect) itself, server-side, from the Server
 * Action — this function is for rendering the quiz, not grading it.
 */
export async function getQuizForPlay(slug: string) {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, slug),
    columns: { id: true, slug: true, title: true },
    with: {
      questions: {
        orderBy: (q, { asc }) => [asc(q.sortOrder)],
        columns: { id: true, prompt: true },
        with: {
          choices: {
            orderBy: (c, { asc }) => [asc(c.sortOrder)],
            columns: { id: true, text: true },
          },
        },
      },
    },
  });
  return quiz ?? null;
}

export async function getQuizAverageScore(quizId: string) {
  const [row] = await db
    .select({ avgScore: avg(attempts.scorePercentage), attemptCount: count() })
    .from(attempts)
    .where(eq(attempts.quizId, quizId));

  return {
    // postgres.js returns aggregates as strings to avoid float precision
    // surprises crossing the wire — cast back to number for display.
    averagePercentage: row?.avgScore != null ? Number(row.avgScore) : null,
    attemptCount: row ? Number(row.attemptCount) : 0,
  };
}

/**
 * A completed attempt plus enough detail to render a results screen,
 * scoped to `clerkUserId` so one user can never view another's attempt by
 * guessing an attempt id in the URL.
 *
 * Each answer's `isCorrect` is the historical, frozen-at-grading-time
 * verdict (see schema.ts) — it never changes even if an admin later
 * corrects the quiz's answer key. `correctChoiceText` is looked up
 * against the *current* catalogue, so on a quiz whose key was corrected
 * after this attempt, the two can legitimately disagree; `keyChanged`
 * flags exactly that case so the UI can explain it instead of looking
 * like a bug.
 */
export async function getAttemptDetail(attemptId: string, clerkUserId: string) {
  const attempt = await db.query.attempts.findFirst({
    where: and(eq(attempts.id, attemptId), eq(attempts.clerkUserId, clerkUserId)),
    with: {
      quiz: true,
      answers: {
        with: {
          question: { columns: { id: true, prompt: true, sortOrder: true } },
          choice: { columns: { id: true, text: true } },
        },
      },
    },
  });
  if (!attempt) return null;

  const currentCorrect = await db
    .select({ questionId: choices.questionId, choiceId: choices.id, text: choices.text })
    .from(choices)
    .innerJoin(questions, eq(questions.id, choices.questionId))
    .where(and(eq(questions.quizId, attempt.quizId), eq(choices.isCorrect, true)));
  const correctByQuestion = new Map(currentCorrect.map((c) => [c.questionId, c]));

  const answerDetails = [...attempt.answers]
    .sort((a, b) => (a.question?.sortOrder ?? 0) - (b.question?.sortOrder ?? 0))
    .map((answer) => {
      const currentCorrectChoice = correctByQuestion.get(answer.questionId);
      const isCurrentlyCorrect = currentCorrectChoice ? answer.choiceId === currentCorrectChoice.choiceId : null;
      return {
        questionId: answer.questionId,
        prompt: answer.question?.prompt ?? "(this question has since been removed)",
        chosenText: answer.choice?.text ?? "(no answer)",
        isCorrect: answer.isCorrect,
        correctChoiceText: currentCorrectChoice?.text ?? null,
        keyChanged: isCurrentlyCorrect !== null && isCurrentlyCorrect !== answer.isCorrect,
      };
    });

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    quiz: attempt.quiz,
    clerkUserId: attempt.clerkUserId,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    scorePercentage: attempt.scorePercentage,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    answers: answerDetails,
  };
}

export type ProfileStats = {
  totalAttempts: number;
  distinctQuizzesTaken: number;
  overallAveragePercentage: number | null;
  latestPerQuiz: { quiz: Quiz; attempt: Attempt }[];
};

export async function getProfileStats(clerkUserId: string): Promise<ProfileStats> {
  const userAttempts = await db
    .select()
    .from(attempts)
    .where(eq(attempts.clerkUserId, clerkUserId))
    .orderBy(desc(attempts.completedAt));

  const totalAttempts = userAttempts.length;
  const overallAveragePercentage =
    totalAttempts > 0
      ? userAttempts.reduce((sum, a) => sum + a.scorePercentage, 0) / totalAttempts
      : null;

  const latestByQuiz = new Map<string, Attempt>();
  for (const attempt of userAttempts) {
    if (!latestByQuiz.has(attempt.quizId)) latestByQuiz.set(attempt.quizId, attempt);
  }

  const quizIds = [...latestByQuiz.keys()];
  const quizRows = quizIds.length > 0 ? await db.select().from(quizzes).where(inArray(quizzes.id, quizIds)) : [];
  const quizById = new Map(quizRows.map((q) => [q.id, q]));

  const latestPerQuiz = [...latestByQuiz.entries()]
    .map(([quizId, attempt]) => ({ quiz: quizById.get(quizId)!, attempt }))
    .filter((row) => row.quiz != null)
    .sort((a, b) => b.attempt.completedAt.getTime() - a.attempt.completedAt.getTime());

  return {
    totalAttempts,
    distinctQuizzesTaken: latestByQuiz.size,
    overallAveragePercentage,
    latestPerQuiz,
  };
}

// --- Admin-only queries ---------------------------------------------------
// Everything below is only ever called from app/admin/**, after
// requireAdmin()/assertAdmin() has already run. These return isCorrect and
// cross-user data on purpose — the caller is responsible for the access
// check, not this file.

export type AdminQuizStats = {
  quizId: string;
  slug: string;
  title: string;
  questionCount: number;
  attemptCount: number;
  distinctUserCount: number;
  averagePercentage: number | null;
};

export async function getAdminDashboardStats(): Promise<{
  perQuiz: AdminQuizStats[];
  totalQuizzes: number;
  totalAttempts: number;
  totalDistinctUsers: number;
}> {
  // Deliberately three separate queries rather than one big join: joining
  // quizzes -> attempts -> questions in a single query would fan out (each
  // attempt row would duplicate every question row for that quiz),
  // silently inflating questionCount by attemptCount. Aggregating each
  // relationship independently and merging in JS avoids that entirely.
  const attemptStats = await db
    .select({
      quizId: attempts.quizId,
      attemptCount: count(attempts.id),
      averagePercentage: avg(attempts.scorePercentage),
    })
    .from(attempts)
    .groupBy(attempts.quizId);
  const attemptStatsByQuiz = new Map(attemptStats.map((r) => [r.quizId, r]));

  const questionCounts = await db
    .select({ quizId: questions.quizId, questionCount: count() })
    .from(questions)
    .groupBy(questions.quizId);
  const questionCountByQuiz = new Map(questionCounts.map((r) => [r.quizId, Number(r.questionCount)]));

  const distinctUserRows = await db.selectDistinct({ quizId: attempts.quizId, clerkUserId: attempts.clerkUserId }).from(attempts);
  const usersByQuiz = new Map<string, Set<string>>();
  const allUsers = new Set<string>();
  for (const row of distinctUserRows) {
    allUsers.add(row.clerkUserId);
    if (!usersByQuiz.has(row.quizId)) usersByQuiz.set(row.quizId, new Set());
    usersByQuiz.get(row.quizId)!.add(row.clerkUserId);
  }

  const allQuizzes = await db.select().from(quizzes).orderBy(asc(quizzes.title));

  const perQuiz = allQuizzes.map((quiz) => {
    const stats = attemptStatsByQuiz.get(quiz.id);
    return {
      quizId: quiz.id,
      slug: quiz.slug,
      title: quiz.title,
      questionCount: questionCountByQuiz.get(quiz.id) ?? 0,
      attemptCount: stats ? Number(stats.attemptCount) : 0,
      distinctUserCount: usersByQuiz.get(quiz.id)?.size ?? 0,
      averagePercentage: stats?.averagePercentage != null ? Number(stats.averagePercentage) : null,
    };
  });

  return {
    perQuiz,
    totalQuizzes: perQuiz.length,
    totalAttempts: perQuiz.reduce((sum, q) => sum + q.attemptCount, 0),
    totalDistinctUsers: allUsers.size,
  };
}

/** Full quiz content including `isCorrect` — for the admin edit form only. Never expose this to the quiz-playing flow (see getQuizForPlay, which explicitly omits it). */
export async function getQuizForAdminEdit(slug: string) {
  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, slug),
    with: {
      questions: {
        orderBy: (q, { asc }) => [asc(q.sortOrder)],
        with: {
          choices: {
            orderBy: (c, { asc }) => [asc(c.sortOrder)],
          },
        },
      },
    },
  });
  return quiz ?? null;
}
