import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getQuizForAdminEdit } from "@/lib/quizzes";
import { renderQuizAsYaml } from "db";
import { EditQuizForm } from "./EditQuizForm";
import type { StructuredQuizEdit } from "./actions";

export default async function EditQuizPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const quiz = await getQuizForAdminEdit(slug);
  if (!quiz) notFound();

  const initial: StructuredQuizEdit = {
    quizId: quiz.id,
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category ?? "",
    thumbnailUrl: quiz.thumbnailUrl ?? "",
    coverImageUrl: quiz.coverImageUrl ?? "",
    questions: quiz.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
    })),
  };

  const { yamlText } = renderQuizAsYaml(quiz);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <Link href="/admin" className="text-sm text-black/60 underline dark:text-white/60">
        ← Back to admin dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Edit: {quiz.title}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          <Link href={`/quizzes/${quiz.slug}`} className="underline">
            View live page
          </Link>
        </p>
      </div>
      <EditQuizForm initial={initial} initialYaml={yamlText} />
    </div>
  );
}
