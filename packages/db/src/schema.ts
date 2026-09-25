import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  doublePrecision,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Quiz domain schema.
 *
 * There is deliberately no `users` table here — Clerk is the system of
 * record for identity, and every user-owned row just carries the Clerk
 * user id (`clerkUserId`, a plain text column, same pattern the original
 * scaffold used for `notes`). We never trust a client-submitted user id:
 * every query and mutation re-derives it server-side from `auth()`.
 *
 * The content model splits into two halves on purpose:
 *   - quizzes / questions / choices: the *catalogue* — this is what the
 *     YAML content pipeline (see packages/db/src/content.ts) and the admin
 *     UI both write to. `slug` is the stable identity a YAML file and a
 *     database row agree on, so re-importing the same file is an upsert,
 *     not a duplicate.
 *   - attempts / answers: *live user data* — never touched by the content
 *     pipeline, never exported to YAML, and never deleted by a reseed.
 *
 * Cascading deletes run from quiz -> questions -> choices and from
 * attempt -> answers, which is what makes "delete and recreate a quiz's
 * questions on reseed" a safe, idempotent operation (see seed.ts) without
 * needing to hand-diff question lists.
 */

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    coverImageUrl: text("cover_image_url"),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("quizzes_slug_idx").on(table.slug)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    // Stable identity for the YAML content pipeline, independent of the
    // generated `id`: "capital-of-france" or just an index string like
    // "0". A quiz's own `slug` plays this role for the quizzes table;
    // questions and choices need their own because a quiz has many of
    // them. NULL only for rows a future form-based "create" flow might
    // insert outside the content pipeline — seed.ts and content.ts
    // always set it. See packages/db/src/content.ts for how this makes
    // reseeding an upsert instead of a delete-and-recreate.
    contentKey: text("content_key"),
    prompt: text("prompt").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("questions_quiz_id_idx").on(table.quizId),
    uniqueIndex("questions_quiz_content_key_idx").on(table.quizId, table.contentKey),
  ],
);

export const choices = pgTable(
  "choices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // Same role as questions.contentKey, scoped to the question.
    contentKey: text("content_key"),
    text: text("text").notNull(),
    // Never sent to the client while a quiz is being played — only once
    // an attempt is graded server-side. See app/quizzes/[slug]/play/actions.ts.
    isCorrect: boolean("is_correct").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("choices_question_id_idx").on(table.questionId),
    uniqueIndex("choices_question_content_key_idx").on(table.questionId, table.contentKey),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    score: integer("score").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    // 0-100, stored redundantly alongside score/totalQuestions so
    // "average score" aggregates (avg(scorePercentage)) don't need to
    // recompute a division in every query — see lib/stats.ts.
    scorePercentage: doublePrecision("score_percentage").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attempts_quiz_user_idx").on(table.quizId, table.clerkUserId),
    index("attempts_user_idx").on(table.clerkUserId),
    index("attempts_quiz_completed_idx").on(table.quizId, table.completedAt),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // Nullable: a question can be removed from the catalogue by a reseed
    // after an attempt was recorded, without breaking historical answers.
    choiceId: uuid("choice_id").references(() => choices.id, { onDelete: "set null" }),
    isCorrect: boolean("is_correct").notNull(),
  },
  (table) => [index("answers_attempt_id_idx").on(table.attemptId)],
);

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  questions: many(questions),
  attempts: many(attempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
  choices: many(choices),
  answers: many(answers),
}));

export const choicesRelations = relations(choices, ({ one }) => ({
  question: one(questions, { fields: [choices.questionId], references: [questions.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [attempts.quizId], references: [quizzes.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, { fields: [answers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
  choice: one(choices, { fields: [answers.choiceId], references: [choices.id] }),
}));

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Choice = typeof choices.$inferSelect;
export type NewChoice = typeof choices.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
