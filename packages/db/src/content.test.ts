import { describe, it, expect } from "vitest";
import { parseQuizContent, QuizContentError } from "./content";

// A minimal, always-valid quiz — every test below mutates a copy of this
// rather than retyping a full quiz, so each test's YAML makes clear
// exactly what it's checking.
const VALID_YAML = `
slug: sample-quiz
title: Sample Quiz
description: A quiz for testing.
questions:
  - key: q1
    prompt: 2 + 2?
    choices:
      - text: "3"
      - text: "4"
        correct: true
      - text: "5"
`;

describe("parseQuizContent", () => {
  it("accepts a well-formed quiz", () => {
    const quiz = parseQuizContent(VALID_YAML, "test.yaml");
    expect(quiz.slug).toBe("sample-quiz");
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0].choices).toHaveLength(3);
  });

  it("rejects invalid YAML syntax", () => {
    expect(() => parseQuizContent("slug: [unterminated", "bad.yaml")).toThrow(QuizContentError);
  });

  it("rejects a slug that isn't lowercase kebab-case", () => {
    const yaml = VALID_YAML.replace("slug: sample-quiz", "slug: Sample Quiz");
    expect(() => parseQuizContent(yaml, "bad-slug.yaml")).toThrow(/kebab-case/);
  });

  it("rejects a question with fewer than 2 choices", () => {
    const yaml = `
slug: sample-quiz
title: Sample Quiz
description: A quiz for testing.
questions:
  - prompt: Only one choice?
    choices:
      - text: Only option
        correct: true
`;
    expect(() => parseQuizContent(yaml, "one-choice.yaml")).toThrow(/at least 2 choices/);
  });

  it("rejects a question with zero choices marked correct", () => {
    const yaml = VALID_YAML.replace("correct: true", "correct: false");
    expect(() => parseQuizContent(yaml, "no-correct.yaml")).toThrow(/exactly one choice/);
  });

  it("rejects a question with more than one choice marked correct", () => {
    const yaml = VALID_YAML.replace('text: "3"', 'text: "3"\n        correct: true');
    expect(() => parseQuizContent(yaml, "two-correct.yaml")).toThrow(/exactly one choice/);
  });

  it("rejects a quiz with no questions", () => {
    const yaml = `
slug: sample-quiz
title: Sample Quiz
description: A quiz for testing.
questions: []
`;
    expect(() => parseQuizContent(yaml, "no-questions.yaml")).toThrow(/at least one question/);
  });

  it("reports every validation failure, not just the first", () => {
    const yaml = `
slug: Bad Slug
title: Sample Quiz
description: A quiz for testing.
questions:
  - prompt: Only one choice?
    choices:
      - text: Only option
`;
    try {
      parseQuizContent(yaml, "multi-error.yaml");
      expect.fail("expected parseQuizContent to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(QuizContentError);
      const message = (err as QuizContentError).message;
      expect(message).toMatch(/kebab-case/);
      expect(message).toMatch(/at least 2 choices/);
    }
  });
});
