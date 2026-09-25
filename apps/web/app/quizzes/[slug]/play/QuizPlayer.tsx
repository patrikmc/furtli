"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQuizAttempt } from "./actions";

type Choice = { id: string; text: string };
type Question = { id: string; prompt: string; choices: Choice[] };

export function QuizPlayer({ slug, questions }: { slug: string; questions: Question[] }) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [isSubmitting, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const question = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const hasSelection = selected[question.id] !== undefined;

  function choose(choiceId: string) {
    setSelected((prev) => ({ ...prev, [question.id]: choiceId }));
  }

  function handleNext() {
    if (!isLastQuestion) {
      setCurrentIndex((i) => i + 1);
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      try {
        const { attemptId } = await submitQuizAttempt(slug, selected);
        router.push(`/quizzes/${slug}/attempts/${attemptId}`);
      } catch {
        setSubmitError("Something went wrong submitting your answers. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between text-sm text-black/50 dark:text-white/50">
        <span>
          Question {currentIndex + 1} of {questions.length}
        </span>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <span
              key={q.id}
              className={`h-1.5 w-5 rounded-full ${
                i < currentIndex || selected[q.id]
                  ? "bg-black dark:bg-white"
                  : "bg-black/15 dark:bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>

      <h1 className="text-xl font-semibold">{question.prompt}</h1>

      <div className="flex flex-col gap-2">
        {question.choices.map((choice) => {
          const isSelected = selected[question.id] === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              data-testid="quiz-choice"
              onClick={() => choose(choice.id)}
              aria-pressed={isSelected}
              className={`rounded border px-4 py-3 text-left text-sm transition ${
                isSelected
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/15 hover:border-black/30 dark:border-white/15 dark:hover:border-white/30"
              }`}
            >
              {choice.text}
            </button>
          );
        })}
      </div>

      {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}

      <button
        type="button"
        disabled={!hasSelection || isSubmitting}
        onClick={handleNext}
        className="self-start rounded bg-black px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {isSubmitting ? "Submitting…" : isLastQuestion ? "Finish quiz" : "Next question"}
      </button>
    </div>
  );
}
