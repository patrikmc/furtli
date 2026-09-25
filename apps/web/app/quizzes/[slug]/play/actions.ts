"use server";

import { auth } from "@clerk/nextjs/server";
import { db, quizzes, attempts, answers, eq } from "db";

/**
 * Grades and records a quiz attempt. This is the one place in the app
 * that writes a score — and it never trusts anything the client claims
 * about correctness. `submittedChoices` is just `{ [questionId]:
 * choiceId }`; every question, choice, and `isCorrect` flag used for
 * grading is re-fetched here, fresh, from the database. A client could
 * submit garbage (a choiceId that doesn't belong to the question, an
 * unknown questionId) and the worst that happens is that question is
 * graded as unanswered — it can't invent a correct answer.
 *
 * Deliberately returns the new attempt id instead of calling redirect()
 * itself: this action is invoked directly from a Client Component
 * (QuizPlayer), and having the action navigate vs. having the caller
 * navigate after a plain return is a well-trodden distinction to keep
 * clean — the caller decides what "submitted successfully" should do
 * next (here: router.push to the results screen).
 */
export async function submitQuizAttempt(quizSlug: string, submittedChoices: Record<string, string>) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, quizSlug),
    with: {
      questions: {
        with: { choices: true },
      },
    },
  });
  if (!quiz) throw new Error(`Quiz "${quizSlug}" not found`);

  let score = 0;
  const answerRows = quiz.questions.map((question) => {
    const submittedChoiceId = submittedChoices[question.id];
    // Only accept a choice id that actually belongs to this question —
    // never trust a client-submitted choiceId at face value.
    const chosenChoice = submittedChoiceId
      ? question.choices.find((choice) => choice.id === submittedChoiceId)
      : undefined;
    const isCorrect = chosenChoice?.isCorrect ?? false;
    if (isCorrect) score += 1;

    return {
      questionId: question.id,
      choiceId: chosenChoice?.id ?? null,
      isCorrect,
    };
  });

  const totalQuestions = quiz.questions.length;
  const scorePercentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

  const [attempt] = await db
    .insert(attempts)
    .values({
      quizId: quiz.id,
      clerkUserId: userId,
      score,
      totalQuestions,
      scorePercentage,
    })
    .returning();

  if (answerRows.length > 0) {
    await db.insert(answers).values(answerRows.map((row) => ({ ...row, attemptId: attempt.id })));
  }

  return { attemptId: attempt.id };
}
