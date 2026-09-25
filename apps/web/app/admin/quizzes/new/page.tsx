import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { NewQuizForm } from "./NewQuizForm";

export default async function NewQuizPage() {
  await requireAdmin();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <Link href="/admin" className="text-sm text-black/60 underline dark:text-white/60">
        ← Back to admin dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Add a quiz</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Paste a quiz definition in the same YAML format as{" "}
          <code>content/quizzes/*.yaml</code>. See <code>docs/QUIZZES.md</code> for the full format
          reference.
        </p>
      </div>
      <NewQuizForm />
    </div>
  );
}
