-- The template's sample quiz app was removed (Sep 2026). Drop its tables on
-- databases that still have them (e.g. the Neon branch it was deployed to).
-- IF EXISTS makes this a no-op on fresh databases.
DROP TABLE IF EXISTS "answers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "attempts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "choices" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "questions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "quizzes" CASCADE;
