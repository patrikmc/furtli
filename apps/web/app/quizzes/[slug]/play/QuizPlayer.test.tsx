import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuizPlayer } from "./QuizPlayer";

// The component calls the real `submitQuizAttempt` Server Action, which
// itself imports Clerk's `auth()` and the real `db` client — neither of
// which can run in a component test (no request context, no database).
// Mocking the module boundary here is exactly the point of a component
// test: verify what QuizPlayer *does* with the action's result, not what
// the action itself does (that's sync.integration.test.ts's job, one
// layer down, against a real database).
const submitQuizAttempt = vi.fn();
vi.mock("./actions", () => ({
  submitQuizAttempt: (...args: unknown[]) => submitQuizAttempt(...args),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const questions = [
  {
    id: "q1",
    prompt: "What is the capital of France?",
    choices: [
      { id: "c1", text: "Lyon" },
      { id: "c2", text: "Paris" },
    ],
  },
  {
    id: "q2",
    prompt: "What is the capital of Japan?",
    choices: [
      { id: "c3", text: "Osaka" },
      { id: "c4", text: "Tokyo" },
    ],
  },
];

beforeEach(() => {
  submitQuizAttempt.mockReset();
  push.mockReset();
});

describe("QuizPlayer", () => {
  it("disables Next until a choice is selected", async () => {
    render(<QuizPlayer slug="world-capitals" questions={questions} />);

    expect(screen.getByRole("button", { name: /next question/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Paris" }));

    expect(screen.getByRole("button", { name: /next question/i })).toBeEnabled();
  });

  it("advances to the next question without submitting", async () => {
    render(<QuizPlayer slug="world-capitals" questions={questions} />);

    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(screen.getByRole("button", { name: /next question/i }));

    expect(screen.getByText("What is the capital of Japan?")).toBeInTheDocument();
    expect(submitQuizAttempt).not.toHaveBeenCalled();
  });

  it("submits all selected answers and navigates to the results page on the last question", async () => {
    submitQuizAttempt.mockResolvedValue({ attemptId: "attempt-123" });
    render(<QuizPlayer slug="world-capitals" questions={questions} />);

    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(screen.getByRole("button", { name: /next question/i }));

    await userEvent.click(screen.getByRole("button", { name: "Tokyo" }));
    await userEvent.click(screen.getByRole("button", { name: /finish quiz/i }));

    expect(submitQuizAttempt).toHaveBeenCalledWith("world-capitals", { q1: "c2", q2: "c4" });
    expect(push).toHaveBeenCalledWith("/quizzes/world-capitals/attempts/attempt-123");
  });

  it("shows an error and does not navigate if submission fails", async () => {
    submitQuizAttempt.mockRejectedValue(new Error("network error"));
    render(<QuizPlayer slug="world-capitals" questions={[questions[0]]} />);

    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(screen.getByRole("button", { name: /finish quiz/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
