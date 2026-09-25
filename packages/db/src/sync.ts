import { eq, and, notInArray } from "drizzle-orm";
import { stringify as stringifyYaml } from "yaml";
import { db } from "./client";
import { choices, questions, quizzes } from "./schema";
import type { QuizContent } from "./content";

/**
 * Upsert a single validated quiz into the database, matching rows by
 * their stable `contentKey` (not by position) so re-running this with an
 * edited quiz updates existing rows in place — see schema.ts and
 * content.ts for why that matters (it's what keeps `answers` rows valid
 * across a reseed instead of cascading them away).
 *
 * This is the one place both entry points into the content pipeline
 * funnel through: the CLI (`seed.ts`, for a whole directory of YAML
 * files) and the admin UI's "paste YAML" flow (apps/web/app/admin/...,
 * for a single quiz at a time). Keeping the upsert logic in exactly one
 * place means a fix or behavior change here applies identically to both.
 */
export async function upsertQuizContent(quiz: QuizContent) {
  const [quizRow] = await db
    .insert(quizzes)
    .values({
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      thumbnailUrl: quiz.thumbnailUrl,
      coverImageUrl: quiz.coverImageUrl,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: quizzes.slug,
      set: {
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        thumbnailUrl: quiz.thumbnailUrl,
        coverImageUrl: quiz.coverImageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  let questionCount = 0;
  let choiceCount = 0;
  const keepQuestionKeys: string[] = [];

  for (const [index, question] of quiz.questions.entries()) {
    const questionKey = question.key ?? String(index);
    keepQuestionKeys.push(questionKey);

    const [questionRow] = await db
      .insert(questions)
      .values({
        quizId: quizRow.id,
        contentKey: questionKey,
        prompt: question.prompt,
        sortOrder: index,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [questions.quizId, questions.contentKey],
        set: {
          prompt: question.prompt,
          sortOrder: index,
          updatedAt: new Date(),
        },
      })
      .returning();
    questionCount += 1;

    const keepChoiceKeys: string[] = [];

    for (const [choiceIndex, choice] of question.choices.entries()) {
      const choiceKey = choice.key ?? String(choiceIndex);
      keepChoiceKeys.push(choiceKey);

      await db
        .insert(choices)
        .values({
          questionId: questionRow.id,
          contentKey: choiceKey,
          text: choice.text,
          isCorrect: choice.correct,
          sortOrder: choiceIndex,
        })
        .onConflictDoUpdate({
          target: [choices.questionId, choices.contentKey],
          set: {
            text: choice.text,
            isCorrect: choice.correct,
            sortOrder: choiceIndex,
          },
        });
      choiceCount += 1;
    }

    if (keepChoiceKeys.length > 0) {
      await db
        .delete(choices)
        .where(
          and(
            eq(choices.questionId, questionRow.id),
            notInArray(choices.contentKey, keepChoiceKeys),
          ),
        );
    }
  }

  if (keepQuestionKeys.length > 0) {
    await db
      .delete(questions)
      .where(and(eq(questions.quizId, quizRow.id), notInArray(questions.contentKey, keepQuestionKeys)));
  }

  return { quizId: quizRow.id, slug: quizRow.slug, questionCount, choiceCount };
}

type QuizForYamlExport = {
  slug: string;
  title: string;
  description: string;
  category: string | null;
  thumbnailUrl: string | null;
  coverImageUrl: string | null;
  questions: {
    contentKey: string | null;
    prompt: string;
    choices: { contentKey: string | null; text: string; isCorrect: boolean }[];
  }[];
};

/**
 * The inverse mapping of upsertQuizContent: a quiz row (with its
 * questions/choices) back to the YAML text format defined in content.ts.
 * Shared by the CLI (`export.ts`, for the whole catalogue) and the admin
 * edit page (for a single quiz's "view/replace as YAML" panel) so both
 * produce byte-identical output for the same data.
 */
export function renderQuizAsYaml(quiz: QuizForYamlExport): { yamlText: string; syntheticKeyCount: number } {
  let syntheticKeyCount = 0;

  const content = {
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    ...(quiz.category ? { category: quiz.category } : {}),
    ...(quiz.thumbnailUrl ? { thumbnailUrl: quiz.thumbnailUrl } : {}),
    ...(quiz.coverImageUrl ? { coverImageUrl: quiz.coverImageUrl } : {}),
    questions: quiz.questions.map((question, qIndex) => {
      if (!question.contentKey) syntheticKeyCount += 1;
      return {
        key: question.contentKey ?? String(qIndex),
        prompt: question.prompt,
        choices: question.choices.map((choice, cIndex) => {
          if (!choice.contentKey) syntheticKeyCount += 1;
          return {
            key: choice.contentKey ?? String(cIndex),
            text: choice.text,
            correct: choice.isCorrect,
          };
        }),
      };
    }),
  };

  return { yamlText: stringifyYaml(content, { lineWidth: 0 }), syntheticKeyCount };
}
