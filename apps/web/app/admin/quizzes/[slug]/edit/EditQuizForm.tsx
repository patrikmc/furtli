"use client";

import { useState, useTransition } from "react";
import { updateQuizStructured, type StructuredQuizEdit } from "./actions";
import { createQuizFromYaml } from "../../../quiz-actions";

type Props = {
  initial: StructuredQuizEdit;
  initialYaml: string;
};

export function EditQuizForm({ initial, initialYaml }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isSaving, startSaving] = useTransition();

  const [yamlText, setYamlText] = useState(initialYaml);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [isReplacing, startReplacing] = useTransition();

  function updateQuestionPrompt(qId: string, prompt: string) {
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((question) => (question.id === qId ? { ...question, prompt } : question)),
    }));
  }

  function updateChoiceText(qId: string, cId: string, text: string) {
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((question) =>
        question.id === qId
          ? {
              ...question,
              choices: question.choices.map((choice) => (choice.id === cId ? { ...choice, text } : choice)),
            }
          : question,
      ),
    }));
  }

  function setCorrectChoice(qId: string, cId: string) {
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((question) =>
        question.id === qId
          ? {
              ...question,
              choices: question.choices.map((choice) => ({ ...choice, isCorrect: choice.id === cId })),
            }
          : question,
      ),
    }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startSaving(async () => {
      const result = await updateQuizStructured(quiz);
      if (result.ok) {
        setSavedAt(Date.now());
      } else {
        setError(result.error);
      }
    });
  }

  function handleReplaceFromYaml(e: React.FormEvent) {
    e.preventDefault();
    setYamlError(null);
    startReplacing(async () => {
      const result = await createQuizFromYaml(yamlText);
      if (!result.ok) {
        setYamlError(result.error);
        return;
      }
      // Reload to pick up the freshly upserted rows (ids/keys may have
      // changed if questions were added/removed/reordered in the YAML).
      window.location.reload();
    });
  }

  return (
    <div className="flex flex-col gap-12">
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <h2 className="font-semibold">Quiz details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              value={quiz.title}
              onChange={(e) => setQuiz((q) => ({ ...q, title: e.target.value }))}
              className="rounded border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Category
            <input
              value={quiz.category}
              onChange={(e) => setQuiz((q) => ({ ...q, category: e.target.value }))}
              className="rounded border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Description
            <textarea
              value={quiz.description}
              onChange={(e) => setQuiz((q) => ({ ...q, description: e.target.value }))}
              rows={2}
              className="rounded border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Thumbnail URL
            <input
              value={quiz.thumbnailUrl}
              onChange={(e) => setQuiz((q) => ({ ...q, thumbnailUrl: e.target.value }))}
              className="rounded border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cover image URL
            <input
              value={quiz.coverImageUrl}
              onChange={(e) => setQuiz((q) => ({ ...q, coverImageUrl: e.target.value }))}
              className="rounded border border-black/15 px-3 py-2 dark:border-white/15 dark:bg-transparent"
            />
          </label>
        </div>

        <h2 className="font-semibold">Questions</h2>
        <p className="-mt-4 text-xs text-black/50 dark:text-white/50">
          Edit wording here, or pick a different correct answer. To add, remove, or reorder questions, use
          &quot;Replace from YAML&quot; below instead.
        </p>
        <div className="flex flex-col gap-6">
          {quiz.questions.map((question, qi) => (
            <div key={question.id} className="rounded border border-black/10 p-4 dark:border-white/10">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-black/50 dark:text-white/50">Question {qi + 1}</span>
                <input
                  value={question.prompt}
                  onChange={(e) => updateQuestionPrompt(question.id, e.target.value)}
                  className="rounded border border-black/15 px-3 py-2 font-medium dark:border-white/15 dark:bg-transparent"
                />
              </label>
              <div className="mt-3 flex flex-col gap-2">
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={choice.isCorrect}
                      onChange={() => setCorrectChoice(question.id, choice.id)}
                    />
                    <input
                      value={choice.text}
                      onChange={(e) => updateChoiceText(question.id, choice.id, e.target.value)}
                      className={`flex-1 rounded border px-2 py-1 dark:bg-transparent ${
                        choice.isCorrect
                          ? "border-green-600/40 bg-green-600/5"
                          : "border-black/15 dark:border-white/15"
                      }`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {savedAt && <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="self-start rounded bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          <p className="text-xs text-black/50 dark:text-white/50">
            Live immediately for everyone. Doesn&apos;t touch anyone&apos;s past scores.
          </p>
        </div>
      </form>

      <form onSubmit={handleReplaceFromYaml} className="flex flex-col gap-4 border-t border-black/10 pt-8 dark:border-white/10">
        <div>
          <h2 className="font-semibold">Replace from YAML</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            This is also today&apos;s exported state — copy it into{" "}
            <code>content/quizzes/{quiz.slug}.yaml</code> and commit to make the current state permanent
            (equivalent to running <code>pnpm db:export</code>). Edit and submit here to add, remove, or
            reorder questions.
          </p>
        </div>
        <textarea
          value={yamlText}
          onChange={(e) => setYamlText(e.target.value)}
          spellCheck={false}
          rows={18}
          className="w-full rounded border border-black/15 bg-black/[.02] p-4 font-mono text-xs dark:border-white/15 dark:bg-white/[.02]"
        />
        {yamlError && (
          <pre className="whitespace-pre-wrap rounded border border-red-600/30 bg-red-600/5 p-3 text-xs text-red-700 dark:text-red-400">
            {yamlError}
          </pre>
        )}
        <button
          type="submit"
          disabled={isReplacing}
          className="self-start rounded border border-black/15 px-5 py-2.5 text-sm font-medium disabled:opacity-40 dark:border-white/15"
        >
          {isReplacing ? "Replacing…" : "Replace from YAML"}
        </button>
      </form>
    </div>
  );
}
