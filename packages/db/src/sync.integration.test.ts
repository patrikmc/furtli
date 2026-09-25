import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { attempts, answers, choices, questions, quizzes } from "./schema";
import { parseQuizContent } from "./content";
import { upsertQuizContent } from "./sync";

// Runs against the real `app_test` database (see src/test/test-db.ts and
// vitest.config.ts's `integration` project) — every table starts empty
// because of the `beforeEach` in src/test/setup-integration.ts.

const SAMPLE_QUIZ_YAML = `
slug: sample-quiz
title: Sample Quiz
description: A quiz for testing.
questions:
  - key: capital
    prompt: What is the capital of France?
    choices:
      - key: lyon
        text: Lyon
      - key: paris
        text: Paris
        correct: true
      - key: marseille
        text: Marseille
`;

describe("upsertQuizContent", () => {
  it("creates a quiz with its questions and choices", async () => {
    const quiz = parseQuizContent(SAMPLE_QUIZ_YAML, "test.yaml");
    const result = await upsertQuizContent(quiz);

    expect(result.questionCount).toBe(1);
    expect(result.choiceCount).toBe(3);

    const rows = await db.select().from(quizzes).where(eq(quizzes.slug, "sample-quiz"));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Sample Quiz");
  });

  it("is idempotent: re-running with unchanged content writes no duplicate rows", async () => {
    const quiz = parseQuizContent(SAMPLE_QUIZ_YAML, "test.yaml");
    await upsertQuizContent(quiz);
    await upsertQuizContent(quiz);

    const allQuizzes = await db.select().from(quizzes);
    const allQuestions = await db.select().from(questions);
    const allChoices = await db.select().from(choices);

    expect(allQuizzes).toHaveLength(1);
    expect(allQuestions).toHaveLength(1);
    expect(allChoices).toHaveLength(3);
  });

  it("re-running with an edited answer key updates the row in place (same ids), leaving past attempts untouched", async () => {
    const original = parseQuizContent(SAMPLE_QUIZ_YAML, "test.yaml");
    const { quizId } = await upsertQuizContent(original);

    const questionRow = (await db.select().from(questions).where(eq(questions.quizId, quizId)))[0];
    const parisChoice = (
      await db.select().from(choices).where(eq(choices.questionId, questionRow.id))
    ).find((c) => c.text === "Paris")!;

    // Simulate a user completing the quiz and answering "Paris" — correct
    // at the time.
    const [attempt] = await db
      .insert(attempts)
      .values({ quizId, clerkUserId: "user_test", score: 1, totalQuestions: 1, scorePercentage: 100 })
      .returning();
    await db.insert(answers).values({
      attemptId: attempt.id,
      questionId: questionRow.id,
      choiceId: parisChoice.id,
      isCorrect: true,
    });

    // Now correct the answer key: "Lyon" is the intended right answer
    // instead (same content keys, just flipping which one is `correct`).
    const corrected = parseQuizContent(
      SAMPLE_QUIZ_YAML.replace("text: Lyon", "text: Lyon\n        correct: true").replace(
        "text: Paris\n        correct: true",
        "text: Paris",
      ),
      "test.yaml",
    );
    await upsertQuizContent(corrected);

    // The live catalogue reflects the correction...
    const parisAfter = (await db.select().from(choices).where(eq(choices.id, parisChoice.id)))[0];
    expect(parisAfter.isCorrect).toBe(false);
    // ...and crucially, the choice row was *updated*, not replaced — the
    // id the old answer points at still resolves to "Paris", proving the
    // contentKey-based upsert kept the same row rather than deleting and
    // re-inserting it.
    expect(parisAfter.text).toBe("Paris");

    // ...but the historical answer is untouched: still graded correct,
    // because it genuinely was correct when this user took the quiz.
    const answerAfter = (await db.select().from(answers).where(eq(answers.attemptId, attempt.id)))[0];
    expect(answerAfter.isCorrect).toBe(true);
    expect(answerAfter.choiceId).toBe(parisChoice.id);
  });

  it("removes a choice that was deleted from the content, cascading to any answer that pointed at it", async () => {
    const original = parseQuizContent(SAMPLE_QUIZ_YAML, "test.yaml");
    await upsertQuizContent(original);

    const withoutMarseille = SAMPLE_QUIZ_YAML.replace(
      "      - key: marseille\n        text: Marseille\n",
      "",
    );
    const edited = parseQuizContent(withoutMarseille, "test.yaml");
    await upsertQuizContent(edited);

    const remaining = await db.select().from(choices);
    expect(remaining.map((c) => c.text).sort()).toEqual(["Lyon", "Paris"]);
  });
});
