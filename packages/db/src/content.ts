import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The YAML quiz format — the "textual way to populate a new database from
 * scratch" the quiz app was asked for. One file per quiz under
 * `content/quizzes/`. This is the single source of truth for the catalogue
 * (quizzes/questions/choices); it is never used for attempts/answers,
 * which are live per-user data.
 *
 * `key` on a question or choice is optional and only matters if you care
 * about *editing in place* rather than always appending: two seed runs
 * that give the same question the same `key` update that same database
 * row (see seed.ts) instead of creating a duplicate, which is what makes
 * "correct the answer to question 3" a one-line diff rather than a
 * destructive reseed. If you omit `key`, it defaults to the item's
 * position in the list (`"0"`, `"1"`, ...) — perfectly fine for a quiz
 * you're only ever going to fully replace, but reordering questions
 * without keys will make seed.ts treat them as edits to the wrong row.
 * Give a quiz explicit keys once you start hand-correcting it.
 */

const choiceSchema = z.object({
  key: z.string().min(1).optional(),
  text: z.string().min(1, "choice text can't be empty"),
  correct: z.boolean().optional().default(false),
});

const questionSchema = z.object({
  key: z.string().min(1).optional(),
  prompt: z.string().min(1, "question prompt can't be empty"),
  choices: z
    .array(choiceSchema)
    .min(2, "a question needs at least 2 choices")
    .refine((choices) => choices.filter((c) => c.correct).length === 1, {
      message: "a question must have exactly one choice marked correct: true",
    }),
});

const quizSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase kebab-case, e.g. 'world-capitals'"),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
  questions: z.array(questionSchema).min(1, "a quiz needs at least one question"),
});

export type QuizContent = z.infer<typeof quizSchema>;
export type QuestionContent = z.infer<typeof questionSchema>;
export type ChoiceContent = z.infer<typeof choiceSchema>;

export class QuizContentError extends Error {
  constructor(
    public readonly file: string,
    public readonly issues: string,
  ) {
    super(`Invalid quiz content in ${file}:\n${issues}`);
    this.name = "QuizContentError";
  }
}

/** Parse and validate a single YAML document's already-loaded text. Throws QuizContentError on any validation failure — this pipeline is deliberately fail-fast, not best-effort, since a bad quiz silently loaded is worse than a seed that stops and tells you exactly which file and field is wrong. */
export function parseQuizContent(yamlText: string, sourceLabel: string): QuizContent {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new QuizContentError(sourceLabel, `YAML syntax error: ${(err as Error).message}`);
  }

  const result = quizSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new QuizContentError(sourceLabel, issues);
  }
  return result.data;
}

/** Load and validate every `*.yaml` / `*.yml` file directly under `dir`. Returns quizzes sorted by slug for deterministic output (stable diffs, stable seed order). Throws on the first invalid file, and separately throws if two files declare the same slug — that's a content bug (two quizzes fighting over one catalogue entry), not something seed.ts should silently resolve by "last file wins". */
export function loadQuizContentDir(dir: string): QuizContent[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const parsed = files.map((file) => {
    const text = readFileSync(join(dir, file), "utf-8");
    return { file, quiz: parseQuizContent(text, file) };
  });

  const fileBySlug = new Map<string, string>();
  for (const { file, quiz } of parsed) {
    const previousFile = fileBySlug.get(quiz.slug);
    if (previousFile) {
      throw new Error(
        `Duplicate quiz slug "${quiz.slug}" in both ${previousFile} and ${file} under ${dir}. ` +
          `Each quiz needs a unique slug across the whole content directory.`,
      );
    }
    fileBySlug.set(quiz.slug, file);
  }

  return parsed.map((p) => p.quiz).sort((a, b) => a.slug.localeCompare(b.slug));
}
