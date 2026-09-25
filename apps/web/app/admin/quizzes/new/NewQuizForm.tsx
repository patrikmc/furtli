"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuizFromYaml } from "../../quiz-actions";

const EXAMPLE = `slug: my-new-quiz
title: My New Quiz
description: A short description shown on the quiz overview and detail pages.
category: General Knowledge
thumbnailUrl: https://images.unsplash.com/photo-0000000000?w=400
coverImageUrl: https://images.unsplash.com/photo-0000000000?w=1600

questions:
  - key: q1
    prompt: Your question text here?
    choices:
      - text: First choice
      - text: Second choice
        correct: true
      - text: Third choice
      - text: Fourth choice
`;

export function NewQuizForm() {
  const router = useRouter();
  const [yamlText, setYamlText] = useState(EXAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createQuizFromYaml(yamlText);
      if (result.ok) {
        router.push(`/admin/quizzes/${result.slug}/edit`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <textarea
        value={yamlText}
        onChange={(e) => setYamlText(e.target.value)}
        spellCheck={false}
        rows={22}
        className="w-full rounded border border-black/15 bg-black/[.02] p-4 font-mono text-xs dark:border-white/15 dark:bg-white/[.02]"
      />
      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-600/30 bg-red-600/5 p-3 text-xs text-red-700 dark:text-red-400">
          {error}
        </pre>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {isPending ? "Saving…" : "Save quiz"}
        </button>
        <p className="text-xs text-black/50 dark:text-white/50">
          This writes straight to the live database — every user sees it immediately. To keep it across future
          database setups, run <code>pnpm db:export</code> and commit the resulting file afterward.
        </p>
      </div>
    </form>
  );
}
