"use server";

import { assertAdmin } from "@/lib/admin";
import { db, quizzes, questions, choices, eq } from "db";
import { revalidatePath } from "next/cache";

export type StructuredQuizEdit = {
  quizId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  coverImageUrl: string;
  questions: {
    id: string;
    prompt: string;
    choices: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

/**
 * Saves edits made through the structured form: existing rows only,
 * matched and updated by their real database `id` (not by contentKey —
 * this form never adds or removes a question/choice, only edits the text
 * and which choice is correct, so there's no upsert-vs-delete ambiguity
 * to resolve here the way there is in sync.ts's upsertQuizContent). Use
 * the "replace from YAML" panel on the same page to add, remove, or
 * reorder questions.
 */
export async function updateQuizStructured(
  edit: StructuredQuizEdit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();

  for (const question of edit.questions) {
    const correctCount = question.choices.filter((c) => c.isCorrect).length;
    if (correctCount !== 1) {
      return {
        ok: false,
        error: `"${question.prompt}" must have exactly one correct choice (has ${correctCount}).`,
      };
    }
    if (question.choices.some((c) => c.text.trim().length === 0)) {
      return { ok: false, error: `"${question.prompt}" has an empty choice.` };
    }
    if (question.prompt.trim().length === 0) {
      return { ok: false, error: "A question prompt can't be empty." };
    }
  }

  await db
    .update(quizzes)
    .set({
      title: edit.title,
      description: edit.description,
      category: edit.category || null,
      thumbnailUrl: edit.thumbnailUrl || null,
      coverImageUrl: edit.coverImageUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(quizzes.id, edit.quizId));

  for (const question of edit.questions) {
    await db
      .update(questions)
      .set({ prompt: question.prompt, updatedAt: new Date() })
      .where(eq(questions.id, question.id));

    for (const choice of question.choices) {
      await db
        .update(choices)
        .set({ text: choice.text, isCorrect: choice.isCorrect })
        .where(eq(choices.id, choice.id));
    }
  }

  revalidatePath("/quizzes");
  revalidatePath("/admin");
  revalidatePath(`/quizzes/${edit.slug}`);
  revalidatePath(`/admin/quizzes/${edit.slug}/edit`);

  return { ok: true };
}
