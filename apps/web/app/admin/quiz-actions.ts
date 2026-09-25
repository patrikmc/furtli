"use server";

import { assertAdmin } from "@/lib/admin";
import { parseQuizContent, QuizContentError, upsertQuizContent } from "db";
import { revalidatePath } from "next/cache";

/**
 * Create (or fully replace) a quiz from pasted YAML — the same format and
 * the same validation/upsert path as `pnpm db:seed` (see
 * packages/db/src/content.ts and sync.ts). This makes the admin UI a
 * convenience layer on top of the content pipeline, not a second,
 * divergent way of writing quiz data.
 *
 * Returns a result object instead of throwing/redirecting on failure, so
 * the form can show the exact validation error next to the textarea the
 * admin is editing, with their draft still in place.
 */
export async function createQuizFromYaml(
  yamlText: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  await assertAdmin();

  let quiz;
  try {
    quiz = parseQuizContent(yamlText, "admin-submitted YAML");
  } catch (err) {
    if (err instanceof QuizContentError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Could not parse YAML." };
  }

  const result = await upsertQuizContent(quiz);

  revalidatePath("/quizzes");
  revalidatePath("/admin");
  revalidatePath(`/quizzes/${result.slug}`);
  revalidatePath(`/admin/quizzes/${result.slug}/edit`);

  return { ok: true, slug: result.slug };
}
